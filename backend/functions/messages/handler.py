"""Messages Lambda: CRUD and conversation history for WhatsApp messages."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import extract_tenant_id
from shared.db import DynamoDBError, get_item, put_item, query_items, update_item
from shared.models import ConversationSummary, Message
from shared.response import created, error, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body, normalize_phone

GRAPH_API_VERSION = "v21.0"

MESSAGE_SK_PREFIX = "MESSAGE#"
CONVO_SK_PREFIX = "CONVO#"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100
CONTACT_HISTORY_MAX_PAGES = 40
VALID_CATEGORIES = {"activo", "inactivo", "vendido", "cerrado"}
VALID_DIRECTIONS = {"inbound", "outbound"}


def _customer_phone_for_message(direction: str | None, from_number: str | None, to_number: str | None) -> str:
    """Pick the 'customer phone' for a message, used to key conversation summary."""
    d = (direction or "").strip().lower()
    if d == "inbound":
        return normalize_phone(from_number)
    if d == "outbound":
        return normalize_phone(to_number)
    # Fallback: prefer from_number
    return normalize_phone(from_number) or normalize_phone(to_number)


def _upsert_conversation_summary(
    *,
    tenant_id: str,
    direction: str | None,
    from_number: str | None,
    to_number: str | None,
    text: str | None,
    category: str | None,
    created_ts: str,
) -> None:
    pk = build_pk(tenant_id)
    customer_phone = _customer_phone_for_message(direction, from_number, to_number)
    if not customer_phone:
        return
    sk = f"{CONVO_SK_PREFIX}{customer_phone}"

    existing = get_item(pk=pk, sk=sk)
    
    # Priority logic: don't let a normal message downgrade a 'vendido' or 'cerrado' status
    # unless the new category is also high priority OR it's a re-opening trigger.
    final_category = category
    if existing:
        current_cat = (existing.get("category") or "activo").lower()
        new_cat = (category or "").lower()
        
        is_inbound = (direction or "").strip().lower() == "inbound"

        # Protected status handling:
        if current_cat in ["vendido", "cerrado"] and new_cat not in ["vendido", "cerrado"]:
            # If no explicit category is provided (normal message flow), check for re-opening
            if is_inbound and not category:
                if current_cat == "cerrado":
                    # Closed conversations always re-open on message
                    final_category = "activo"
                elif current_cat == "vendido":
                    # Sold conversations re-open only after 24h gap
                    updated_at_str = existing.get("updated_at") or existing.get("last_message_ts") or ""
                    try:
                        # Normalize string to isoformat for python
                        ts_norm = updated_at_str.replace("Z", "+00:00")
                        updated_at = datetime.fromisoformat(ts_norm)
                        
                        # 24h Safety Window
                        if datetime.now(timezone.utc) - updated_at > timedelta(hours=24):
                            final_category = "activo"
                        else:
                            final_category = current_cat # Keep sold
                    except (ValueError, TypeError):
                        final_category = current_cat # Default to protect the status if time unknown
            else:
                # It's an outbound message or an explicit status update, keep the current protected status
                final_category = current_cat 

    updates: dict[str, Any] = {
        "tenant_id": tenant_id,
        "customer_phone": customer_phone,
        "channel": "whatsapp",
        "updated_at": now_iso(),
        "last_message_ts": created_ts,
        "last_direction": (direction or "").strip().lower() or None,
        "last_text": (text or "").strip()[:4000] if isinstance(text, str) else None,
    }
    if final_category:
        updates["category"] = final_category
    if (direction or "").strip().lower() == "inbound":
        updates["last_inbound_ts"] = created_ts
    if (direction or "").strip().lower() == "outbound":
        updates["last_outbound_ts"] = created_ts

    if not existing:
        item = {"pk": pk, "sk": sk, **ConversationSummary.from_dynamo(updates).to_dynamo()}
        put_item(item)
        return

    # Only move timestamps forward if this message is newer.
    if (existing.get("last_message_ts") or "") > created_ts:
        # Still allow category update if provided and it respects priority
        if final_category:
            update_item(pk=pk, sk=sk, updates={"category": final_category, "updated_at": now_iso()})
        return

    update_item(pk=pk, sk=sk, updates=updates)


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


def list_conversations(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /conversations — fast list for inbox/reminders. Optional filters: category, phone."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    category = (params.get("category") or "").strip().lower()
    phone = normalize_phone(params.get("phone"))
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)
    try:
        items, last_eval = query_items(pk=pk, sk_prefix=CONVO_SK_PREFIX, limit=limit, last_key=last_key)
        convos = [ConversationSummary.from_dynamo(item).to_dict() for item in items]
        if phone:
            convos = [c for c in convos if normalize_phone(c.get("customer_phone")) == phone]
        body: dict[str, Any] = {"conversations": convos}
        if _encode_next_token(last_eval):
            body["next_token"] = _encode_next_token(last_eval)
        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def list_conversation_messages(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /conversations/{phone}/messages — thread messages for a phone (fast indexed GSI lookup)."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    phone_norm = normalize_phone(customer_phone)
    if not phone_norm:
        return error("phone is required", 400)

    last_key = _decode_next_token(next_token)
    try:
        # High-performance GSI1 query: directly fetch messages for this specific phone.
        items, last_eval = query_items(
            pk=f"PHONE#{phone_norm}",
            sk_prefix="MSG#",
            limit=limit,
            last_key=last_key,
            scan_index_forward=False,  # Newest first
            index_name="GSI1",
            pk_attr="gsi1pk",
            sk_attr="gsi1sk",
        )
        # Convert items to dicts and sort chronologically for UI display.
        messages = [Message.from_dynamo(item).to_dict() for item in items]
        messages.sort(key=lambda m: (m.get("created_ts") or ""))
        
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
            contact_phone_norm = normalize_phone(contact_item.get("phone"))
    except DynamoDBError:
        pass

    last_key = _decode_next_token(next_token)
    try:
        # Iterate pages until we collect enough matches for this contact.
        out: list[dict[str, Any]] = []
        page_key = last_key
        last_eval: dict[str, Any] | None = None
        for _ in range(CONTACT_HISTORY_MAX_PAGES):
            items, last_eval = query_items(
                pk=pk,
                sk_prefix=MESSAGE_SK_PREFIX,
                limit=LIMIT_MAX,
                last_key=page_key,
                scan_index_forward=False,
            )
            for item in items:
                if item.get("contact_id") == contact_id:
                    out.append(Message.from_dynamo(item).to_dict())
                    continue
                if contact_phone_norm:
                    from_n = normalize_phone(item.get("from_number"))
                    to_n = normalize_phone(item.get("to_number"))
                    if from_n == contact_phone_norm or to_n == contact_phone_norm:
                        out.append(Message.from_dynamo(item).to_dict())
                if len(out) >= limit:
                    break
            if len(out) >= limit or not last_eval:
                break
            page_key = last_eval

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
        "category": body.get("category"), # Removed hardcoded default
        "created_ts": created_ts,
    }
    direction = (body.get("direction") or "").strip().lower() or None
    
    # Populate GSI1 for fast lookup by phone
    customer_phone = _customer_phone_for_message(direction, body.get("from_number"), body.get("to_number"))
    if customer_phone:
        item["gsi1pk"] = f"PHONE#{customer_phone}"
        item["gsi1sk"] = f"MSG#{created_ts}#{message_id}"
    if direction and direction not in VALID_DIRECTIONS:
        return error(f"direction must be one of: {', '.join(sorted(VALID_DIRECTIONS))}", 400)
    if direction:
        item["direction"] = direction

    for field in (
        "channel_message_id",
        "from_number",
        "to_number",
        "text",
        "metadata",
        "contact_id",
        "processed_flags",
    ):
        if body.get(field) is not None:
            item[field] = body[field]

    try:
        put_item(item)
        _upsert_conversation_summary(
            tenant_id=tenant_id,
            direction=item.get("direction"),
            from_number=item.get("from_number"),
            to_number=item.get("to_number"),
            text=item.get("text"),
            category=item.get("category"),
            created_ts=created_ts,
        )
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
        "direction": "outbound",
        "from_number": business_phone,
        "to_number": to_number,
        "text": text,
        "category": body.get("category"),
        "created_ts": created_ts,
        # GSI1 for fast search
        "gsi1pk": f"PHONE#{normalize_phone(to_number)}",
        "gsi1sk": f"MSG#{created_ts}#{message_id}"
    }
    try:
        put_item(item)
        _upsert_conversation_summary(
            tenant_id=tenant_id,
            direction="outbound",
            from_number=item.get("from_number"),
            to_number=item.get("to_number"),
            text=item.get("text"),
            category=item.get("category"),
            created_ts=created_ts,
        )
    except DynamoDBError:
        return server_error("Failed to store message")

    return created(Message.from_dynamo(item).to_dict())


def _find_latest_message_for_phone(pk: str, customer_phone: str) -> dict[str, Any] | None:
    """Find the latest message in the conversation thread for this customer phone using GSI1."""
    phone_norm = normalize_phone(customer_phone)
    if not phone_norm:
        return None
    try:
        items, _ = query_items(
            pk=f"PHONE#{phone_norm}",
            sk_prefix="MSG#",
            limit=1,
            scan_index_forward=False, # Newest first
            index_name="GSI1",
            pk_attr="gsi1pk",
            sk_attr="gsi1sk",
        )
        return items[0] if items else None
    except DynamoDBError:
        return None


def mark_conversation(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /messages/mark-conversation — set latest message category to activo, inactivo, vendido, or cerrado."""
    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    from_number = (body.get("from_number") or "").strip()
    raw_category = (body.get("category") or "").strip().lower()
    if not from_number:
        return error("from_number is required", 400)

    # Legacy mapping for n8n / existing callers
    category_map = {
        "active": "activo",
        "incomplete": "inactivo",
        "abandoned": "inactivo",
        "ventas": "vendido",
        "closed": "cerrado",
    }
    category = category_map.get(raw_category, raw_category)

    if category not in VALID_CATEGORIES:
        return error(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}", 400)

    pk = build_pk(tenant_id)
    try:
        # Update summary first (cheap), even if messages are very large.
        convo_sk = f"{CONVO_SK_PREFIX}{normalize_phone(from_number)}"
        existing_convo = get_item(pk=pk, sk=convo_sk)
        if existing_convo:
            update_item(pk=pk, sk=convo_sk, updates={"category": category, "updated_at": now_iso()})

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
        convo_sk = f"{CONVO_SK_PREFIX}{normalize_phone(from_number)}"
        existing_convo = get_item(pk=pk, sk=convo_sk)
        if existing_convo:
            update_item(pk=pk, sk=convo_sk, updates={"category": "cerrado", "updated_at": now_iso()})

        latest_msg = _find_latest_message_for_phone(pk, from_number)
        if not latest_msg:
            return success(body={"message": "No conversation found", "closed": False})
        updated = update_item(pk=pk, sk=latest_msg["sk"], updates={"category": "cerrado"})
        msg = Message.from_dynamo(updated)
        return success(body={"message_id": msg.message_id, "category": "cerrado", "closed": True})
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

    # Best-effort: if category changed, mirror to conversation summary.
    try:
        if "category" in updates:
            direction = updated_item.get("direction")
            convo_phone = _customer_phone_for_message(direction, updated_item.get("from_number"), updated_item.get("to_number"))
            if convo_phone:
                convo_sk = f"{CONVO_SK_PREFIX}{convo_phone}"
                existing_convo = get_item(pk=pk, sk=convo_sk)
                if existing_convo:
                    update_item(pk=pk, sk=convo_sk, updates={"category": updates["category"], "updated_at": now_iso()})
    except DynamoDBError:
        pass

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

        # POST /messages/mark-conversation (n8n reminder flow: category = incomplete | abandoned | closed)
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

        # GET /conversations
        if method == "GET" and path.strip("/") == "conversations":
            return list_conversations(tenant_id, event)

        # GET /conversations/{phone}/messages
        if method == "GET" and path.endswith("/messages") and "conversations" in path:
            phone = path_params.get("phone")
            if phone:
                return list_conversation_messages(tenant_id, phone, event)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
