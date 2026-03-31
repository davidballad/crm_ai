"""Transactions Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
import mimetypes
import urllib.request
from decimal import Decimal
from typing import Any

import sys
import os
import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.db import query_items, transact_write, get_table, update_item, get_item, put_item, delete_item
from shared.db import DynamoDBError
from shared.auth import require_auth
from shared.response import success, created, not_found, error, server_error, no_content
from shared.models import Transaction, TransactionItem
from shared.utils import generate_id, now_iso, today_str, build_pk, build_sk, parse_body

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

GRAPH_API_VERSION = "v21.0"
PAYMENT_STATUS_AWAITING = "awaiting_verification"
PAYMENT_STATUS_VERIFIED = "verified"
ORDER_NOTES_MAX_LEN = 300
TIER_BRONZE_MAX = Decimal("30")
TIER_SILVER_MAX = Decimal("100")
DELIVERY_STATUS_VALUES = {
    "awaiting_customer_choice",
    "awaiting_location_window",
    "pending_owner_approval",
    "owner_approved",
    "owner_rejected",
    "pickup_pending",
    "pickup_confirmed",
}

_s3_client = boto3.client("s3")


def _inventory_stock_qty(product_item: dict[str, Any]) -> int:
    q = product_item.get("quantity", 0)
    if isinstance(q, Decimal):
        return max(int(q), 0)
    try:
        return max(int(q or 0), 0)
    except (TypeError, ValueError):
        return 0


def _tier_from_total_spent(total_spent: Decimal) -> str:
    """Auto-tier thresholds: bronze < 30, silver 30-99.99, gold >= 100."""
    if total_spent < TIER_BRONZE_MAX:
        return "bronze"
    if total_spent < TIER_SILVER_MAX:
        return "silver"
    return "gold"


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


def _normalize_phone(phone: str | None) -> str:
    return "".join(ch for ch in str(phone or "") if ch.isdigit())


def _build_payment_reference(transaction_id: str) -> str:
    suffix = "".join(ch for ch in transaction_id if ch.isalnum())[-8:].upper()
    return f"PAY-{suffix}" if suffix else "PAY-UNKNOWN"


def _transaction_response(item: dict[str, Any], include_proof_url: bool = False) -> dict[str, Any]:
    data = Transaction.from_dynamo(item).to_dict()
    data["has_payment_proof"] = bool(item.get("payment_proof_s3_key"))
    if include_proof_url and item.get("payment_proof_s3_key"):
        data["payment_proof_url"] = _build_presigned_proof_url(item.get("payment_proof_s3_key"))
    return data


def _build_presigned_proof_url(s3_key: str | None) -> str | None:
    if not s3_key:
        return None
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        return None
    try:
        return _s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=3600,
        )
    except Exception:
        return None


def _auto_attach_proof_from_messages(tenant_id: str, transaction_item: dict[str, Any]) -> dict[str, Any]:
    """Best effort: if no proof stored, find latest inbound image message for this customer and attach it."""
    if transaction_item.get("payment_proof_s3_key"):
        return transaction_item
    if transaction_item.get("payment_verification_status") != PAYMENT_STATUS_AWAITING:
        return transaction_item

    customer_phone = _normalize_phone(transaction_item.get("customer_phone"))
    if not customer_phone:
        return transaction_item

    created_after = transaction_item.get("created_at") or ""
    pk = build_pk(tenant_id)
    last_key: dict[str, Any] | None = None
    selected_media_id = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="MESSAGE#", limit=100, last_key=last_key)
        for item in items:
            metadata = item.get("metadata") or {}
            media_id = metadata.get("media_id")
            message_type = metadata.get("message_type")
            if not media_id or message_type not in {"image", "document", "video"}:
                continue
            if _normalize_phone(item.get("from_number")) != customer_phone:
                continue
            created_ts = item.get("created_ts") or ""
            if created_after and created_ts and created_ts < created_after:
                continue
            selected_media_id = media_id
            break
        if selected_media_id or not last_key:
            break

    if not selected_media_id:
        return transaction_item

    tenant = get_item(build_pk(tenant_id), build_sk("TENANT", tenant_id))
    access_token = (tenant or {}).get("meta_access_token")
    if not access_token:
        return transaction_item

    try:
        data, content_type, mime_type = _fetch_whatsapp_media(access_token, selected_media_id)
        txn_id = transaction_item.get("id") or "unknown"
        file_ext = mimetypes.guess_extension(content_type or mime_type or "") or ".jpg"
        if file_ext == ".jpe":
            file_ext = ".jpg"
        bucket = os.environ.get("DATA_BUCKET")
        if not bucket:
            return transaction_item
        s3_key = f"payment-proofs/{tenant_id}/{txn_id}/{selected_media_id}{file_ext}"
        _s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=data,
            ContentType=(content_type or mime_type or "application/octet-stream"),
        )
        return update_item(
            pk=transaction_item["pk"],
            sk=transaction_item["sk"],
            updates={
                "payment_proof_s3_key": s3_key,
                "payment_proof_content_type": (content_type or mime_type or "application/octet-stream"),
                "payment_proof_received_at": now_iso(),
                "payment_verification_status": PAYMENT_STATUS_AWAITING,
            },
        )
    except Exception:
        return transaction_item


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

        transactions = [_transaction_response(i, include_proof_url=False) for i in items]
        result: dict[str, Any] = {
            "transactions": transactions
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
        # Calculate tax before building the Transaction model
        subtotal = Decimal(str(body.get("subtotal") or body.get("total") or 0))
        tax_rate = Decimal(str(body.get("tax_rate") if body.get("tax_rate") is not None else 0))
        tax_amount = (subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
        total = subtotal + tax_amount
        body["subtotal"] = subtotal
        body["tax_rate"] = tax_rate
        body["tax_amount"] = tax_amount
        body["total"] = total
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
        product_id = item.get("product_id") if isinstance(item, dict) else getattr(item, "product_id", None)
        quantity_raw = item.get("quantity") if isinstance(item, dict) else getattr(item, "quantity", None)
        try:
            quantity = int(quantity_raw)
        except (TypeError, ValueError):
            quantity = 0
        if not product_id or quantity <= 0:
            return error("Each transaction item must include product_id and quantity > 0", 400)
        product_pk = pk
        product_sk = build_sk("PRODUCT", str(product_id))
        transact_items.append(
            {
                "Update": {
                    "TableName": table_name,
                    "Key": {"pk": product_pk, "sk": product_sk},
                    "UpdateExpression": "SET #qty = #qty - :qty_val, updated_at = :now",
                    "ConditionExpression": "#qty >= :qty_val",
                    "ExpressionAttributeNames": {"#qty": "quantity"},
                    "ExpressionAttributeValues": {
                        ":qty_val": quantity,
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
                enriched_item = _auto_attach_proof_from_messages(tenant_id, item)
                return success(_transaction_response(enriched_item, include_proof_url=True))
        if not last_key:
            break

    return not_found("Transaction not found")


def patch_transaction(tenant_id: str, transaction_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """PATCH /transactions/{id} — update transaction status and payment verification."""
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

    allowed = {
        "status",
        "payment_method",
        "delivery_method",
        "delivery_location",
        "delivery_status",
        "delivery_window_requested",
        "delivery_window_approved",
        "delivery_decision_note",
        "payment_verification_status",
    }
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed and value is not None:
            updates[key] = value

    if "status" in updates and updates["status"] not in ("pending", "confirmed"):
        return error("status must be 'pending' or 'confirmed'", 400)
    if "payment_verification_status" in updates and updates["payment_verification_status"] not in (
        PAYMENT_STATUS_AWAITING,
        PAYMENT_STATUS_VERIFIED,
    ):
        return error("payment_verification_status must be 'awaiting_verification' or 'verified'", 400)
    if "delivery_method" in updates and updates["delivery_method"] not in ("delivery", "pickup"):
        return error("delivery_method must be 'delivery' or 'pickup'", 400)
    if "delivery_status" in updates and updates["delivery_status"] not in DELIVERY_STATUS_VALUES:
        return error("delivery_status has an invalid value", 400)

    if not updates:
        return error("Nothing to update", 400)

    try:
        updated_item = update_item(pk=pk, sk=target_sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    if updates.get("delivery_status") == "owner_rejected":
        _send_whatsapp_text(
            tenant_id=tenant_id,
            to_phone=updated_item.get("customer_phone"),
            message=(
                "Hemos revisado tu solicitud y no fue posible aprobar la entrega para este pedido. "
                "Por favor, realiza un nuevo pedido o escríbenos para ayudarte con una alternativa."
            ),
        )
    elif updates.get("delivery_status") == "pickup_confirmed":
        # Guard against inconsistent updates: if method is delivery, send in-transit text.
        delivery_method = str(updated_item.get("delivery_method") or "").strip().lower()
        if delivery_method == "delivery":
            _send_whatsapp_text(
                tenant_id=tenant_id,
                to_phone=updated_item.get("customer_phone"),
                message="Tu pedido ya está en camino. Gracias por tu compra.",
            )
        else:
            # Move conversation to the Sales/Ventas kanban column once pickup is confirmed.
            _mark_conversation_category(pk, updated_item.get("customer_phone") or "", "ventas")
            _send_whatsapp_text(
                tenant_id=tenant_id,
                to_phone=updated_item.get("customer_phone"),
                message="Tu pedido ya está listo para retiro. Te esperamos, gracias por tu compra.",
            )
    elif updates.get("delivery_status") == "owner_approved":
        _send_whatsapp_text(
            tenant_id=tenant_id,
            to_phone=updated_item.get("customer_phone"),
            message="Tu pedido ya está en camino. Gracias por tu compra.",
        )

    return success(body=_transaction_response(updated_item, include_proof_url=True))


def _find_transaction_item_by_id(tenant_id: str, transaction_id: str) -> dict[str, Any] | None:
    """Find and return raw transaction item by transaction id."""
    pk = build_pk(tenant_id)
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk, sk_prefix="TXN#", limit=100, last_key=last_key)
        for item in items:
            if item.get("id") == transaction_id:
                return item
        if not last_key:
            break
    return None


def cancel_transaction(tenant_id: str, transaction_id: str) -> dict[str, Any]:
    """DELETE /transactions/{id} — restore inventory and remove transaction from history."""
    transaction_item = _find_transaction_item_by_id(tenant_id, transaction_id)
    if not transaction_item:
        return not_found("Transaction not found")

    pk = build_pk(tenant_id)
    transaction = Transaction.from_dynamo(transaction_item)

    # Restore inventory quantities for all transaction lines.
    for line in transaction.items or []:
        product_id = line.get("product_id") if isinstance(line, dict) else getattr(line, "product_id", None)
        if not product_id:
            continue
        qty = _line_quantity(line)
        if qty <= 0:
            continue
        product_sk = build_sk("PRODUCT", product_id)
        try:
            product_item = get_item(pk, product_sk, consistent_read=True)
            if not product_item:
                continue
            current_qty = int(product_item.get("quantity", 0))
            update_item(
                pk=pk,
                sk=product_sk,
                updates={"quantity": current_qty + qty, "updated_at": now_iso()},
            )
        except DynamoDBError as e:
            return server_error(f"Failed to restore inventory for product {product_id}: {e}")

    # Adjust contact total_spent best-effort when contact exists.
    contact_id = transaction_item.get("contact_id")
    if contact_id:
        contact_sk = build_sk("CONTACT", contact_id)
        try:
            contact_item = get_item(pk, contact_sk, consistent_read=True)
            if contact_item is not None:
                current_total = Decimal(str(contact_item.get("total_spent", "0")))
                tx_total = Decimal(str(transaction_item.get("total", "0")))
                new_total = current_total - tx_total
                if new_total < 0:
                    new_total = Decimal("0")
                update_item(
                    pk=pk,
                    sk=contact_sk,
                    updates={"total_spent": new_total, "last_activity_ts": now_iso()},
                )
        except Exception:
            pass

    try:
        delete_item(pk=transaction_item["pk"], sk=transaction_item["sk"])
    except DynamoDBError as e:
        return server_error(f"Failed to delete transaction: {e}")

    _send_whatsapp_text(
        tenant_id=tenant_id,
        to_phone=transaction_item.get("customer_phone"),
        message=(
            "Hemos tenido que cancelar tu pedido en este momento. "
            "Te pedimos disculpas por la molestia. Por favor, intenta nuevamente y con gusto te ayudamos."
        ),
    )

    return success({"message": "Transaction canceled", "transaction_id": transaction_id})


def _line_quantity(line: Any) -> int:
    """Safely get quantity from a line item (dict from DynamoDB or TransactionItem)."""
    if line is None:
        return 0
    if isinstance(line, dict):
        q = line.get("quantity", 0)
        return int(q) if q is not None else 0
    return getattr(line, "quantity", 0) or 0


def get_revenue_range(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /transactions/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD — per-day revenue array."""
    from datetime import date, timedelta

    query_params = _get_query_params(event)
    start_date = query_params.get("start", today_str())
    end_date = query_params.get("end", today_str())

    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        return error("start y end deben tener formato YYYY-MM-DD", 400)

    if (end - start).days > 365:
        return error("El rango de fechas no puede superar 365 días", 400)

    if start > end:
        return error("start debe ser anterior o igual a end", 400)

    # Pre-fill all days with zeros
    daily: dict[str, dict] = {}
    current = start
    while current <= end:
        daily[str(current)] = {
            "date": str(current),
            "revenue": 0.0,
            "order_count": 0,
            "items_sold": 0,
        }
        current += timedelta(days=1)

    pk = build_pk(tenant_id)
    sk_start = f"TXN#{start_date}"
    sk_end = f"TXN#{end_date}\uffff"

    try:
        table = get_table()
        key_condition = Key("pk").eq(pk) & Key("sk").between(sk_start, sk_end)
        last_key = None
        while True:
            params: dict[str, Any] = {
                "KeyConditionExpression": key_condition,
                "Limit": 500,
            }
            if last_key:
                params["ExclusiveStartKey"] = last_key
            resp = table.query(**params)
            for item in resp.get("Items", []):
                try:
                    txn = Transaction.from_dynamo(item)
                    # SK pattern: TXN#YYYY-MM-DD#<id>
                    sk_parts = item.get("sk", "").split("#")
                    day_str = sk_parts[1][:10] if len(sk_parts) >= 2 else ""

                    if day_str in daily:
                        daily[day_str]["revenue"] = round(
                            daily[day_str]["revenue"] + float(txn.total), 2
                        )
                        daily[day_str]["order_count"] += 1
                        for line in txn.items or []:
                            daily[day_str]["items_sold"] += _line_quantity(line)
                except Exception:
                    continue
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break

        result = sorted(daily.values(), key=lambda x: x["date"])
        return success({"revenue": result, "start": start_date, "end": end_date})
    except ClientError as e:
        return error(str(e), 400)
    except Exception as e:
        return server_error(str(e))


