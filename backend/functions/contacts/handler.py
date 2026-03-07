"""Contacts CRUD Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import delete_item, get_item, get_table, put_item, query_items, update_item
from shared.db import DynamoDBError
from shared.models import Contact
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

CONTACT_SK_PREFIX = "CONTACT#"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100

VALID_LEAD_STATUSES = {"prospect", "interested", "closed_won", "abandoned"}
VALID_TIERS = {"bronze", "silver", "gold"}


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


def list_contacts(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List contacts with optional phone filter and pagination."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    phone_filter = params.get("phone")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        items, last_eval = query_items(
            pk=pk,
            sk_prefix=CONTACT_SK_PREFIX,
            limit=limit,
            last_key=last_key,
        )
        contacts = [Contact.from_dynamo(item).model_dump(mode="json") for item in items]
        if phone_filter:
            contacts = [c for c in contacts if c.get("phone") == phone_filter]
        next_token_out = _encode_next_token(last_eval)
        body: dict[str, Any] = {"contacts": contacts}
        if next_token_out:
            body["next_token"] = next_token_out
        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_contact(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a new contact (defaults: lead_status=prospect, tier=bronze)."""
    try:
        body = parse_body(event)
        contact_data = Contact.model_validate(body)
    except Exception as e:
        return error(str(e), 400)

    if not contact_data.name:
        return error("name is required", 400)

    contact_id = generate_id()
    created_ts = now_iso()

    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "contact_id": contact_id,
        "name": contact_data.name,
        "lead_status": contact_data.lead_status,
        "tier": contact_data.tier,
        "created_ts": created_ts,
    }
    if contact_data.phone is not None:
        item["phone"] = contact_data.phone
    if contact_data.email is not None:
        item["email"] = contact_data.email
    if contact_data.source_channel is not None:
        item["source_channel"] = contact_data.source_channel
    if contact_data.last_activity_ts is not None:
        item["last_activity_ts"] = contact_data.last_activity_ts
    if contact_data.tags is not None:
        item["tags"] = contact_data.tags

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(Contact.from_dynamo(item).model_dump(mode="json"))


def get_contact(tenant_id: str, contact_id: str) -> dict[str, Any]:
    """Get a single contact by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return not_found("Contact not found")
    return success(body=Contact.from_dynamo(item).model_dump(mode="json"))


def patch_contact(
    tenant_id: str, contact_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Partial update (PATCH): only update provided fields."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Contact not found")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    if not body:
        return error("Request body is required", 400)

    allowed = {
        "name", "phone", "email", "source_channel", "lead_status",
        "tier", "last_activity_ts", "tags",
    }
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed:
            updates[key] = value

    if "lead_status" in updates and updates["lead_status"] not in VALID_LEAD_STATUSES:
        return error(f"lead_status must be one of: {', '.join(sorted(VALID_LEAD_STATUSES))}", 400)
    if "tier" in updates and updates["tier"] not in VALID_TIERS:
        return error(f"tier must be one of: {', '.join(sorted(VALID_TIERS))}", 400)
    if "name" in updates and not updates["name"]:
        return error("name cannot be empty", 400)

    try:
        updated_item = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(body=Contact.from_dynamo(updated_item).model_dump(mode="json"))


def update_contact(
    tenant_id: str, contact_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Full update (PUT) -- delegates to patch logic."""
    return patch_contact(tenant_id, contact_id, event)


def delete_contact(tenant_id: str, contact_id: str) -> dict[str, Any]:
    """Delete a contact."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route requests by method and path."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path_params = event.get("pathParameters") or {}
        contact_id = path_params.get("id")
        tenant_id = event.get("tenant_id", "")

        if method == "GET" and not contact_id:
            return list_contacts(tenant_id, event)
        if method == "POST" and not contact_id:
            return create_contact(tenant_id, event)
        if method == "GET" and contact_id:
            return get_contact(tenant_id, contact_id)
        if method == "PATCH" and contact_id:
            return patch_contact(tenant_id, contact_id, event)
        if method == "PUT" and contact_id:
            return update_contact(tenant_id, contact_id, event)
        if method == "DELETE" and contact_id:
            return delete_contact(tenant_id, contact_id)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
