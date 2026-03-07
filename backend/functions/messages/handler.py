"""Messages Lambda: CRUD, conversation history, and inbound webhook (Meta WhatsApp Cloud API)."""

from __future__ import annotations

import base64
import hmac
import hashlib
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import extract_tenant_id
from shared.db import get_item, put_item, query_items, update_item
from shared.db import DynamoDBError
from shared.models import Message
from shared.response import created, error, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

MESSAGE_SK_PREFIX = "MESSAGE#"
PHONE_PK = "PHONE"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100
META_SIGNATURE_HEADER = "x-hub-signature-256"
VALID_CATEGORIES = {"active", "incomplete", "closed"}


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded) if decoded else None
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _get_raw_body(event: dict[str, Any]) -> bytes:
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(body)
    if isinstance(body, str):
        return body.encode("utf-8")
    return body


def _verify_meta_webhook_signature(event: dict[str, Any], secret: str) -> bool:
    if not secret:
        return False
    raw_body = _get_raw_body(event)
    headers = event.get("headers") or {}
    sig_header = headers.get(META_SIGNATURE_HEADER) or headers.get("X-Hub-Signature-256")
    if not sig_header:
        return False
    expected_sig = sig_header[7:] if sig_header.startswith("sha256=") else sig_header
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected_sig)


def _extract_message_from_meta_payload(body: dict[str, Any]) -> dict[str, Any] | None:
    try:
        entry = (body.get("entry") or [None])[0]
        if not entry:
            return None
        changes = (entry.get("changes") or [None])[0]
        if not changes or changes.get("field") != "messages":
            return None
        value = changes.get("value") or {}
        messages = value.get("messages") or []
        if not messages:
            return None
        msg = messages[0]
        text = ""
        if "text" in msg:
            text = (msg["text"] or {}).get("body") or ""
        to_number = (value.get("metadata") or {}).get("display_phone_number") or ""
        return {
            "from_number": str(msg.get("from") or ""),
            "to_number": str(to_number),
            "text": text,
            "channel_message_id": msg.get("id"),
        }
    except (IndexError, KeyError, TypeError):
        return None


def _resolve_tenant_from_phone(to_number: str) -> str | None:
    if not to_number:
        return None
    normalized = to_number.strip().replace(" ", "").replace("-", "").replace("+", "")
    if not normalized:
        return None
    try:
        item = get_item(pk=PHONE_PK, sk=normalized)
        if item:
            return item.get("tenant_id")
    except DynamoDBError:
        pass
    return None


# ---------------------------------------------------------------------------
# Authenticated endpoints
# ---------------------------------------------------------------------------

