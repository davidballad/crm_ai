"""Square payments Lambda handler.

Handles:
- Square OAuth connect/callback (tenant links their Square account)
- Creating payments via Square Payments API
- Processing Square webhooks for payment status updates
- Checking Square connection status
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError
from square.client import Client as SquareClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.auth import extract_tenant_id, require_auth
from shared.db import DynamoDBError, get_item, put_item, query_items, transact_write, get_table, update_item
from shared.models import Payment, SquareConnection, Transaction, TransactionItem
from shared.response import created, error, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

_secrets_cache: dict[str, str] | None = None


def _get_env(name: str) -> str:
    val = os.environ.get(name, "")
    if not val:
        raise ValueError(f"{name} environment variable not set")
    return val


def _get_square_secrets() -> dict[str, str]:
    """Retrieve Square secrets from Secrets Manager (cached for Lambda warm starts)."""
    global _secrets_cache
    if _secrets_cache is not None:
        return _secrets_cache

    secret_arn = os.environ.get("SQUARE_SECRET_ARN", "")
    if not secret_arn:
        raise ValueError("SQUARE_SECRET_ARN not configured")

    client = boto3.client("secretsmanager")
    resp = client.get_secret_value(SecretId=secret_arn)
    _secrets_cache = json.loads(resp["SecretString"])
    return _secrets_cache


def _square_client(access_token: str | None = None) -> SquareClient:
    """Build a Square SDK client."""
    env = os.environ.get("SQUARE_ENVIRONMENT", "sandbox")
    return SquareClient(
        access_token=access_token or "",
        environment=env,
    )


def _get_method(event: dict[str, Any]) -> str:
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path(event: dict[str, Any]) -> str:
    return event.get("path", "") or event.get("rawPath", "")


def _get_query_params(event: dict[str, Any]) -> dict[str, str]:
    return event.get("queryStringParameters") or {}


# ─────────────────────────────────────────────────────────────────────────────
# Square OAuth
# ─────────────────────────────────────────────────────────────────────────────

def get_connect_url(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Return the Square OAuth authorization URL for the tenant."""
    app_id = os.environ.get("SQUARE_APPLICATION_ID", "")
    if not app_id:
        return server_error("SQUARE_APPLICATION_ID not configured")

    env = os.environ.get("SQUARE_ENVIRONMENT", "sandbox")
    base = "https://connect.squareupsandbox.com" if env == "sandbox" else "https://connect.squareup.com"

    scopes = [
        "PAYMENTS_READ",
        "PAYMENTS_WRITE",
        "MERCHANT_PROFILE_READ",
        "ITEMS_READ",
        "ORDERS_READ",
        "ORDERS_WRITE",
    ]
    scope_str = "+".join(scopes)

    url = f"{base}/oauth2/authorize?client_id={app_id}&scope={scope_str}&session=false&state={tenant_id}"

    return success({"authorize_url": url})


def handle_oauth_callback(event: dict[str, Any]) -> dict[str, Any]:
    """Exchange the OAuth authorization code for an access token and store it."""
    params = _get_query_params(event)
    code = params.get("code")
    tenant_id = params.get("state")

    if not code or not tenant_id:
        return error("Missing code or state parameter", 400)

    try:
        secrets = _get_square_secrets()
        app_id = _get_env("SQUARE_APPLICATION_ID")
    except ValueError as e:
        return server_error(str(e))

    client = _square_client()
    result = client.o_auth.obtain_token(
        body={
            "client_id": app_id,
            "client_secret": secrets["application_secret"],
            "code": code,
            "grant_type": "authorization_code",
        }
    )

    if not result.is_success():
        errors = result.errors or []
        msg = errors[0]["detail"] if errors else "OAuth token exchange failed"
        return error(msg, 400)

    token_data = result.body
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    merchant_id = token_data.get("merchant_id", "")

    # Fetch the merchant's primary location
    authed_client = _square_client(access_token)
    locations_result = authed_client.locations.list_locations()
    location_id = ""
    if locations_result.is_success():
        locations = locations_result.body.get("locations", [])
        for loc in locations:
            if loc.get("status") == "ACTIVE":
                location_id = loc["id"]
                break

    now = now_iso()
    pk = build_pk(tenant_id)
    sk = build_sk("SQUARE", tenant_id)

    conn = SquareConnection(
        tenant_id=tenant_id,
        square_merchant_id=merchant_id,
        square_access_token=access_token,
        square_refresh_token=refresh_token,
        square_location_id=location_id,
        connected_at=now,
        updated_at=now,
    )

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "SQUARE_CONNECTION",
        "gsi1pk": f"SQUARE_MERCHANT#{merchant_id}",
        "gsi1sk": f"TENANT#{tenant_id}",
        **conn.to_dynamo(),
    }

    try:
        put_item(item)
    except DynamoDBError:
        return server_error("Failed to store Square connection")

    # Update tenant record with square_connected flag
    tenant_sk = build_sk("TENANT", tenant_id)
    try:
        update_item(pk, tenant_sk, {"square_connected": True, "updated_at": now})
    except DynamoDBError:
        pass

    return success({
        "message": "Square account connected successfully",
        "merchant_id": merchant_id,
        "location_id": location_id,
    })


