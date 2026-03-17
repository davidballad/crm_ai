"""Transactions Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
from decimal import Decimal
from typing import Any

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.db import query_items, transact_write, get_table, update_item, get_item, put_item
from shared.db import DynamoDBError
from shared.auth import require_auth
from shared.response import success, created, not_found, error, server_error, no_content
from shared.models import Transaction, TransactionItem
from shared.utils import generate_id, now_iso, today_str, build_pk, build_sk, parse_body

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


def _get_method(event: dict[str, Any]) -> str:
    """Extract HTTP method from event."""
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path(event: dict[str, Any]) -> str:
    """Extract path from event."""
    return event.get("path", "") or event.get("rawPath", "")


def _get_path_params(event: dict[str, Any]) -> dict[str, str]:
    """Extract path parameters from event."""
    return event.get("pathParameters") or {}


def _get_query_params(event: dict[str, Any]) -> dict[str, str]:
    """Extract query parameters from event."""
    params = event.get("queryStringParameters") or {}
    return {k: v for k, v in params.items()} if isinstance(params, dict) else {}


def _decode_next_token(token: str) -> dict[str, Any] | None:
    """Decode base64-encoded pagination token to LastEvaluatedKey."""
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any]) -> str:
    """Encode LastEvaluatedKey to base64 pagination token."""
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _transaction_sk(timestamp: str, transaction_id: str) -> str:
    """Build sort key for transaction: TXN#<iso_timestamp>#<id>."""
    return f"TXN#{timestamp}#{transaction_id}"


def list_transactions(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List transactions with pagination and date range filtering."""
    query_params = _get_query_params(event)
    next_token = query_params.get("next_token")
    start_date = query_params.get("start_date")  # YYYY-MM-DD
    end_date = query_params.get("end_date")  # YYYY-MM-DD
    limit = min(int(query_params.get("limit", 50)), 100)

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token) if next_token else None

    try:
        table = get_table()
        key_condition = Key("pk").eq(pk)

        if start_date and end_date:
            sk_start = f"TXN#{start_date}"
            sk_end = f"TXN#{end_date}\uffff"
            key_condition = Key("pk").eq(pk) & Key("sk").between(sk_start, sk_end)
        elif start_date:
            sk_prefix = f"TXN#{start_date}"
            key_condition = key_condition & Key("sk").begins_with(sk_prefix)
        elif end_date:
            sk_start = "TXN#1970-01-01"
            sk_end = f"TXN#{end_date}\uffff"
            key_condition = Key("pk").eq(pk) & Key("sk").between(sk_start, sk_end)
        else:
            key_condition = key_condition & Key("sk").begins_with("TXN#")

        params: dict[str, Any] = {
            "KeyConditionExpression": key_condition,
            "Limit": limit,
            "ScanIndexForward": False,
        }
        if last_key:
            params["ExclusiveStartKey"] = last_key

        response = table.query(**params)
        items = response.get("Items", [])
        last_eval = response.get("LastEvaluatedKey")

        transactions = [Transaction.from_dynamo(i) for i in items]
        result: dict[str, Any] = {
            "transactions": [t.to_dict() for t in transactions]
        }
        if last_eval:
            result["next_token"] = _encode_next_token(last_eval)

        return success(result)
    except ClientError as e:
        return error(str(e), 400)
    except Exception as e:
        return server_error(str(e))


def record_sale(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Record a sale transaction and atomically decrement product quantities.
    Supports idempotency_key: if a transaction with the same key exists, return it.
    """
    try:
        body = parse_body(event)
        transaction = Transaction.from_dynamo(body)
    except Exception as e:
        return error(f"Invalid request body: {e}")

    # Idempotency check: if same key already stored, return existing transaction
    idem_key = transaction.idempotency_key
    if idem_key:
        pk = build_pk(tenant_id)
        existing_items, _ = query_items(pk, sk_prefix="TXN#", limit=200)
        for item in existing_items:
            if item.get("idempotency_key") == idem_key:
                return success(Transaction.from_dynamo(item).to_dict())

    transaction_id = generate_id()
    created_at = now_iso()
    transaction.id = transaction_id
    transaction.created_at = created_at

    pk = build_pk(tenant_id)
    sk = _transaction_sk(created_at, transaction_id)

    table = get_table()
    table_name = table.name

    txn_record: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        **transaction.to_dynamo(),
    }

    transact_items: list[dict[str, Any]] = [
        {"Put": {"TableName": table_name, "Item": txn_record}}
    ]

    for item in transaction.items:
        product_pk = pk
        product_sk = build_sk("PRODUCT", item.product_id)
        transact_items.append(
            {
                "Update": {
                    "TableName": table_name,
                    "Key": {"pk": product_pk, "sk": product_sk},
                    "UpdateExpression": "SET #qty = #qty - :qty_val, updated_at = :now",
                    "ConditionExpression": "#qty >= :qty_val",
                    "ExpressionAttributeNames": {"#qty": "quantity"},
                    "ExpressionAttributeValues": {
                        ":qty_val": item.quantity,
                        ":now": created_at,
                    },
                }
            }
        )

    try:
        transact_write(transact_items)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "TransactionCanceledException":
            reasons = e.response.get("CancellationReasons", [])
            for r in reasons:
                if r.get("Code") == "ConditionalCheckFailed":
                    return error(
                        "Insufficient stock: one or more products do not have enough quantity for this sale",
                        400,
                    )
            return error("Transaction failed: condition check failed", 400)
        return error(str(e), 400)
    except Exception as e:
        return server_error(str(e))

    return created(transaction.to_dict())


