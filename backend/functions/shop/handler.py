"""Public shop Lambda: token-verified product browsing, cart, checkout + WhatsApp order summary."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.db import DynamoDBError, get_item, put_item, query_items, update_item
from shared.models import Transaction, TransactionItem
from shared.response import created, error, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

GRAPH_API_VERSION = "v21.0"
TOKEN_TTL_SECONDS = 86400  # 24 h
PAYMENT_STATUS_AWAITING = "awaiting_verification"
ORDER_NOTES_MAX_LEN = 300
TIER_BRONZE_MAX = Decimal("30")
TIER_SILVER_MAX = Decimal("100")


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


def _normalize_phone(s: str | None) -> str:
    raw = (s or "").strip()
    return "".join(ch for ch in raw if ch.isdigit())


def _tier_from_total_spent(total_spent: Decimal) -> str:
    """Auto-tier thresholds: bronze < 30, silver 30-99.99, gold >= 100."""
    if total_spent < TIER_BRONZE_MAX:
        return "bronze"
    if total_spent < TIER_SILVER_MAX:
        return "silver"
    return "gold"


def _looks_like_phone(s: str | None) -> bool:
    return len(_normalize_phone(s)) >= 8


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
    all_products: list[dict[str, Any]] = []
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="PRODUCT#", limit=100, last_key=last_key)
        for item in items:
            all_products.append({
                "id": item.get("sk", "").split("#")[-1] if "#" in item.get("sk", "") else item.get("id"),
                "name": item.get("name") or item.get("product_name") or "Item",
                "category": item.get("category") or "",
                "unit_cost": str(item.get("unit_cost") or "0"),
                "image_url": item.get("image_url") or "",
                "unit": item.get("unit") or "each",
                "quantity": _product_stock_qty(item),
            })
        if not last_key:
            break
    return success(body={"products": all_products})


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
    unit_price = product_item.get("unit_cost") or Decimal("0")
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
    normalized = _normalize_phone(phone)
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="CONTACT#", limit=100, last_key=last_key)
        for item in items:
            if _normalize_phone(item.get("phone")) == normalized:
                cid = item.get("contact_id") or (item.get("sk", "").split("#")[-1] if "CONTACT#" in item.get("sk", "") else None)
                return item, cid
        if not last_key:
            break
    return None, None


def _send_whatsapp_message(tenant: dict[str, Any], to_phone: str, text: str) -> bool:
    """Send a WhatsApp text message via Meta Cloud API. Returns True on success."""
    token = tenant.get("meta_access_token")
    phone_number_id = tenant.get("meta_phone_number_id")
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
        return True
    except Exception:
        return False


def _send_delivery_choice_buttons(tenant: dict[str, Any], to_phone: str, transaction_id: str) -> bool:
    """Ask customer whether order is delivery or pickup using reply buttons."""
    token = tenant.get("meta_access_token")
    phone_number_id = tenant.get("meta_phone_number_id")
    if not token or not phone_number_id:
        return False
    to_clean = to_phone.lstrip("+").strip()
    payload = json.dumps(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_clean,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": "Esta orden es para entrega o retiro?"},
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
        return True
    except Exception:
        return False


def _checkout(tenant_id: str, customer_phone: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /shop/checkout — creates transaction from cart, sends WhatsApp summary, clears cart."""
    body = parse_body(event)
    customer_name = (body.get("customer_name") or "Customer").strip()
    order_notes = (body.get("order_notes") or "").strip()
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
                        f"Insufficient stock for {i.get('product_name', 'item')}: only {avail} available",
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

    txn = Transaction(
        items=txn_items,
        total=total,
        payment_method="whatsapp",
        contact_id=contact_id,
        delivery_status="awaiting_customer_choice",
        customer_phone=customer_phone,
        order_notes=order_notes or None,
        payment_verification_status=PAYMENT_STATUS_AWAITING,
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

    # Ask delivery vs pickup first (payment instructions are sent later by the WhatsApp workflow,
    # after the customer chooses delivery/pickup and (for delivery) provides location/window).
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}
    _send_delivery_choice_buttons(tenant, customer_phone, txn.id)

    # Build wa.me link for frontend
    business_phone = tenant.get("phone_number") or ""
    wa_link = ""
    if business_phone:
        bp = _normalize_phone(business_phone)
        if bp:
            wa_link = f"https://wa.me/{bp}"

    return created({
        "transaction_id": txn.id,
        "total": str(total),
        "items_count": len(txn_items),
        "wa_link": wa_link,
    })


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
        if method == "POST" and "/shop/checkout" in path:
            return _checkout(tenant_id, customer_phone, event)

        return error("Not found", 404)
    except DynamoDBError as e:
        return server_error(str(e))
    except Exception as e:
        return server_error(str(e))
