"""Messages Lambda: CRUD and conversation history for WhatsApp messages."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import extract_tenant_id
from shared.db import DynamoDBError, get_item, put_item, query_items, update_item
from shared.models import Message
from shared.response import created, error, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

GRAPH_API_VERSION = "v21.0"

MESSAGE_SK_PREFIX = "MESSAGE#"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100
VALID_CATEGORIES = {"active", "incomplete", "closed"}


def _normalize_phone(s: str | None) -> str:
    """Normalize phone for comparison (digits only)."""
    raw = (s or "").strip()
    if not raw:
        return ""
    return "".join(ch for ch in raw if ch.isdigit())


# ---------------------------------------------------------------------------
# Pagination helpers
# ---------------------------------------------------------------------------

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
        messages = [Message.from_dynamo(item).to_dict() for item in items]
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
    """GET /contacts/{id}/messages — conversation history. Includes messages linked by contact_id or by contact phone."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    contact_phone_norm = ""
    try:
        contact_item = get_item(pk=pk, sk=build_sk("CONTACT", contact_id))
        if contact_item and contact_item.get("phone"):
            contact_phone_norm = _normalize_phone(contact_item.get("phone"))
    except DynamoDBError:
        pass

    last_key = _decode_next_token(next_token)
    try:
        # Fetch enough items to find messages for this contact (by contact_id or phone)
        items, last_eval = query_items(pk=pk, sk_prefix=MESSAGE_SK_PREFIX, limit=LIMIT_MAX, last_key=last_key)
        out: list[dict[str, Any]] = []
        for item in items:
            if item.get("contact_id") == contact_id:
                out.append(Message.from_dynamo(item).to_dict())
                continue
            if contact_phone_norm:
                from_n = _normalize_phone(item.get("from_number"))
                to_n = _normalize_phone(item.get("to_number"))
                if from_n == contact_phone_norm or to_n == contact_phone_norm:
                    out.append(Message.from_dynamo(item).to_dict())
        out.sort(key=lambda m: (m.get("created_ts") or ""))
        body = {"messages": out[:limit]}
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

    return created(Message.from_dynamo(item).to_dict())


def send_message(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /messages/send — send WhatsApp text via Graph API and store outbound message. JWT auth."""
    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    to_number = (body.get("to_number") or "").strip()
    text = (body.get("text") or "").strip()
    if not to_number or not text:
        return error("to_number and text are required", 400)

    pk_tenant = build_pk(tenant_id)
    sk_tenant = build_sk("TENANT", tenant_id)
    try:
        tenant = get_item(pk=pk_tenant, sk=sk_tenant)
    except DynamoDBError as e:
        return server_error(str(e))
    if not tenant:
        return error("Tenant not found", 404)

    access_token = (tenant.get("meta_access_token") or "").strip()
    phone_number_id = (tenant.get("meta_phone_number_id") or "").strip()
    if not access_token or not phone_number_id:
        return error(
            "WhatsApp not configured. Set Meta Access Token and Phone Number ID in Connect WhatsApp.",
            400,
        )

    to_wa = to_number.lstrip("+").replace(" ", "")
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_wa,
        "type": "text",
        "text": {"body": text},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            graph_body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else "{}"
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("error", {}).get("message", err_body)
        except (ValueError, TypeError):
            msg = err_body
        return error(f"WhatsApp API error: {msg}", e.code if 400 <= e.code < 600 else 502)
    except (OSError, TimeoutError) as e:
        return server_error(f"Request to WhatsApp failed: {e}")

    message_id = generate_id()
    created_ts = now_iso()
    business_phone = (tenant.get("phone_number") or "").strip() or None
    pk = build_pk(tenant_id)
    sk = build_sk("MESSAGE", message_id)
    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "message_id": message_id,
        "channel": "whatsapp",
        "channel_message_id": graph_body.get("messages", [{}])[0].get("id") if isinstance(graph_body.get("messages"), list) else None,
        "from_number": business_phone,
        "to_number": to_number,
        "text": text,
        "category": "active",
        "created_ts": created_ts,
    }
    try:
        put_item(item)
    except DynamoDBError:
        return server_error("Failed to store message")

    return created(Message.from_dynamo(item).to_dict())


def _find_latest_message_for_phone(pk: str, customer_phone: str) -> dict[str, Any] | None:
    """Find the latest message in the conversation thread for this customer phone."""
    normalized = (customer_phone or "").strip().replace(" ", "")
    if not normalized:
        return None
    latest_msg: dict[str, Any] | None = None
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(
            pk=pk, sk_prefix=MESSAGE_SK_PREFIX, limit=LIMIT_MAX, last_key=last_key,
        )
        for item in items:
            item_from = (item.get("from_number") or "").replace(" ", "")
            item_to = (item.get("to_number") or "").replace(" ", "")
            if item_from == normalized or item_to == normalized:
                if latest_msg is None or (item.get("created_ts") or "") > (latest_msg.get("created_ts") or ""):
                    latest_msg = item
        if not last_key:
            break
    return latest_msg


def mark_conversation(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /messages/mark-conversation — set latest message category to incomplete or closed. For n8n 20h/24h flow."""
    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    from_number = (body.get("from_number") or "").strip()
    category = (body.get("category") or "").strip().lower()
    if not from_number:
        return error("from_number is required", 400)
    if category not in VALID_CATEGORIES:
        return error(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}", 400)

    pk = build_pk(tenant_id)
    try:
        latest_msg = _find_latest_message_for_phone(pk, from_number)
        if not latest_msg:
            return success(body={"message": "No conversation found", "updated": False})
        update_item(pk=pk, sk=latest_msg["sk"], updates={"category": category})
        return success(body={"message_id": latest_msg.get("message_id"), "category": category, "updated": True})
    except DynamoDBError as e:
        return server_error(str(e))


def mark_conversation_closed(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /messages/mark-conversation-closed — set latest message for a phone to closed (checkout flow)."""
    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    from_number = (body.get("from_number") or "").strip()
    if not from_number:
        return error("from_number is required", 400)

    pk = build_pk(tenant_id)
    try:
        latest_msg = _find_latest_message_for_phone(pk, from_number)
        if not latest_msg:
            return success(body={"message": "No conversation found", "closed": False})
        updated = update_item(pk=pk, sk=latest_msg["sk"], updates={"category": "closed"})
        msg = Message.from_dynamo(updated)
        return success(body={"message_id": msg.message_id, "category": "closed", "closed": True})
    except DynamoDBError as e:
        return server_error(str(e))


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

    return success(body=Message.from_dynamo(updated_item).to_dict())


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route message requests. All routes require auth (JWT or service key)."""
    try:
        method = (event.get("requestContext") or {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        path_params = event.get("pathParameters") or {}

        tenant_id = extract_tenant_id(event)
        if not tenant_id:
            return error("Unauthorized", 401)

        # GET /contacts/{id}/messages
        if method == "GET" and path.endswith("/messages") and "contacts" in path:
            contact_id = path_params.get("id")
            if contact_id:
                return list_contact_messages(tenant_id, contact_id, event)

        # POST /messages/mark-conversation (20h/24h n8n flow: category = incomplete | closed)
        if method == "POST" and path.strip("/") == "messages/mark-conversation":
            return mark_conversation(tenant_id, event)

        # POST /messages/mark-conversation-closed
        if method == "POST" and "/messages/mark-conversation-closed" in path:
            return mark_conversation_closed(tenant_id, event)

        # POST /messages/send — send WhatsApp message from UI (JWT only)
        if method == "POST" and "/messages/send" in path:
            return send_message(tenant_id, event)

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