def get_transaction(tenant_id: str, transaction_id: str) -> dict[str, Any]:
    """Get a single transaction by ID (queries with pagination until found)."""
    pk = build_pk(tenant_id)
    last_key: dict[str, Any] | None = None

    while True:
        items, last_key = query_items(
            pk, sk_prefix="TXN#", limit=100, last_key=last_key
        )
        for item in items:
            txn = Transaction.from_dynamo(item)
            if txn.id == transaction_id:
                return success(txn.to_dict())
        if not last_key:
            break

    return not_found("Transaction not found")


def patch_transaction(tenant_id: str, transaction_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """PATCH /transactions/{id} — update status (pending → confirmed) and notes."""
    pk = build_pk(tenant_id)

    # Find transaction by scanning TXN# sort keys
    last_key: dict[str, Any] | None = None
    target_sk = None
    while True:
        items, last_key = query_items(pk, sk_prefix="TXN#", limit=100, last_key=last_key)
        for item in items:
            if item.get("id") == transaction_id:
                target_sk = item["sk"]
                break
        if target_sk or not last_key:
            break

    if not target_sk:
        return not_found("Transaction not found")

    try:
        body = parse_body(event)
    except (ValueError, json.JSONDecodeError):
        return error("Invalid JSON body", 400)

    allowed = {"status", "notes", "payment_method", "delivery_method", "delivery_location"}
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed and value is not None:
            updates[key] = value

    if "status" in updates and updates["status"] not in ("pending", "confirmed"):
        return error("status must be 'pending' or 'confirmed'", 400)

    if not updates:
        return error("Nothing to update", 400)

    try:
        updated_item = update_item(pk=pk, sk=target_sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(body=Transaction.from_dynamo(updated_item).to_dict())


def get_daily_summary(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Get daily transaction summary for a given date."""
    query_params = _get_query_params(event)
    date_str = query_params.get("date", today_str())

    pk = build_pk(tenant_id)
    sk_prefix = f"TXN#{date_str}"

    items, _ = query_items(pk, sk_prefix=sk_prefix, limit=500)

    total_revenue = Decimal("0")
    transaction_count = len(items)
    items_sold = 0
    revenue_by_payment_method: dict[str, Decimal] = {}

    for item in items:
        txn = Transaction.from_dynamo(item)
        total_revenue += txn.total
        revenue_by_payment_method[txn.payment_method] = (
            revenue_by_payment_method.get(txn.payment_method, Decimal("0")) + txn.total
        )
        for line in txn.items:
            items_sold += line.quantity

    summary: dict[str, Any] = {
        "date": date_str,
        "total_revenue": float(total_revenue),
        "transaction_count": transaction_count,
        "items_sold": items_sold,
        "revenue_by_payment_method": {
            k: float(v) for k, v in revenue_by_payment_method.items()
        },
    }

    return success(summary)


# -----------------------------------------------------------------------------
# Cart (WhatsApp order flow: add to cart → view cart → checkout)
# -----------------------------------------------------------------------------

def _cart_sk(customer_id: str) -> str:
    """Sort key for cart: CART#<customer_id>. Normalize phone for consistency."""
    cid = (customer_id or "").strip().lstrip("+")
    return f"CART#{cid}"


def _get_customer_id(event: dict[str, Any]) -> str | None:
    """Get customer_id from query (GET) or body (POST). Used for cart endpoints."""
    q = _get_query_params(event)
    if q.get("customer_id"):
        return q["customer_id"]
    try:
        body = parse_body(event)
        return (body or {}).get("customer_id")
    except Exception:
        return None


def get_cart(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /cart?customer_id=<wa_id> — return cart for customer."""
    customer_id = _get_customer_id(event)
    if not customer_id:
        return error("customer_id required (query or body)", 400)
    pk = build_pk(tenant_id)
    sk = _cart_sk(customer_id)
    try:
        item = get_item(pk, sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return success(body={"items": [], "updated_at": None})
    items = item.get("items") or []
    out = [{"product_id": i["product_id"], "product_name": i.get("product_name", ""), "quantity": int(i.get("quantity", 1)), "unit_price": str(i.get("unit_price", "0"))} for i in items]
    return success(body={"items": out, "updated_at": item.get("updated_at")})


def add_cart_item(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /cart/items — body: customer_id, product_id, quantity (optional). Fetches product name/price from inventory."""
    try:
        body = parse_body(event)
    except Exception:
        return error("Invalid JSON body", 400)
    customer_id = (body or {}).get("customer_id")
    product_id = (body or {}).get("product_id")
    if not customer_id or not product_id:
        return error("customer_id and product_id required", 400)
    quantity = max(1, int((body or {}).get("quantity", 1)))
    pk = build_pk(tenant_id)
    product_sk = build_sk("PRODUCT", product_id)
    try:
        product_item = get_item(pk, product_sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not product_item:
        return not_found("Product not found")
    product_name = product_item.get("name") or product_item.get("product_name") or "Item"
    unit_price = product_item.get("unit_cost") or Decimal("0")
    cart_sk = _cart_sk(customer_id)
    cart_item = get_item(pk, cart_sk)
    items = list(cart_item.get("items", [])) if cart_item else []
    found = False
    for i in items:
        if i.get("product_id") == product_id:
            i["quantity"] = int(i.get("quantity", 0)) + quantity
            found = True
            break
    if not found:
        items.append({
            "product_id": product_id,
            "product_name": product_name,
            "quantity": quantity,
            "unit_price": str(unit_price),
        })
    now = now_iso()
    put_item({
        "pk": pk,
        "sk": cart_sk,
        "items": items,
        "updated_at": now,
    })
    return success(body={"items": items, "updated_at": now})


def _normalize_phone(s: str | None) -> str:
    """Normalize phone for comparison (strip + and spaces)."""
    return (s or "").strip().replace(" ", "").lstrip("+")


def _find_contact_by_phone(tenant_id: str, phone: str) -> tuple[dict[str, Any] | None, str | None]:
    """Query contacts by tenant and find one matching phone. Returns (item, contact_id) or (None, None)."""
    if not phone:
        return None, None
    pk = build_pk(tenant_id)
    normalized = _normalize_phone(phone)
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(
            pk=pk,
            sk_prefix="CONTACT#",
            limit=100,
            last_key=last_key,
        )
        for item in items:
            if _normalize_phone(item.get("phone")) == normalized:
                cid = item.get("contact_id") or (item.get("sk", "").split("#")[-1] if "CONTACT#" in item.get("sk", "") else None)
                return item, cid
        if not last_key:
            break
    return None, None


def cart_checkout(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /cart/checkout — body: customer_id, customer_name, customer_phone. Creates transaction from cart, clears cart, returns transaction. Updates or creates contact with total_spent."""
    try:
        body = parse_body(event)
    except Exception:
        return error("Invalid JSON body", 400)
    customer_id = (body or {}).get("customer_id")
    customer_name = (body or {}).get("customer_name") or "Customer"
    customer_phone = (body or {}).get("customer_phone") or customer_id or ""
    if not customer_id:
        return error("customer_id required", 400)
    pk = build_pk(tenant_id)
    cart_sk = _cart_sk(customer_id)
    cart_item = get_item(pk, cart_sk)
    if not cart_item or not cart_item.get("items"):
        return error("Cart is empty", 400)
    items_raw = cart_item["items"]
    total = Decimal("0")
    txn_items: list[TransactionItem] = []
    for i in items_raw:
        qty = int(i.get("quantity", 1))
        price = Decimal(str(i.get("unit_price", "0")))
        txn_items.append(TransactionItem(
            product_id=i["product_id"],
            product_name=i.get("product_name", ""),
            quantity=qty,
            unit_price=price,
        ))
        total += price * qty

    # Resolve contact: find by phone or create, and update total_spent
    contact_id: str | None = None
    contact_item, contact_id = _find_contact_by_phone(tenant_id, customer_phone)
    now = now_iso()
    if contact_item:
        existing_total = contact_item.get("total_spent")
        if existing_total is None:
            current = Decimal("0")
        else:
            current = Decimal(str(existing_total)) if not isinstance(existing_total, Decimal) else existing_total
        new_total = current + total
        try:
            update_item(
                pk=pk,
                sk=contact_item["sk"],
                updates={"total_spent": new_total, "last_activity_ts": now},
            )
        except DynamoDBError as e:
            return server_error(str(e))
        contact_id = contact_item.get("contact_id") or contact_item.get("sk", "").split("#")[-1]
    else:
        # Create contact for this customer so we can track total_spent over time
        contact_id = generate_id()
        contact_sk = build_sk("CONTACT", contact_id)
        try:
            put_item({
                "pk": pk,
                "sk": contact_sk,
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "name": customer_name,
                "phone": customer_phone,
                "source_channel": "whatsapp",
                "lead_status": "prospect",
                "tier": "bronze",
                "total_spent": total,
                "created_ts": now,
            })
        except DynamoDBError as e:
            return server_error(str(e))

    transaction = Transaction(
        items=txn_items,
        total=total,
        payment_method="whatsapp",
        contact_id=contact_id,
        status="pending",
    )
    transaction.id = generate_id()
    transaction.created_at = now
    sk_txn = _transaction_sk(transaction.created_at, transaction.id)
    txn_record = {"pk": pk, "sk": sk_txn, **transaction.to_dynamo()}
    table = get_table()
    table.put_item(Item=txn_record)
    put_item({"pk": pk, "sk": cart_sk, "items": [], "updated_at": now})
    return created(transaction.to_dict())


def clear_cart(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """DELETE /cart — clear cart for customer (query or body: customer_id)."""
    customer_id = _get_customer_id(event)
    if not customer_id:
        return error("customer_id required (query or body)", 400)
    pk = build_pk(tenant_id)
    cart_sk = _cart_sk(customer_id)
    try:
        put_item({
            "pk": pk,
            "sk": cart_sk,
            "items": [],
            "updated_at": now_iso(),
        })
    except DynamoDBError as e:
        return server_error(str(e))
    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Main Lambda handler - routes based on HTTP method and path."""
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path = _get_path(event).rstrip("/")
    path_params = _get_path_params(event)

    # GET /transactions/summary - daily summary (check before /transactions/{id})
    if method == "GET" and path.endswith("/transactions/summary"):
        return get_daily_summary(tenant_id, event)

    # GET /transactions/{id} - get one
    if method == "GET" and path.startswith("/transactions/") and path != "/transactions":
        txn_id = path_params.get("id") or path.split("/")[-1]
        if txn_id != "summary":
            return get_transaction(tenant_id, txn_id)

    # GET /transactions - list
    if method == "GET" and (path == "/transactions" or path.endswith("/transactions")):
        return list_transactions(tenant_id, event)

    # POST /transactions - record sale
    if method == "POST" and (path == "/transactions" or path.endswith("/transactions")):
        return record_sale(tenant_id, event)

    # PATCH /transactions/{id} - update status
    if method == "PATCH" and path.startswith("/transactions/"):
        txn_id = path_params.get("id") or path.split("/")[-1]
        return patch_transaction(tenant_id, txn_id, event)

    # Cart (WhatsApp order flow)
    if method == "GET" and (path == "/cart" or path.endswith("/cart")):
        return get_cart(tenant_id, event)
    if method == "POST" and (path == "/cart/items" or path.endswith("/cart/items")):
        return add_cart_item(tenant_id, event)
    if method == "POST" and (path == "/cart/checkout" or path.endswith("/cart/checkout")):
        return cart_checkout(tenant_id, event)
    if method == "DELETE" and (path == "/cart" or path.endswith("/cart")):
        return clear_cart(tenant_id, event)

    return error("Not found", 404)
