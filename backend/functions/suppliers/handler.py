"""Suppliers Lambda handler — CRUD for supplier entities."""

from __future__ import annotations

import base64
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import DynamoDBError, get_item, put_item, query_items, update_item, delete_item
from shared.models import Supplier
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

SUPPLIER_SK_PREFIX = "SUPPLIER#"


def _parse_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        return json.loads(base64.b64decode(token).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _get_method(event: dict[str, Any]) -> str:
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def list_suppliers(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    try:
        limit = min(int(params.get("limit", 100)), 200)
    except (TypeError, ValueError):
        limit = 100

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        items, last_eval = query_items(pk=pk, sk_prefix=SUPPLIER_SK_PREFIX, limit=limit, last_key=last_key)
        suppliers = [Supplier.from_dynamo(i).to_dict() for i in items]
        body: dict[str, Any] = {"suppliers": suppliers}
        token = _encode_next_token(last_eval)
        if token:
            body["next_token"] = token
        return success(body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_supplier(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    try:
        body = parse_body(event)
    except Exception as e:
        return error(f"Invalid request body: {e}", 400)

    name = (body.get("name") or "").strip()
    if not name:
        return error("name is required", 400)

    supplier_id = generate_id()
    now = now_iso()
    supplier = Supplier(
        id=supplier_id,
        name=name,
        contact_email=body.get("contact_email") or None,
        contact_phone=body.get("contact_phone") or None,
        address=body.get("address") or None,
        lead_time_days=_parse_int(body.get("lead_time_days")),
        notes=body.get("notes") or None,
        created_at=now,
        updated_at=now,
    )

    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "SUPPLIER",
        **supplier.to_dynamo(),
    }

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(supplier.to_dict())


def get_supplier(tenant_id: str, supplier_id: str) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("Supplier not found")

    return success(Supplier.from_dynamo(item).to_dict())


def update_supplier(tenant_id: str, supplier_id: str, event: dict[str, Any]) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Supplier not found")

    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON body", 400)

    updates: dict[str, Any] = {"updated_at": now_iso()}
    remove_keys: list[str] = []
    for field in ("name", "contact_email", "contact_phone", "address", "lead_time_days", "notes"):
        if field in body:
            val = body[field]
            if field == "name":
                if not (val or "").strip():
                    return error("name cannot be empty", 400)
                updates[field] = val.strip()
            else:
                coerced = _parse_int(val) if field == "lead_time_days" else (val if val not in ("", None) else None)
                if coerced is None:
                    remove_keys.append(field)
                else:
                    updates[field] = coerced

    try:
        updated = update_item(pk=pk, sk=sk, updates=updates, remove_keys=remove_keys or None)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(Supplier.from_dynamo(updated).to_dict())


def delete_supplier(tenant_id: str, supplier_id: str) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Supplier not found")

    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    try:
        tenant_id = event.get("tenant_id", "")
        method = _get_method(event)
        path_params = event.get("pathParameters") or {}
        supplier_id = path_params.get("id")

        if method == "GET" and not supplier_id:
            return list_suppliers(tenant_id, event)
        if method == "POST" and not supplier_id:
            return create_supplier(tenant_id, event)
        if method == "GET" and supplier_id:
            return get_supplier(tenant_id, supplier_id)
        if method == "PUT" and supplier_id:
            return update_supplier(tenant_id, supplier_id, event)
        if method == "DELETE" and supplier_id:
            return delete_supplier(tenant_id, supplier_id)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
