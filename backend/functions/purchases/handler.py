"""Purchase order Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
import os
import sys
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import (
    DynamoDBError,
    get_item,
    get_table,
    put_item,
    query_items,
    update_item,
)
from shared.models import PurchaseOrder
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

PO_SK_PREFIX = "PO#"


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


def _get_path(event: dict[str, Any]) -> str:
    return event.get("path", "") or event.get("rawPath", "")


def list_purchase_orders(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List purchase orders with optional status filter and pagination."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    status_filter = params.get("status")
    try:
        limit = min(int(params.get("limit", 50)), 100)
    except (TypeError, ValueError):
        limit = 50

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        items, last_eval = query_items(
            pk=pk, sk_prefix=PO_SK_PREFIX, limit=limit, last_key=last_key
        )

        orders = [PurchaseOrder.from_dynamo(i).model_dump(mode="json") for i in items]
        if status_filter:
            orders = [o for o in orders if o.get("status") == status_filter]

        body: dict[str, Any] = {"purchase_orders": orders}
        token = _encode_next_token(last_eval)
        if token:
            body["next_token"] = token

        return success(body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_purchase_order(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a new purchase order in draft status."""
    try:
        body = parse_body(event)
        po = PurchaseOrder.model_validate(body)
    except Exception as e:
        return error(f"Invalid request body: {e}", 400)

    po_id = generate_id()
    now = now_iso()
    po.id = po_id
    po.status = "draft"
    po.created_at = now
    po.updated_at = now

    if po.total_cost is None:
        po.total_cost = sum(
            item.quantity * item.unit_cost for item in po.items
        )

    pk = build_pk(tenant_id)
    sk = build_sk("PO", po_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "PURCHASE_ORDER",
        **po.to_dynamo(),
    }

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(po.model_dump(mode="json"))


def get_purchase_order(tenant_id: str, po_id: str) -> dict[str, Any]:
    """Get a single purchase order by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("PO", po_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("Purchase order not found")

    po = PurchaseOrder.from_dynamo(item).model_dump(mode="json")
    return success(po)


def update_purchase_order(
    tenant_id: str, po_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Update a purchase order. When status changes to 'received', increase product quantities."""
    pk = build_pk(tenant_id)
    sk = build_sk("PO", po_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Purchase order not found")

    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON body", 400)

    old_status = existing.get("status", "draft")
    new_status = body.get("status", old_status)

    valid_transitions = {
        "draft": {"sent", "cancelled"},
        "sent": {"received", "cancelled"},
        "received": set(),
        "cancelled": set(),
    }
    if new_status != old_status and new_status not in valid_transitions.get(old_status, set()):
        return error(
            f"Invalid status transition: {old_status} -> {new_status}. "
            f"Allowed: {valid_transitions.get(old_status, set())}",
            400,
        )

    updates: dict[str, Any] = {"updated_at": now_iso()}
    if "status" in body:
        updates["status"] = new_status
    if "notes" in body:
        updates["notes"] = body["notes"]

    try:
        updated = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    # When status transitions to "received", increase product quantities
    if new_status == "received" and old_status != "received":
        po_items = existing.get("items", [])
        table = get_table()
        for po_item in po_items:
            product_id = po_item.get("product_id")
            qty = po_item.get("quantity", 0)
            if not product_id or qty <= 0:
                continue
            product_sk = build_sk("PRODUCT", product_id)
            try:
                table.update_item(
                    Key={"pk": pk, "sk": product_sk},
                    UpdateExpression="SET quantity = quantity + :qty, updated_at = :now",
                    ExpressionAttributeValues={
                        ":qty": qty,
                        ":now": now_iso(),
                    },
                )
            except Exception:
                pass  # Best-effort; PO is already marked received

    po = PurchaseOrder.from_dynamo(updated).model_dump(mode="json")
    return success(po)


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Route requests based on HTTP method and path."""
    try:
        tenant_id = event.get("tenant_id", "")
        method = _get_method(event)
        path_params = event.get("pathParameters") or {}
        po_id = path_params.get("id")

        if method == "GET" and not po_id:
            return list_purchase_orders(tenant_id, event)

        if method == "POST" and not po_id:
            return create_purchase_order(tenant_id, event)

        if method == "GET" and po_id:
            return get_purchase_order(tenant_id, po_id)

        if method == "PUT" and po_id:
            return update_purchase_order(tenant_id, po_id, event)

        return error("Method not allowed", 405)

    except Exception as e:
        return server_error(str(e))
