"""Public shop Lambda: token-verified product browsing, cart, checkout + WhatsApp order summary."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import boto3
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.db import DynamoDBError, get_item, put_item, query_items, update_item
from shared.models import Transaction, TransactionItem, ConversationSummary, Message
from shared.response import created, error, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body, normalize_phone

from datetime import datetime, timezone

GRAPH_API_VERSION = "v21.0"
TOKEN_TTL_SECONDS = 86400  # 24 h
PAYMENT_STATUS_AWAITING = "awaiting_verification"
PAYMENT_STATUS_PENDING_CARD = "pending_card"
ORDER_NOTES_MAX_LEN = 300
TIER_BRONZE_MAX = Decimal("30")
TIER_SILVER_MAX = Decimal("100")
DATAFAST_TEST_CHECKOUT_URL = "https://test.oppwa.com/v1/checkouts"
DATAFAST_APPROVED_PATTERN = re.compile(r"^(000\.100\.[01][0-9]{2}|000\.000\.000)$")


# ---------------------------------------------------------------------------
# Token helpers (HMAC-SHA256, signed with SERVICE_API_KEY)
# ---------------------------------------------------------------------------

def _get_secret() -> str:
    return os.environ.get("SERVICE_API_KEY", "").strip()


def generate_shop_token(tenant_id: str, customer_phone: str) -> str:
    """Build token: base64(tenant_id:phone:timestamp:hmac). Called by n8n or onboarding."""
    import base64 as b64
    ts = str(int(time.time()))
    payload = f"{tenant_id}:{customer_phone}:{ts}"
    sig = hmac.new(_get_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    raw = f"{payload}:{sig}"
    return b64.urlsafe_b64encode(raw.encode()).decode()


def _verify_token(token: str) -> tuple[str, str] | None:
    """Return (tenant_id, customer_phone) or None."""
    import base64 as b64
    try:
        raw = b64.urlsafe_b64decode(token.encode()).decode()
    except Exception:
        return None
    parts = raw.split(":")
    if len(parts) != 4:
        return None
    tenant_id, phone, ts_str, sig = parts
    payload = f"{tenant_id}:{phone}:{ts_str}"
    expected = hmac.new(_get_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    if not hmac.compare_digest(sig, expected):
        return None
    if abs(time.time() - int(ts_str)) > TOKEN_TTL_SECONDS:
        return None
    return tenant_id, phone


def _extract_token(event: dict[str, Any]) -> tuple[str, str] | None:
    """Pull shop token from query ?token= or header X-Shop-Token."""
    params = event.get("queryStringParameters") or {}
    token = params.get("token") or ""
    if not token:
        headers = event.get("headers") or {}
        token = headers.get("x-shop-token") or headers.get("X-Shop-Token") or ""
    if not token:
        return None
    return _verify_token(token)


# ---------------------------------------------------------------------------
# Cart helpers (same SK scheme as transactions Lambda)
# ---------------------------------------------------------------------------

def _cart_sk(customer_id: str) -> str:
    cid = (customer_id or "").strip().lstrip("+")
    return f"CART#{cid}"


# Using shared normalize_phone for consistency


def _tier_from_total_spent(total_spent: Decimal) -> str:
    """Auto-tier thresholds: bronze < 30, silver 30-99.99, gold >= 100."""
    if total_spent < TIER_BRONZE_MAX:
        return "bronze"
    if total_spent < TIER_SILVER_MAX:
        return "silver"
    return "gold"


def _looks_like_phone(s: str | None) -> bool:
    return len(normalize_phone(s)) >= 8


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def _generate_token(event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/token — body: tenant_id, customer_phone. Requires service key."""
    from shared.auth import validate_service_key
    if not validate_service_key(event):
        return error("Unauthorized", 401)
    body = parse_body(event)
    tenant_id = (body.get("tenant_id") or "").strip()
    phone = (body.get("customer_phone") or "").strip()
    if not tenant_id or not phone:
        return error("tenant_id and customer_phone required", 400)
    token = generate_shop_token(tenant_id, phone)
    return success(body={"token": token})