def get_daily_summary(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Get daily transaction summary for a given date."""
    try:
        query_params = _get_query_params(event)
        date_str = query_params.get("date", today_str())

        pk = build_pk(tenant_id)
        sk_prefix = f"TXN#{date_str}"

        items, _ = query_items(pk, sk_prefix=sk_prefix, limit=500)

        total_revenue = Decimal("0")
        transaction_count = 0
        items_sold = 0
        revenue_by_payment_method: dict[str, Decimal] = {}

        for item in items:
            try:
                txn = Transaction.from_dynamo(item)
                total_revenue += txn.total
                transaction_count += 1
                revenue_by_payment_method[txn.payment_method] = (
                    revenue_by_payment_method.get(txn.payment_method, Decimal("0")) + txn.total
                )
                for line in txn.items or []:
                    items_sold += _line_quantity(line)
            except Exception:
                continue

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
    except DynamoDBError as e:
        return server_error(str(e))
    except Exception as e:
        return server_error(f"Summary error: {type(e).__name__}: {str(e)}")


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
        item = get_item(pk, sk, consistent_read=True)
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
    stock = _inventory_stock_qty(product_item)
    if stock <= 0:
        return error("Product is out of stock", 400)
    cart_sk = _cart_sk(customer_id)
    cart_item = get_item(pk, cart_sk, consistent_read=True)
    items = list(cart_item.get("items", [])) if cart_item else []
    found = False
    for i in items:
        if i.get("product_id") == product_id:
            new_qty = int(i.get("quantity", 0)) + quantity
            i["quantity"] = min(new_qty, stock)
            found = True
            break
    if not found:
        items.append({
            "product_id": product_id,
            "product_name": product_name,
            "quantity": min(quantity, stock),
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
    """Normalize phone for comparison (digits only)."""
    raw = (s or "").strip()
    if not raw:
        return ""
    # Keep digits only so formats like "+1 (555) 123-4567" match "15551234567"
    return "".join(ch for ch in raw if ch.isdigit())


def _looks_like_phone(s: str | None) -> bool:
    n = _normalize_phone(s)
    # WhatsApp numbers are typically 8+ digits; avoid treating ULIDs/ids as phones
    return len(n) >= 8


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


def _mark_conversation_category(pk: str, customer_phone: str, category: str) -> None:
    """Find the latest message for a customer phone and set its category."""
    normalized = _normalize_phone(customer_phone)
    if not normalized or not category:
        return
    try:
        latest_msg: dict[str, Any] | None = None
        last_key: dict[str, Any] | None = None
        while True:
            items, last_key = query_items(pk=pk, sk_prefix="MESSAGE#", limit=100, last_key=last_key)
            for item in items:
                item_from = _normalize_phone(item.get("from_number"))
                item_to = _normalize_phone(item.get("to_number"))
                if item_from == normalized or item_to == normalized:
                    if latest_msg is None or (item.get("created_ts") or "") > (latest_msg.get("created_ts") or ""):
                        latest_msg = item
            if not last_key:
                break
        if latest_msg:
            update_item(pk=pk, sk=latest_msg["sk"], updates={"category": category})

            # Keep conversation summary in sync with the latest message category.
            convo_sk = f"CONVO#{normalized}"
            convo_item = get_item(pk=pk, sk=convo_sk)
            if convo_item:
                update_item(pk=pk, sk=convo_sk, updates={"category": category, "updated_at": now_iso()})
    except DynamoDBError:
        pass  # Non-fatal: message update failure shouldn't block checkout


def cart_checkout(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /cart/checkout — body: customer_id, customer_name, customer_phone, order_notes."""
    try:
        body = parse_body(event)
    except Exception:
        return error("Invalid JSON body", 400)
    customer_id = (body or {}).get("customer_id")
    customer_name = (body or {}).get("customer_name") or "Customer"
    # Accept multiple field names from automations
    customer_phone = (
        (body or {}).get("customer_phone")
        or (body or {}).get("from_number")
        or (body or {}).get("phone")
        or ""
    )
    order_notes = ((body or {}).get("order_notes") or "").strip()
    if len(order_notes) > ORDER_NOTES_MAX_LEN:
        return error(f"order_notes must be <= {ORDER_NOTES_MAX_LEN} characters", 400)
    if not customer_id:
        return error("customer_id required", 400)
    pk = build_pk(tenant_id)
    cart_sk = _cart_sk(customer_id)
    cart_item = get_item(pk, cart_sk, consistent_read=True)
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

    # Resolve contact: find by phone or create, and update total_spent + lead_status
    contact_id: str | None = None
    # If phone isn't explicitly provided, customer_id may be the phone (common in n8n flows)
    effective_phone = customer_phone
    if not _looks_like_phone(effective_phone) and _looks_like_phone(str(customer_id)):
        effective_phone = str(customer_id)

    # If customer_id is actually a contact_id, use the stored phone (best effort)
    if not _looks_like_phone(effective_phone):
        try:
            existing_contact = get_item(pk, build_sk("CONTACT", str(customer_id)))
            if existing_contact and _looks_like_phone(existing_contact.get("phone")):
                effective_phone = existing_contact.get("phone")  # keep original formatting for storage
        except DynamoDBError:
            pass

    contact_item, contact_id = _find_contact_by_phone(tenant_id, effective_phone)
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
                updates={
                    "total_spent": new_total,
                    "tier": _tier_from_total_spent(new_total),
                    "last_activity_ts": now,
                    "lead_status": "closed_won",
                },
            )
        except DynamoDBError as e:
            return server_error(str(e))
        contact_id = contact_item.get("contact_id") or contact_item.get("sk", "").split("#")[-1]
    else:
        contact_id = generate_id()
        contact_sk = build_sk("CONTACT", contact_id)
        try:
            put_item({
                "pk": pk,
                "sk": contact_sk,
                "tenant_id": tenant_id,
                "contact_id": contact_id,
                "name": customer_name,
                "phone": effective_phone,
                "source_channel": "whatsapp",
                "lead_status": "closed_won",
                "tier": _tier_from_total_spent(total),
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
        delivery_status="awaiting_customer_choice",
        customer_phone=effective_phone,
        order_notes=order_notes or None,
        payment_verification_status=PAYMENT_STATUS_AWAITING,
        status="pending",
    )
    transaction.id = generate_id()
    transaction.payment_reference = _build_payment_reference(transaction.id)
    transaction.created_at = now
    sk_txn = _transaction_sk(transaction.created_at, transaction.id)
    txn_record = {"pk": pk, "sk": sk_txn, **transaction.to_dynamo()}
    table = get_table()
    table.put_item(Item=txn_record)
    put_item({"pk": pk, "sk": cart_sk, "items": [], "updated_at": now})

    # Decrement inventory quantities for each purchased item
    for cart_i in items_raw:
        pid = cart_i.get("product_id") or cart_i.get("id") or cart_i.get("productId") or cart_i.get("productID")
        qty_sold = int(cart_i.get("quantity", 1))
        if not pid:
            continue
        product_sk = build_sk("PRODUCT", pid)
        try:
            prod = get_item(pk, product_sk, consistent_read=True)
            if not prod:
                continue
            current_qty = int(prod.get("quantity", 0))
            new_qty = max(current_qty - qty_sold, 0)
            update_item(pk=pk, sk=product_sk, updates={"quantity": new_qty, "updated_at": now})
        except DynamoDBError:
            pass  # Non-fatal: inventory update failure shouldn't block checkout

    # Mark conversation closed: find the latest message for this customer and set category to closed
    _mark_conversation_category(pk, effective_phone, "closed")

    return created(transaction.to_dict())


def _find_latest_awaiting_transaction_item(tenant_id: str, customer_phone: str) -> dict[str, Any] | None:
    pk = build_pk(tenant_id)
    normalized = _normalize_phone(customer_phone)
    if not normalized:
        return None
    last_key: dict[str, Any] | None = None
    latest_match: dict[str, Any] | None = None
    latest_created_at = ""
    while True:
        items, last_key = query_items(pk, sk_prefix="TXN#", limit=100, last_key=last_key)
        for item in items:
            if item.get("payment_verification_status") != PAYMENT_STATUS_AWAITING:
                continue
            if _normalize_phone(item.get("customer_phone")) == normalized:
                created_at = str(item.get("created_at") or "")
                if created_at >= latest_created_at:
                    latest_created_at = created_at
                    latest_match = item
        if not last_key:
            break
    return latest_match


def _fetch_whatsapp_media(tenant_access_token: str, media_id: str) -> tuple[bytes, str | None, str | None]:
    meta_req = urllib.request.Request(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{media_id}",
        headers={"Authorization": f"Bearer {tenant_access_token}"},
    )
    with urllib.request.urlopen(meta_req, timeout=15) as resp:
        media_meta = json.loads(resp.read().decode("utf-8"))
    media_url = media_meta.get("url")
    if not media_url:
        raise ValueError("Media URL not found in Graph response")
    mime_type = media_meta.get("mime_type")

    bin_req = urllib.request.Request(
        media_url,
        headers={"Authorization": f"Bearer {tenant_access_token}"},
    )
    with urllib.request.urlopen(bin_req, timeout=30) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type") or mime_type
    return data, content_type, mime_type


def _send_whatsapp_text(tenant_id: str, to_phone: str | None, message: str) -> bool:
    """Best-effort WhatsApp outbound text for transactional updates."""
    if not to_phone or not message:
        return False
    tenant = get_item(build_pk(tenant_id), build_sk("TENANT", tenant_id)) or {}
    access_token = tenant.get("meta_access_token")
    phone_number_id = tenant.get("meta_phone_number_id")
    if not access_token or not phone_number_id:
        return False
    payload = json.dumps(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": str(to_phone).lstrip("+").strip(),
            "type": "text",
            "text": {"body": message},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages",
        data=payload,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except Exception:
        return False


def attach_payment_proof(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /transactions/payment-proof — attach WhatsApp image to latest awaiting transaction by customer phone."""
    try:
        body = parse_body(event)
    except Exception:
        return error("Invalid JSON body", 400)

    customer_phone = (body.get("customer_phone") or body.get("from_number") or "").strip()
    media_id = (body.get("media_id") or "").strip()
    if not customer_phone or not media_id:
        return error("customer_phone and media_id are required", 400)

    latest = _find_latest_awaiting_transaction_item(tenant_id, customer_phone)
    if not latest:
        return not_found("No awaiting transaction found for this customer")

    tenant = get_item(build_pk(tenant_id), build_sk("TENANT", tenant_id))
    access_token = (tenant or {}).get("meta_access_token")
    if not access_token:
        return error("Tenant does not have meta_access_token configured", 400)

    try:
        data, content_type, mime_type = _fetch_whatsapp_media(access_token, media_id)
    except Exception as e:
        return error(f"Failed to download media from WhatsApp: {e}", 400)

    txn_id = latest.get("id") or latest.get("transaction_id") or "unknown"
    file_ext = mimetypes.guess_extension(content_type or mime_type or "") or ".jpg"
    if file_ext == ".jpe":
        file_ext = ".jpg"
    s3_key = f"payment-proofs/{tenant_id}/{txn_id}/{media_id}{file_ext}"
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        return server_error("DATA_BUCKET not configured")

    try:
        _s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=data,
            ContentType=(content_type or mime_type or "application/octet-stream"),
        )
    except Exception as e:
        return server_error(f"Failed to store payment proof: {e}")

    updates = {
        "payment_proof_s3_key": s3_key,
        "payment_proof_content_type": (content_type or mime_type or "application/octet-stream"),
        "payment_proof_received_at": now_iso(),
        "payment_verification_status": PAYMENT_STATUS_AWAITING,
    }
    try:
        updated_item = update_item(pk=latest["pk"], sk=latest["sk"], updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    response = _transaction_response(updated_item, include_proof_url=True)
    return success(
        {
            "message": "Payment proof attached",
            "transaction_id": response.get("id"),
            "payment_reference": response.get("payment_reference"),
            "transaction": response,
        }
    )


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

    # GET /transactions/revenue - per-day revenue for a date range
    if method == "GET" and path.endswith("/transactions/revenue"):
        return get_revenue_range(tenant_id, event)

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

    # POST /transactions/payment-proof - attach screenshot proof from WhatsApp media
    if method == "POST" and (path == "/transactions/payment-proof" or path.endswith("/transactions/payment-proof")):
        return attach_payment_proof(tenant_id, event)

    # PATCH /transactions/{id} - update status
    if method == "PATCH" and path.startswith("/transactions/"):
        txn_id = path_params.get("id") or path.split("/")[-1]
        return patch_transaction(tenant_id, txn_id, event)

    # DELETE /transactions/{id} - cancel transaction (restock + remove)
    if method == "DELETE" and path.startswith("/transactions/"):
        txn_id = path_params.get("id") or path.split("/")[-1]
        return cancel_transaction(tenant_id, txn_id)

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