def list_messages(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /messages — optional filters: contact_id, channel, category."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    contact_id = params.get("contact_id")
    channel = params.get("channel")
    category = params.get("category")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)
    try:
        items, last_eval = query_items(pk=pk, sk_prefix=MESSAGE_SK_PREFIX, limit=limit, last_key=last_key)
        messages = [Message.from_dynamo(item).model_dump(mode="json") for item in items]
        if contact_id:
            messages = [m for m in messages if m.get("contact_id") == contact_id]
        if channel:
            messages = [m for m in messages if m.get("channel") == channel]
        if category:
            messages = [m for m in messages if m.get("category") == category]
        body: dict[str, Any] = {"messages": messages}
        if _encode_next_token(last_eval):
            body["next_token"] = _encode_next_token(last_eval)
        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def list_contact_messages(tenant_id: str, contact_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /contacts/{id}/messages — conversation history."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)
    try:
        items, last_eval = query_items(pk=pk, sk_prefix=MESSAGE_SK_PREFIX, limit=limit, last_key=last_key)
        messages = [
            Message.from_dynamo(item).model_dump(mode="json")
            for item in items
            if item.get("contact_id") == contact_id
        ]
        body = {"messages": messages}
        if _encode_next_token(last_eval):
            body["next_token"] = _encode_next_token(last_eval)
        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_message(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /messages — store a message (used by n8n or API clients)."""
    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    message_id = generate_id()
    created_ts = now_iso()
    pk = build_pk(tenant_id)
    sk = build_sk("MESSAGE", message_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "message_id": message_id,
        "channel": body.get("channel", "whatsapp"),
        "category": body.get("category", "active"),
        "created_ts": created_ts,
    }
    for field in ("channel_message_id", "from_number", "to_number", "text", "metadata", "contact_id", "processed_flags"):
        if body.get(field) is not None:
            item[field] = body[field]

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(Message.from_dynamo(item).model_dump(mode="json"))


def patch_message_flags(tenant_id: str, message_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """PATCH /messages/{id}/flags — update category and/or processed_flags."""
    pk = build_pk(tenant_id)
    sk = build_sk("MESSAGE", message_id)
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Message not found")

    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    updates: dict[str, Any] = {}
    if "category" in body:
        if body["category"] not in VALID_CATEGORIES:
            return error(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}", 400)
        updates["category"] = body["category"]
    if "processed_flags" in body:
        updates["processed_flags"] = body["processed_flags"]

    if not updates:
        return error("Nothing to update", 400)

    try:
        updated_item = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(body=Message.from_dynamo(updated_item).model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Webhook (no auth)
# ---------------------------------------------------------------------------

def handle_inbound_webhook(event: dict[str, Any]) -> dict[str, Any]:
    """GET = Meta verification; POST = validate HMAC, store message."""
    method = (event.get("requestContext") or {}).get("http", {}).get("method", "GET")

    if method == "GET":
        params = event.get("queryStringParameters") or {}
        hub_mode = params.get("hub.mode") or params.get("hub_mode")
        hub_challenge = params.get("hub.challenge") or params.get("hub_challenge")
        if hub_mode == "subscribe" and hub_challenge:
            return {"statusCode": 200, "headers": {"Content-Type": "text/plain"}, "body": str(hub_challenge)}
        return error("Verification failed", 400)

    secret = os.environ.get("WEBHOOK_SECRET", "").strip()
    if secret and not _verify_meta_webhook_signature(event, secret):
        return error("Invalid signature", 401)

    try:
        body_str = _get_raw_body(event).decode("utf-8")
        body = json.loads(body_str)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    payload = _extract_message_from_meta_payload(body)
    if not payload:
        return success(body={"status": "ignored"})

    to_number = payload.get("to_number") or ""
    tenant_id = _resolve_tenant_from_phone(to_number) or os.environ.get("WEBHOOK_TENANT_ID")
    if not tenant_id:
        return error("Tenant could not be resolved for to_number", 400)

    message_id = generate_id()
    created_ts = now_iso()
    pk = build_pk(tenant_id)
    sk = build_sk("MESSAGE", message_id)

    item = {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "message_id": message_id,
        "channel": "whatsapp",
        "channel_message_id": payload.get("channel_message_id"),
        "from_number": payload.get("from_number"),
        "to_number": to_number,
        "text": payload.get("text"),
        "category": "active",
        "created_ts": created_ts,
    }
    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(body={"message_id": message_id})


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        method = (event.get("requestContext") or {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        path_params = event.get("pathParameters") or {}

        # Webhook: no auth
        if path.rstrip("/").endswith("webhooks/inbound-message"):
            return handle_inbound_webhook(event)

        # Authenticated routes
        tenant_id = extract_tenant_id(event)
        if not tenant_id:
            return error("Unauthorized", 401)

        # GET /contacts/{id}/messages
        if method == "GET" and path.endswith("/messages") and "contacts" in path:
            contact_id = path_params.get("id")
            if contact_id:
                return list_contact_messages(tenant_id, contact_id, event)

        # POST /messages
        if method == "POST" and path.strip("/") == "messages":
            return create_message(tenant_id, event)

        # PATCH /messages/{id}/flags
        if method == "PATCH" and "/flags" in path:
            message_id = path_params.get("id")
            if message_id:
                return patch_message_flags(tenant_id, message_id, event)

        # GET /messages
        if method == "GET" and path.strip("/") == "messages":
            return list_messages(tenant_id, event)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