def _is_promo_active(product_item: dict[str, Any]) -> bool:
    """Return True if the product has an active promo (promo_price set and not yet expired)."""
    end = (product_item.get("promo_end_at") or "").strip()
    promo_price = product_item.get("promo_price")
    if not end or promo_price is None:
        return False
    try:
        end_dt = datetime.fromisoformat(end)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < end_dt
    except ValueError:
        return False


def _effective_price(product_item: dict[str, Any]) -> Decimal:
    """Return promo_price if active, else unit_cost."""
    if _is_promo_active(product_item):
        p = product_item.get("promo_price")
        if p is not None:
            return Decimal(str(p))
    return Decimal(str(product_item.get("unit_cost") or "0"))


def _product_stock_qty(product_item: dict[str, Any]) -> int:
    q = product_item.get("quantity", 0)
    if isinstance(q, Decimal):
        return max(int(q), 0)
    try:
        return max(int(q or 0), 0)
    except (TypeError, ValueError):
        return 0


def _list_products(tenant_id: str) -> dict[str, Any]:
    """GET /shop/products — public product list for this tenant."""
    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    datafast_enabled = bool(
        (tenant.get("datafast_entity_id") or "").strip()
        and (tenant.get("datafast_api_token") or "").strip()
    )
    all_products: list[dict[str, Any]] = []
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="PRODUCT#", limit=100, last_key=last_key)
        for item in items:
            promo_active = _is_promo_active(item)
            entry: dict[str, Any] = {
                "id": item.get("sk", "").split("#")[-1] if "#" in item.get("sk", "") else item.get("id"),
                "name": item.get("name") or item.get("product_name") or "Item",
                "category": item.get("category") or "",
                "unit_cost": str(item.get("unit_cost") or "0"),
                "image_url": item.get("image_url") or "",
                "unit": item.get("unit") or "each",
                "quantity": _product_stock_qty(item),
                "promo_active": promo_active,
            }
            if promo_active:
                entry["promo_price"] = str(item.get("promo_price") or "0")
                entry["promo_end_at"] = item.get("promo_end_at") or ""
            all_products.append(entry)
        if not last_key:
            break
    bank_info = {
        "bank_name": tenant.get("bank_name") or "",
        "person_name": tenant.get("person_name") or "",
        "account_type": tenant.get("account_type") or "",
        "account_id": tenant.get("account_id") or "",
        "identification_number": tenant.get("identification_number") or ""
    }
    return success(body={"products": all_products, "datafast_enabled": datafast_enabled, "bank_info": bank_info})


def _get_cart(tenant_id: str, customer_phone: str) -> dict[str, Any]:
    """GET /shop/cart — cart for this customer."""
    pk = build_pk(tenant_id)
    sk = _cart_sk(customer_phone)
    item = get_item(pk, sk, consistent_read=True)
    if not item or not item.get("items"):
        return success(body={"items": [], "updated_at": None})
    items = [
        {"product_id": i["product_id"], "product_name": i.get("product_name", ""), "quantity": int(i.get("quantity", 1)), "unit_price": str(i.get("unit_price", "0"))}
        for i in item["items"]
    ]
    return success(body={"items": items, "updated_at": item.get("updated_at")})