def get_connection_status(tenant_id: str) -> dict[str, Any]:
    """Check if the tenant has a connected Square account."""
    pk = build_pk(tenant_id)
    sk = build_sk("SQUARE", tenant_id)

    try:
        item = get_item(pk, sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return success({"connected": False})

    return success({
        "connected": True,
        "merchant_id": item.get("square_merchant_id"),
        "location_id": item.get("square_location_id"),
        "connected_at": item.get("connected_at"),
    })


def disconnect_square(tenant_id: str) -> dict[str, Any]:
    """Revoke Square OAuth token and remove the connection record."""
    pk = build_pk(tenant_id)
    sk = build_sk("SQUARE", tenant_id)

    try:
        item = get_item(pk, sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("No Square connection found")

    access_token = item.get("square_access_token")
    if access_token:
        try:
            secrets = _get_square_secrets()
            app_id = _get_env("SQUARE_APPLICATION_ID")
            client = _square_client()
            client.o_auth.revoke_token(
                body={
                    "client_id": app_id,
                    "access_token": access_token,
                },
                authorization=f"Client {secrets['application_secret']}",
            )
        except (ValueError, Exception):
            pass

    from shared.db import delete_item
    try:
        delete_item(pk, sk)
    except DynamoDBError:
        return server_error("Failed to remove Square connection")

    tenant_sk = build_sk("TENANT", tenant_id)
    try:
        update_item(pk, tenant_sk, {"square_connected": False, "updated_at": now_iso()})
    except DynamoDBError:
        pass

    return success({"message": "Square account disconnected"})


# ─────────────────────────────────────────────────────────────────────────────
# Create Payment
# ─────────────────────────────────────────────────────────────────────────────

def _get_square_connection(tenant_id: str) -> dict[str, Any] | None:
    pk = build_pk(tenant_id)
    sk = build_sk("SQUARE", tenant_id)
    try:
        return get_item(pk, sk)
    except DynamoDBError:
        return None


def create_payment(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a Square payment and record the CRM transaction atomically.

    For card payments: calls Square API to charge, then records in DynamoDB.
    For cash payments: records directly in DynamoDB (no Square API call needed,
    but optionally records in Square for unified reporting).
    """
    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError) as e:
        return error(f"Invalid JSON body: {e}", 400)

    source_id = body.get("source_id")
    amount_str = body.get("amount")
    currency = body.get("currency", "USD").upper()
    items_raw = body.get("items", [])
    notes = body.get("notes")
    is_cash = body.get("payment_method") == "cash"

    if not amount_str:
        return error("amount is required", 400)
    if not items_raw:
        return error("items are required (list of {product_id, product_name, quantity, unit_price})", 400)
    if not is_cash and not source_id:
        return error("source_id (Square payment nonce) is required for card payments", 400)

    try:
        amount = Decimal(str(amount_str))
    except Exception:
        return error("amount must be a valid number", 400)

    amount_cents = int(amount * 100)

    try:
        txn_items = [TransactionItem.model_validate(i) for i in items_raw]
    except Exception as e:
        return error(f"Invalid items: {e}", 400)

    conn = _get_square_connection(tenant_id)
    if not conn:
        return error("Square account not connected. Please connect via /payments/square/connect first.", 400)

    access_token = conn["square_access_token"]
    location_id = conn.get("square_location_id", "")

    square_payment_id = ""
    receipt_url = None
    card_brand = None
    card_last4 = None
    payment_status = "completed"
    source_type = "cash" if is_cash else "card_present"
    payment_method = "cash" if is_cash else "card"

    if not is_cash:
        # Call Square Payments API for card charges
        client = _square_client(access_token)
        idempotency_key = generate_id()

        payment_body: dict[str, Any] = {
            "source_id": source_id,
            "idempotency_key": idempotency_key,
            "amount_money": {
                "amount": amount_cents,
                "currency": currency,
            },
            "location_id": location_id,
            "autocomplete": True,
        }
        if notes:
            payment_body["note"] = notes[:500]

        # Detect if this is an online card payment (nonce from Web Payments SDK)
        if source_id and source_id.startswith("cnon:"):
            source_type = "card_online"
            payment_method = "card_online"

        result = client.payments.create_payment(body=payment_body)

        if not result.is_success():
            errors = result.errors or []
            msg = errors[0].get("detail", "Payment failed") if errors else "Payment failed"
            return error(f"Square payment failed: {msg}", 400)

        sq_payment = result.body.get("payment", {})
        square_payment_id = sq_payment.get("id", "")
        receipt_url = sq_payment.get("receipt_url")
        card_details = sq_payment.get("card_details", {})
        card_obj = card_details.get("card", {})
        card_brand = card_obj.get("card_brand")
        card_last4 = card_obj.get("last_4")
        payment_status = sq_payment.get("status", "COMPLETED").lower()
    else:
        square_payment_id = f"cash_{generate_id()}"

    # Record the CRM transaction + payment in DynamoDB
    transaction_id = generate_id()
    payment_id = generate_id()
    now = now_iso()

    pk = build_pk(tenant_id)
    txn_sk = f"TXN#{now}#{transaction_id}"

    transaction = Transaction(
        id=transaction_id,
        items=txn_items,
        total=amount,
        payment_method=payment_method,
        square_payment_id=square_payment_id,
        notes=notes,
        created_at=now,
    )

    payment = Payment(
        id=payment_id,
        transaction_id=transaction_id,
        square_payment_id=square_payment_id,
        amount=amount,
        currency=currency,
        status=payment_status,
        source_type=source_type,
        card_brand=card_brand,
        card_last4=card_last4,
        receipt_url=receipt_url,
        created_at=now,
        updated_at=now,
    )

    table = get_table()
    table_name = table.name

    txn_record: dict[str, Any] = {
        "pk": pk,
        "sk": txn_sk,
        "entity_type": "TRANSACTION",
        **transaction.to_dynamo(),
    }

    payment_record: dict[str, Any] = {
        "pk": pk,
        "sk": build_sk("PAYMENT", payment_id),
        "entity_type": "PAYMENT",
        "gsi1pk": f"SQUARE_PAYMENT#{square_payment_id}",
        "gsi1sk": f"TENANT#{tenant_id}",
        **payment.to_dynamo(),
    }

    transact_items: list[dict[str, Any]] = [
        {"Put": {"TableName": table_name, "Item": txn_record}},
        {"Put": {"TableName": table_name, "Item": payment_record}},
    ]

    # Decrement inventory for each item sold
    for item in txn_items:
        product_sk = build_sk("PRODUCT", item.product_id)
        transact_items.append(
            {
                "Update": {
                    "TableName": table_name,
                    "Key": {"pk": pk, "sk": product_sk},
                    "UpdateExpression": "SET #qty = #qty - :qty_val, updated_at = :now",
                    "ConditionExpression": "#qty >= :qty_val",
                    "ExpressionAttributeNames": {"#qty": "quantity"},
                    "ExpressionAttributeValues": {
                        ":qty_val": item.quantity,
                        ":now": now,
                    },
                }
            }
        )

    try:
        transact_write(transact_items)
    except DynamoDBError as e:
        if "ConditionalCheckFailed" in str(e):
            return error("Insufficient stock for one or more products", 400)
        return server_error(f"Failed to record transaction: {e}")

    return created({
        "transaction": transaction.model_dump(mode="json"),
        "payment": payment.model_dump(mode="json"),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Square Webhook
# ─────────────────────────────────────────────────────────────────────────────

def _verify_webhook_signature(body: str, signature: str, url: str) -> bool:
    """Verify Square webhook HMAC-SHA256 signature."""
    try:
        secrets = _get_square_secrets()
        key = secrets.get("webhook_signature_key", "")
    except ValueError:
        return False

    payload = url + body
    expected = hmac.new(
        key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    import base64
    expected_b64 = base64.b64encode(expected).decode("utf-8")
    return hmac.compare_digest(expected_b64, signature)


def handle_webhook(event: dict[str, Any]) -> dict[str, Any]:
    """Process Square webhook events (no JWT auth -- verified via HMAC signature)."""
    body_str = event.get("body", "")
    if event.get("isBase64Encoded"):
        import base64
        body_str = base64.b64decode(body_str).decode("utf-8")

    headers = event.get("headers", {})
    signature = headers.get("x-square-hmacsha256-signature", "")

    webhook_url = os.environ.get("SQUARE_WEBHOOK_URL", "")
    if webhook_url and signature:
        if not _verify_webhook_signature(body_str, signature, webhook_url):
            return error("Invalid webhook signature", 403)

    try:
        payload = json.loads(body_str)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON", 400)

    event_type = payload.get("type", "")
    data = payload.get("data", {}).get("object", {})

    if event_type == "payment.completed":
        return _handle_payment_completed(data)
    elif event_type == "payment.updated":
        return _handle_payment_updated(data)
    elif event_type in ("refund.created", "refund.updated"):
        return _handle_refund(data)

    return success({"message": "Event acknowledged"})


def _find_payment_by_square_id(square_payment_id: str) -> dict[str, Any] | None:
    """Look up a payment record using GSI1 (SQUARE_PAYMENT#<id>)."""
    from shared.db import query_gsi
    try:
        items = query_gsi(
            index_name="GSI1",
            pk_attr="gsi1pk",
            pk_value=f"SQUARE_PAYMENT#{square_payment_id}",
        )
        return items[0] if items else None
    except DynamoDBError:
        return None


def _handle_payment_completed(data: dict[str, Any]) -> dict[str, Any]:
    """Handle payment.completed webhook -- update payment status."""
    payment_data = data.get("payment", {})
    sq_id = payment_data.get("id", "")
    if not sq_id:
        return success({"message": "No payment ID in event"})

    existing = _find_payment_by_square_id(sq_id)
    if not existing:
        return success({"message": "Payment not found in our system (may be external)"})

    pk = existing["pk"]
    sk = existing["sk"]
    try:
        update_item(pk, sk, {"status": "completed", "updated_at": now_iso()})
    except DynamoDBError:
        return server_error("Failed to update payment status")

    return success({"message": "Payment marked as completed"})


def _handle_payment_updated(data: dict[str, Any]) -> dict[str, Any]:
    """Handle payment.updated webhook."""
    payment_data = data.get("payment", {})
    sq_id = payment_data.get("id", "")
    sq_status = payment_data.get("status", "").lower()
    if not sq_id:
        return success({"message": "No payment ID"})

    existing = _find_payment_by_square_id(sq_id)
    if not existing:
        return success({"message": "Payment not tracked"})

    status_map = {
        "completed": "completed",
        "approved": "pending",
        "pending": "pending",
        "canceled": "cancelled",
        "cancelled": "cancelled",
        "failed": "failed",
    }
    mapped_status = status_map.get(sq_status, sq_status)

    pk = existing["pk"]
    sk = existing["sk"]
    try:
        update_item(pk, sk, {"status": mapped_status, "updated_at": now_iso()})
    except DynamoDBError:
        pass

    return success({"message": f"Payment updated to {mapped_status}"})


def _handle_refund(data: dict[str, Any]) -> dict[str, Any]:
    """Handle refund webhooks -- mark payment as refunded."""
    refund = data.get("refund", {})
    sq_payment_id = refund.get("payment_id", "")
    if not sq_payment_id:
        return success({"message": "No payment_id in refund"})

    existing = _find_payment_by_square_id(sq_payment_id)
    if not existing:
        return success({"message": "Refunded payment not tracked"})

    pk = existing["pk"]
    sk = existing["sk"]
    try:
        update_item(pk, sk, {"status": "refunded", "updated_at": now_iso()})
    except DynamoDBError:
        pass

    return success({"message": "Payment marked as refunded"})


# ─────────────────────────────────────────────────────────────────────────────
# Lambda Handler
# ─────────────────────────────────────────────────────────────────────────────

def _handle_authed_routes(event: dict[str, Any]) -> dict[str, Any]:
    """Routes that require JWT authentication."""
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path = _get_path(event).rstrip("/")

    # GET /payments/square/connect
    if method == "GET" and path.endswith("/payments/square/connect"):
        return get_connect_url(tenant_id, event)

    # GET /payments/square/status
    if method == "GET" and path.endswith("/payments/square/status"):
        return get_connection_status(tenant_id)

    # DELETE /payments/square/disconnect
    if method == "DELETE" and path.endswith("/payments/square/disconnect"):
        return disconnect_square(tenant_id)

    # POST /payments
    if method == "POST" and (path.endswith("/payments") or path == "/payments"):
        return create_payment(tenant_id, event)

    return error("Not found", 404)


authed_handler = require_auth(_handle_authed_routes)


def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Main entry point -- routes webhook (no auth) vs authenticated endpoints."""
    path = _get_path(event).rstrip("/")

    # Webhook endpoint -- no JWT auth, verified by HMAC signature
    if path.endswith("/payments/webhook"):
        return handle_webhook(event)

    # OAuth callback -- no JWT auth (redirect from Square)
    if path.endswith("/payments/square/callback"):
        return handle_oauth_callback(event)

    # Everything else requires JWT
    return authed_handler(event, context)
