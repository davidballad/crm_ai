"""Messages Lambda: CRUD and conversation history for WhatsApp messages."""

from __future__ import annotations

import base64
import json
import sys
import os
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import extract_tenant_id
from shared.db import get_item, put_item, query_items, update_item
from shared.db import DynamoDBError
from shared.models import Message
from shared.response import created, error, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

MESSAGE_SK_PREFIX = "MESSAGE#"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100
VALID_CATEGORIES = {"active", "incomplete", "closed"}


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
            Message.from_dynamo(item).to_dict()
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

    return created(Message.from_dynamo(item).to_dict())


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