def _update_cart(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/cart — body: product_id, action ('add'|'remove'|'set'), quantity."""
    body = parse_body(event)
    product_id = (body.get("product_id") or "").strip()
    action = (body.get("action") or "add").strip()
    quantity = max(0, int(body.get("quantity", 1)))
    if not product_id:
        return error("product_id required", 400)

    pk = build_pk(tenant_id)
    product_item = get_item(pk, build_sk("PRODUCT", product_id))
    if not product_item:
        return error("Product not found", 404)
    product_name = product_item.get("name") or product_item.get("product_name") or "Item"
    unit_price = _effective_price(product_item)
    stock = _product_stock_qty(product_item)

    cart_sk = _cart_sk(customer_phone)
    cart_item = get_item(pk, cart_sk, consistent_read=True)
    items: list[dict[str, Any]] = list(cart_item.get("items", [])) if cart_item else []

    if action == "remove":
        items = [i for i in items if i.get("product_id") != product_id]
    elif action == "set":
        found = False
        for i in items:
            if i.get("product_id") == product_id:
                if quantity <= 0:
                    items = [x for x in items if x.get("product_id") != product_id]
                else:
                    capped = min(quantity, stock) if stock > 0 else 0
                    if capped <= 0:
                        items = [x for x in items if x.get("product_id") != product_id]
                    else:
                        i["quantity"] = capped
                found = True
                break
        if not found and quantity > 0:
            if stock <= 0:
                return error("Product is out of stock", 400)
            capped = min(quantity, stock)
            items.append({"product_id": product_id, "product_name": product_name, "quantity": capped, "unit_price": str(unit_price)})
    else:
        if stock <= 0:
            return error("Product is out of stock", 400)
        found = False
        for i in items:
            if i.get("product_id") == product_id:
                new_qty = int(i.get("quantity", 0)) + quantity
                i["quantity"] = min(new_qty, stock)
                found = True
                break
        if not found:
            items.append({"product_id": product_id, "product_name": product_name, "quantity": min(quantity, stock), "unit_price": str(unit_price)})

    now = now_iso()
    put_item({"pk": pk, "sk": cart_sk, "items": items, "updated_at": now})
    out = [{"product_id": i["product_id"], "product_name": i.get("product_name", ""), "quantity": int(i.get("quantity", 1)), "unit_price": str(i.get("unit_price", "0"))} for i in items]
    return success(body={"items": out, "updated_at": now})


def _find_contact_by_phone(tenant_id: str, phone: str) -> tuple[dict[str, Any] | None, str | None]:
    pk = build_pk(tenant_id)
    normalized = normalize_phone(phone)
    if not normalized:
        return None, None
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="CONTACT#", limit=100, last_key=last_key)
        for item in items:
            if normalize_phone(item.get("phone")) == normalized:
                cid = item.get("contact_id") or (item.get("sk", "").split("#")[-1] if "CONTACT#" in item.get("sk", "") else None)
                return item, cid
        if not last_key:
            break
    return None, None


def _upsert_conversation_summary(
    pk: str,
    tenant_id: str,
    customer_phone: str,
    direction: str,
    text: str,
    created_ts: str,
    category: str | None = None,
) -> None:
    """Refined helper for in-workflow conversation summary updates (mirrored from messages handler)."""
    sk = f"CONVO#{normalize_phone(customer_phone)}"
    updates: dict[str, Any] = {
        "tenant_id": tenant_id,
        "customer_phone": normalize_phone(customer_phone),
        "channel": "whatsapp",
        "updated_at": now_iso(),
        "last_message_ts": created_ts,
        "last_direction": direction,
        "last_text": text[:4000] if text else None,
    }
    if category:
        updates["category"] = category
    if direction == "inbound":
        updates["last_inbound_ts"] = created_ts
    else:
        updates["last_outbound_ts"] = created_ts

    existing = get_item(pk=pk, sk=sk)
    if not existing:
        put_item({"pk": pk, "sk": sk, **ConversationSummary.from_dynamo(updates).to_dynamo()})
    else:
        # Move conversation forward if this message is newer OR if we are explicitly setting category
        if (existing.get("last_message_ts") or "") <= created_ts or category:
            update_item(pk=pk, sk=sk, updates=updates)


def _mark_conversation_category(pk: str, customer_phone: str, category: str) -> None:
    """Update conversation summary and newest message category for a customer."""
    normalized = normalize_phone(customer_phone)
    if not normalized or not category:
        return
    try:
        # 1. Update summary (critical for Kanban column change)
        convo_sk = f"CONVO#{normalized}"
        update_item(pk=pk, sk=convo_sk, updates={"category": category, "updated_at": now_iso()})

        # 2. Update ONLY the latest message for this phone (Efficiency: newest first, stop at first match)
        last_key: dict[str, Any] | None = None
        found = False
        for _ in range(3): # Check up to 300 recent messages
            items, last_key = query_items(pk=pk, sk_prefix="MESSAGE#", limit=100, last_key=last_key, scan_index_forward=False)
            for item in items:
                if normalize_phone(item.get("from_number")) == normalized or normalize_phone(item.get("to_number")) == normalized:
                    update_item(pk=pk, sk=item["sk"], updates={"category": category, "updated_at": now_iso()})
                    found = True
                    break
            if found or not last_key:
                break
    except Exception:
        pass


def _record_message(tenant_id: str, to_phone: str, text: str) -> None:
    """Best-effort persistence of outbound WhatsApp messages to DynamoDB."""
    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    message_id = generate_id()
    created_ts = now_iso()
    norm_phone = normalize_phone(to_phone)
    
    msg_item = Message(
        tenant_id=tenant_id,
        message_id=message_id,
        channel="whatsapp",
        direction="outbound",
        from_number=(tenant.get("phone_number") or "").strip() or None,
        to_number=to_phone,
        text=text,
        category="activo",
        created_ts=created_ts,
    ).to_dynamo()
    
    msg_item["gsi1pk"] = f"PHONE#{norm_phone}"
    msg_item["gsi1sk"] = f"MSG#{created_ts}#{message_id}"
    
    try:
        put_item({"pk": pk, "sk": build_sk("MESSAGE", message_id), **msg_item})
        _upsert_conversation_summary(pk, tenant_id, norm_phone, "outbound", text, created_ts)
    except Exception:
        pass


def _send_whatsapp_message(tenant: dict[str, Any], to_phone: str, text: str) -> bool:
    """Send a WhatsApp text message via Meta Cloud API and RECORD it in CRM."""
    token = tenant.get("meta_access_token")
    phone_number_id = tenant.get("meta_phone_number_id")
    tenant_id = (tenant.get("tenant_id") or tenant.get("id") or "").strip()
    if not token or not phone_number_id:
        return False
    to_clean = to_phone.lstrip("+").strip()
    payload = json.dumps({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_clean,
        "type": "text",
        "text": {"body": text},
    })
    req = urllib.request.Request(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages",
        data=payload.encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        if tenant_id:
            _record_message(tenant_id, to_phone, text)
        return True
    except Exception:
        return False


def _send_delivery_choice_buttons(tenant: dict[str, Any], to_phone: str, transaction_id: str) -> bool:
    """Ask customer whether order is delivery or pickup using reply buttons and RECORD it."""
    token = tenant.get("meta_access_token")
    phone_number_id = tenant.get("meta_phone_number_id")
    tenant_id = (tenant.get("tenant_id") or tenant.get("id") or "").strip()
    if not token or not phone_number_id:
        return False
    to_clean = to_phone.lstrip("+").strip()
    body_text = "Esta orden es para entrega o retiro?"
    payload = json.dumps(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_clean,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "footer": {"text": f"Ref: {transaction_id[:8]}"},
                "action": {
                    "buttons": [
                        {"type": "reply", "reply": {"id": "delivery", "title": "Entrega"}},
                        {"type": "reply", "reply": {"id": "pickup", "title": "Retiro"}},
                    ]
                },
            },
        }
    )
    req = urllib.request.Request(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages",
        data=payload.encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        if tenant_id:
            _record_message(tenant_id, to_phone, body_text)
        return True
    except Exception:
        return False


def _create_datafast_checkout(tenant: dict[str, Any], amount: Decimal, transaction_id: str) -> dict[str, Any] | None:
    """Create a Datafast hosted-widget checkout. Returns the API response dict or None on failure."""
    entity_id = (tenant.get("datafast_entity_id") or "").strip()
    api_token = (tenant.get("datafast_api_token") or "").strip()
    if not entity_id or not api_token:
        return None

    tax_rate = Decimal(str(tenant.get("tax_rate") or "0"))
    if tax_rate > 0:
        base_imp = (amount / (1 + tax_rate / Decimal("100"))).quantize(Decimal("0.01"))
        iva_amount = (amount - base_imp).quantize(Decimal("0.01"))
    else:
        base_imp = amount
        iva_amount = Decimal("0.00")

    data: dict[str, str] = {
        "entityId": entity_id,
        "amount": f"{amount:.2f}",
        "currency": "USD",
        "paymentType": "DB",
        "merchantTransactionId": transaction_id,
        "customParameters[SHOPPER_VAL_BASE0]": "0.00",
        "customParameters[SHOPPER_VAL_BASEIMP]": f"{base_imp:.2f}",
        "customParameters[SHOPPER_VAL_IVA]": f"{iva_amount:.2f}",
        "customParameters[SHOPPER_MID]": "1000000406",
        "customParameters[SHOPPER_TID]": "PD100406",
        "customParameters[SHOPPER_ECI]": "0103910",
        "customParameters[SHOPPER_PSERV]": "17913101",
        "testMode": "EXTERNAL",
    }
    form_data = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in data.items()
    )
    req = urllib.request.Request(
        DATAFAST_TEST_CHECKOUT_URL,
        data=form_data.encode(),
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def _verify_datafast_payment(tenant: dict[str, Any], resource_path: str) -> dict[str, Any] | None:
    """Query Datafast with resourcePath to get the payment outcome. Returns response dict or None."""
    entity_id = (tenant.get("datafast_entity_id") or "").strip()
    api_token = (tenant.get("datafast_api_token") or "").strip()
    if not entity_id or not api_token:
        return None
    url = f"https://test.oppwa.com{resource_path}?entityId={urllib.parse.quote(entity_id, safe='')}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None



def _get_upload_url(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/upload-url — returns presigned S3 PUT URL for payment receipts."""
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        return server_error("DATA_BUCKET not configured")
    try:
        body = parse_body(event)
    except Exception:
        return error("Invalid JSON", 400)
    
    ext = (body.get("file_ext") or "jpg").strip().lower()
    if ext not in ("jpg", "jpeg", "png"):
        ext = "jpg"

    # MIME type: image/jpeg (not image/jpg)
    content_type = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"
        
    s3_key = f"payment-proofs/{tenant_id}/{customer_phone}/{generate_id()}.{ext}"
    try:
        s3 = boto3.client("s3", endpoint_url=os.environ.get("AWS_ENDPOINT_URL_S3"))
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": s3_key, "ContentType": content_type},
            ExpiresIn=300,
        )
        return success(body={"upload_url": url, "s3_key": s3_key, "content_type": content_type})
    except Exception as e:
        return server_error(f"S3 Error: {e}")


def _find_transaction_by_id(pk: str, txn_id: str) -> tuple[dict[str, Any] | None, str | None]:
    """Scan TXN# sort keys to find a transaction by its ID. Returns (item, sk) or (None, None)."""
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="TXN#", limit=100, last_key=last_key)
        for item in items:
            if item.get("id") == txn_id:
                return item, item.get("sk")
        if not last_key:
            break
    return None, None


def _checkout(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/checkout — creates transaction from cart, sends WhatsApp summary, clears cart."""
    body = parse_body(event)
    customer_name = (body.get("customer_name") or "Customer").strip()
    order_notes = (body.get("order_notes") or "").strip()
    payment_method = (body.get("payment_method") or "transfer").strip().lower()
    delivery_location = (body.get("delivery_location") or "").strip()
    delivery_method = (body.get("delivery_method") or "delivery").strip().lower()  # "delivery" | "pickup"
    payment_proof_s3_key = (body.get("payment_proof_s3_key") or "").strip()
    if delivery_method not in ("delivery", "pickup"):
        delivery_method = "delivery"
    if len(order_notes) > ORDER_NOTES_MAX_LEN:
        return error(f"order_notes must be <= {ORDER_NOTES_MAX_LEN} characters", 400)

    pk = build_pk(tenant_id)
    cart_sk = _cart_sk(customer_phone)
    cart_item = get_item(pk, cart_sk, consistent_read=True)
    if not cart_item or not cart_item.get("items"):
        return error("Cart is empty", 400)

    items_raw = cart_item["items"]
    total = Decimal("0")
    txn_items: list[TransactionItem] = []
    lines: list[str] = []
    for i in items_raw:
        qty = int(i.get("quantity", 1))
        pid = (i.get("product_id") or "").strip()
        if pid:
            prod_chk = get_item(pk, build_sk("PRODUCT", pid), consistent_read=True)
            if prod_chk:
                avail = _product_stock_qty(prod_chk)
                if qty > avail:
                    return error(
                        f"Sin stock suficiente para {i.get('product_name', 'item')}: solo {avail} disponibles",
                        400,
                    )
        price = Decimal(str(i.get("unit_price", "0")))
        txn_items.append(TransactionItem(product_id=i["product_id"], product_name=i.get("product_name", ""), quantity=qty, unit_price=price))
        total += price * qty
        lines.append(f"{i.get('product_name', 'Item')} x{qty} — ${price * qty:.2f}")

    # Resolve or create contact
    now = now_iso()
    contact_item, contact_id = _find_contact_by_phone(tenant_id, customer_phone)
    if contact_item:
        existing_total = contact_item.get("total_spent")
        current = Decimal(str(existing_total)) if existing_total is not None else Decimal("0")
        try:
            new_total = current + total
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
        try:
            put_item(
                {
                    "pk": pk,
                    "sk": build_sk("CONTACT", contact_id),
                    "tenant_id": tenant_id,
                    "contact_id": contact_id,
                    "name": customer_name,
                    "phone": customer_phone,
                    "source_channel": "whatsapp",
                    "lead_status": "closed_won",
                    "tier": _tier_from_total_spent(total),
                    "total_spent": total,
                    "conversation_mode": "bot",
                    "created_ts": now,
                }
            )
        except DynamoDBError as e:
            return server_error(str(e))

    pay_status = PAYMENT_STATUS_PENDING_CARD if payment_method == "card" else PAYMENT_STATUS_AWAITING
    txn = Transaction(
        items=txn_items,
        total=total,
        payment_method=payment_method,
        contact_id=contact_id,
        delivery_method=delivery_method,
        delivery_status="pending",
        delivery_location=delivery_location or None,
        customer_phone=customer_phone,
        order_notes=order_notes or None,
        payment_verification_status=pay_status,
        payment_proof_s3_key=payment_proof_s3_key or None,
        status="pending",
    )
    txn.id = generate_id()
    txn.created_at = now
    sk_txn = f"TXN#{txn.created_at}#{txn.id}"
    from shared.db import get_table
    get_table().put_item(Item={"pk": pk, "sk": sk_txn, **txn.to_dynamo()})
    put_item({"pk": pk, "sk": cart_sk, "items": [], "updated_at": now})

    # Decrement inventory
    for ci in items_raw:
        pid = ci.get("product_id")
        qty_sold = int(ci.get("quantity", 1))
        if not pid:
            continue
        try:
            prod = get_item(pk, build_sk("PRODUCT", pid), consistent_read=True)
            if prod:
                new_qty = max(int(prod.get("quantity", 0)) - qty_sold, 0)
                update_item(pk=pk, sk=build_sk("PRODUCT", pid), updates={"quantity": new_qty, "updated_at": now})
        except DynamoDBError:
            pass

    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    business_phone = tenant.get("phone_number") or ""
    wa_link = ""
    if business_phone:
        bp = normalize_phone(business_phone)
        if bp:
            wa_link = f"https://wa.me/{bp}"

    delivery_emoji = "🚗 Entrega a domicilio" if delivery_method == "delivery" else "🏪 Retiro en tienda"
    if payment_method == "card":
        pay_label = "Tarjeta"
    elif payment_method == "cash":
        pay_label = "Efectivo"
    else:
        pay_label = "Transferencia bancaria"
    item_lines = "\n".join(f"  • {ti.product_name} x{ti.quantity}" for ti in txn_items)
    if payment_method == "cash":
        payment_note = "Tu pedido está listo. El pago se realizará en efectivo al momento de la entrega o retiro. 🙌"
    else:
        payment_note = "Gracias por tu pedido. Te contactaremos por WhatsApp para confirmar. 🙌"
    confirmation_msg = (
        f"✅ ¡Tu pedido fue confirmado!\n\n"
        f"📦 Productos:\n{item_lines}\n\n"
        f"💰 Total: ${total:.2f}\n"
        f"{delivery_emoji}\n"
        f"💳 Pago: {pay_label}\n"
        f"📋 Pedido #{txn.id[:8].upper()}\n\n"
        f"{payment_note}"
    )

    # Card payment: create Datafast checkout; send WA confirmation after payment verified
    if payment_method == "card":
        df_entity_id = (tenant.get("datafast_entity_id") or "").strip()
        df_api_token = (tenant.get("datafast_api_token") or "").strip()
        if not df_entity_id or not df_api_token:
            return error("El pago con tarjeta no está habilitado en este momento. Usa transferencia.", 422)
        df_result = _create_datafast_checkout(tenant, total, txn.id)
        checkout_id = (df_result or {}).get("id")
        if not checkout_id:
            return error("No se pudo conectar con el procesador de pagos. Intenta con transferencia.", 502)
        return created({
            "transaction_id": txn.id,
            "total": str(total),
            "items_count": len(txn_items),
            "wa_link": wa_link,
            "payment_method": "card",
            "datafast_checkout_id": checkout_id,
            "datafast_entity_id": df_entity_id,
        })

    # Transfer / cash: send order confirmation via WhatsApp
    _send_whatsapp_message(tenant, customer_phone, confirmation_msg)
    return created({
        "transaction_id": txn.id,
        "total": str(total),
        "items_count": len(txn_items),
        "wa_link": wa_link,
        "payment_method": payment_method,
    })


def _datafast_result(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/datafast-result — verify Datafast payment outcome and update transaction."""
    body = parse_body(event)
    resource_path = (body.get("resource_path") or "").strip()
    transaction_id = (body.get("transaction_id") or "").strip()
    if not resource_path or not transaction_id:
        return error("resource_path and transaction_id required", 400)

    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    df_response = _verify_datafast_payment(tenant, resource_path)
    if not df_response:
        return error("No se pudo verificar el pago. Intenta de nuevo.", 502)

    result_code = (df_response.get("result") or {}).get("code", "")
    approved = DATAFAST_APPROVED_PATTERN.match(result_code) is not None

    txn_item, sk_txn = _find_transaction_by_id(pk, transaction_id)
    if not txn_item or not sk_txn:
        return error("Transaction not found", 404)

    now = now_iso()
    if approved:
        delivery_method = txn_item.get("delivery_method", "delivery")
        delivery_emoji = "🚗 Entrega a domicilio" if delivery_method == "delivery" else "🏪 Retiro en tienda"
        items_summary = "\n".join(
            f"  • {it.get('product_name', 'Item')} x{it.get('quantity', 1)}"
            for it in (txn_item.get("items") or [])
        )
        total_str = str(txn_item.get("total", "0"))
        txn_short = transaction_id[:8].upper()
        confirmation_msg = (
            f"✅ ¡Pago confirmado y pedido listo!\n\n"
            f"📦 Productos:\n{items_summary}\n\n"
            f"💰 Total: ${total_str}\n"
            f"{delivery_emoji}\n"
            f"💳 Pago: Tarjeta\n"
            f"📋 Pedido #{txn_short}"
        )
        update_item(pk, sk_txn, {
            "payment_verification_status": "verified",
            "updated_at": now,
        })
        _mark_conversation_category(pk, customer_phone, "vendido")
        _send_whatsapp_message(tenant, customer_phone, confirmation_msg)
        return success({"approved": True, "transaction_id": transaction_id})
    else:
        update_item(pk, sk_txn, {
            "payment_verification_status": "failed",
            "updated_at": now,
        })
        return success({"approved": False, "result_code": result_code})


def _shop_meta(tenant_id: str) -> dict[str, Any]:
    """GET /shop/meta — lightweight tenant metadata for Open Graph tags."""
    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    return success({
        "business_name": tenant.get("business_name") or "Tienda",
        "business_type": tenant.get("business_type") or "",
        "phone_number": normalize_phone(tenant.get("phone_number") or ""),
    })


def _shop_store_page(tenant_id: str) -> dict[str, Any]:
    """GET /store/{tenant_id} — server-rendered HTML landing page with OG tags for social sharing."""
    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    if not tenant:
        html = "<html><body><h1>Tienda no encontrada</h1></body></html>"
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "text/html; charset=utf-8"},
            "body": html,
        }

    business_name = tenant.get("business_name") or "Tienda"
    phone_raw = normalize_phone(tenant.get("phone_number") or "")
    wa_link = f"https://wa.me/{phone_raw}?text=Hola" if phone_raw else "#"
    store_url = f"https://www.clientaai.com/store/{tenant_id}"
    description = f"Compra nuestros productos directamente desde WhatsApp."

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{business_name}</title>
  <meta name="description" content="{business_name} · {description}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{business_name}">
  <meta property="og:title" content="{business_name}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{store_url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{business_name}">
  <meta name="twitter:description" content="{description}">
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}}
    .card{{background:#fff;border-radius:20px;padding:2.5rem 2rem;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2)}}
    .emoji{{font-size:3rem;margin-bottom:1rem;display:block}}
    h1{{font-size:1.75rem;font-weight:700;color:#1a1a1a;margin-bottom:.5rem}}
    .sub{{color:#666;font-size:.95rem;margin-bottom:2rem;line-height:1.5}}
    .btn{{display:flex;align-items:center;justify-content:center;gap:.6rem;background:#25D366;color:#fff;text-decoration:none;padding:1rem 1.5rem;border-radius:14px;font-weight:600;font-size:1rem}}
    .btn:hover{{background:#128C7E}}
    .footer{{margin-top:1.5rem;font-size:.75rem;color:#aaa}}
  </style>
</head>
<body>
  <div class="card">
    <span class="emoji">&#128722;</span>
    <h1>{business_name}</h1>
    <p class="sub">Haz clic para ver nuestros productos y hacer tu pedido por WhatsApp.</p>
    <a href="{wa_link}" class="btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Ver productos en WhatsApp
    </a>
    <p class="footer">Powered by Clienta AI</p>
  </div>
</body>
</html>"""

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": html,
    }


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route shop requests."""
    try:
        method = (event.get("requestContext") or {}).get("http", {}).get("method", "")
        path = event.get("rawPath") or event.get("path") or ""

        # Token generation (service key auth, called by n8n)
        if method == "POST" and "/shop/token" in path:
            return _generate_token(event)

        # Public metadata endpoint (no auth) — used for OG tag injection
        if method == "GET" and "/shop/meta" in path:
            result = _extract_token(event)
            if not result:
                return error("Invalid or expired shop token", 401)
            return _shop_meta(result[0])

        # Public store landing page — server-rendered HTML with OG tags for social sharing
        if method == "GET" and "/store/" in path:
            path_parts = path.rstrip("/").split("/")
            tid = path_parts[-1] if path_parts else ""
            if not tid:
                return error("Missing tenant id", 400)
            return _shop_store_page(tid)

        # All other routes require a valid shop token
        result = _extract_token(event)
        if not result:
            return error("Invalid or expired shop token", 401)
        tenant_id, customer_phone = result

        if method == "GET" and "/shop/products" in path:
            return _list_products(tenant_id)
        if method == "GET" and "/shop/cart" in path:
            return _get_cart(tenant_id, customer_phone)
        if method == "POST" and "/shop/cart" in path:
            return _update_cart(tenant_id, customer_phone, event)
        if method == "POST" and "/shop/upload-url" in path:
            return _get_upload_url(tenant_id, customer_phone, event)
        if method == "POST" and "/shop/checkout" in path:
            return _checkout(tenant_id, customer_phone, event)
        if method == "POST" and "/shop/datafast-result" in path:
            return _datafast_result(tenant_id, customer_phone, event)

        return error("Not found", 404)
    except DynamoDBError as e:
        return server_error(str(e))
    except Exception as e:
        return server_error(str(e))
