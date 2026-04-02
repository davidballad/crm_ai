"""Onboarding and tenant provisioning Lambda handler."""

from __future__ import annotations

import json
import os
import re
import sys
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.auth import extract_service_tenant_id, extract_tenant_id, require_auth, validate_service_key
from shared.db import DynamoDBError, get_item, put_item, query_gsi, query_items, update_item
from shared.models import Tenant
from shared.response import created, error, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

PHONE_NUMBER_ID_PK = "PHONE_NUMBER_ID"
IG_ACCOUNT_ID_PK = "IG_ACCOUNT_ID"
S3_TENANT_IDS_KEY = "tenant-registry/tenant-ids.json"

_ses_client = None


def _get_ses():
    global _ses_client
    if _ses_client is None:
        _ses_client = boto3.client("ses")
    return _ses_client


def _build_summary_html(business_name: str, date: str, revenue: float, orders: int,
                        items_sold: int, contacts: int, new_leads: int, low_stock: list) -> str:
    low_stock_rows = "".join(
        f"<tr><td style='padding:4px 8px'>{p.get('name','')}</td>"
        f"<td style='padding:4px 8px;color:#dc2626;font-weight:bold'>{p.get('quantity', 0)}</td>"
        f"<td style='padding:4px 8px;color:#6b7280'>{p.get('reorder_threshold', 10)}</td></tr>"
        for p in low_stock[:8]
    )
    low_stock_section = ""
    if low_stock:
        low_stock_section = f"""
        <div style="margin-top:24px;background:#fef2f2;border-radius:10px;padding:16px 20px">
          <h3 style="margin:0 0 12px;color:#dc2626;font-size:15px">&#9888; Stock bajo &mdash; {len(low_stock)} producto(s)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="border-bottom:1px solid #fecaca">
              <th style="text-align:left;padding:4px 8px;color:#6b7280;font-weight:500">Producto</th>
              <th style="text-align:left;padding:4px 8px;color:#6b7280;font-weight:500">Stock actual</th>
              <th style="text-align:left;padding:4px 8px;color:#6b7280;font-weight:500">Umbral</th>
            </tr></thead>
            <tbody>{low_stock_rows}</tbody>
          </table>
        </div>"""
    return f"""<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px 20px;color:#111827;background:#f9fafb">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <h2 style="margin:0 0 4px;color:#4f46e5;font-size:20px">&#128202; Resumen diario</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">{business_name} &mdash; {date}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#16a34a">${revenue:,.2f}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Ingresos ayer</div>
      </div>
      <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#2563eb">{orders}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Pedidos</div>
      </div>
      <div style="background:#faf5ff;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#7c3aed">{contacts}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Total contactos</div>
      </div>
      <div style="background:#fefce8;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#ca8a04">{new_leads}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Nuevos leads ayer</div>
      </div>
    </div>
    {low_stock_section}
    <p style="margin-top:28px;font-size:11px;color:#9ca3af;text-align:center">
      Enviado por <strong>Clienta AI</strong> &bull; Resumen autom&aacute;tico diario
    </p>
  </div>
</body>
</html>"""


def send_daily_summary(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /onboarding/daily-summary — return daily summary data for email. Service key only. (Email sent by n8n)"""
    from datetime import datetime, timedelta, timezone

    if not validate_service_key(event):
        return error("Forbidden", 403)

    pk = build_pk(tenant_id)
    config = get_item(pk, build_sk("TENANT", tenant_id))
    if not config:
        return error("Tenant not found", 404)

    owner_email = (config.get("owner_email") or "").strip()
    business_name = config.get("business_name") or "Tu negocio"
    if not owner_email:
        return success({"skipped": True, "reason": "no owner_email"})

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # Yesterday's transactions (SK prefix: TXN#<date>)
    try:
        txn_items, _ = query_items(pk, sk_prefix=f"TXN#{yesterday}", limit=500)
    except DynamoDBError:
        txn_items = []
    total_revenue = sum(float(t.get("total") or 0) for t in txn_items)
    order_count = len(txn_items)
    items_sold = sum(
        int((item.get("quantity") or 0) if isinstance(item, dict) else 0)
        for t in txn_items
        for item in (t.get("items") or [])
    )

    # All contacts (count + new yesterday)
    try:
        contact_items, _ = query_items(pk, sk_prefix="CONTACT#", limit=500)
    except DynamoDBError:
        contact_items = []
    total_contacts = len(contact_items)
    new_leads = sum(1 for c in contact_items if (c.get("created_ts") or "")[:10] == yesterday)

    # Low-stock products
    try:
        product_items, _ = query_items(pk, sk_prefix="PRODUCT#", limit=200)
    except DynamoDBError:
        product_items = []
    low_stock = [
        p for p in product_items
        if int(p.get("quantity") or 0) <= int(p.get("reorder_threshold") or 10)
    ]

    html_body = _build_summary_html(business_name, yesterday, total_revenue, order_count,
                                    items_sold, total_contacts, new_leads, low_stock)
    plain_body = (
        f"Resumen {yesterday} — {business_name}\n\n"
        f"Ingresos: ${total_revenue:,.2f} | Pedidos: {order_count} | "
        f"Contactos: {total_contacts} | Nuevos leads: {new_leads}\n"
        f"Productos con stock bajo: {len(low_stock)}"
    )

    return success({
        "ready_to_send": True,
        "recipient": owner_email,
        "business_name": business_name,
        "date": yesterday,
        "subject": f"Resumen diario — {business_name} ({yesterday})",
        "html_body": html_body,
        "plain_body": plain_body,
    })

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def _get_tenant_ids_from_s3() -> list[str]:
    """Read tenant IDs from S3. Returns [] if file missing or on error."""
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        return []
    try:
        resp = _get_s3().get_object(Bucket=bucket, Key=S3_TENANT_IDS_KEY)
        body = json.loads(resp["Body"].read().decode())
        return list(body.get("tenant_ids") or [])
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "NoSuchKey":
            return []
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _append_tenant_id_to_s3(tenant_id: str) -> None:
    """Append tenant_id to S3 registry. Best-effort; does not raise (tenant create still succeeds)."""
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket or not tenant_id:
        return
    try:
        ids = _get_tenant_ids_from_s3()
        if tenant_id in ids:
            return
        ids.append(tenant_id)
        now = now_iso()
        _get_s3().put_object(
            Bucket=bucket,
            Key=S3_TENANT_IDS_KEY,
            Body=json.dumps({"tenant_ids": ids, "updated_at": now}),
            ContentType="application/json",
        )
    except Exception:
        pass  # Non-fatal

# Seed products by business type
SEED_PRODUCTS: dict[str, list[dict[str, Any]]] = {
    "restaurant": [
        {"name": "Chicken Breast", "unit_cost": "4.50"},
        {"name": "Rice", "unit_cost": "1.20"},
        {"name": "Cooking Oil", "unit_cost": "3.00"},
        {"name": "Lettuce", "unit_cost": "2.00"},
        {"name": "Tomatoes", "unit_cost": "1.80"},
    ],
    "retail": [
        {"name": "Widget A", "unit_cost": "5.99"},
        {"name": "Widget B", "unit_cost": "8.50"},
        {"name": "Packaging Supplies", "unit_cost": "12.00"},
    ],
    "bar": [
        {"name": "Vodka", "unit_cost": "18.00"},
        {"name": "Rum", "unit_cost": "22.00"},
        {"name": "Beer Keg", "unit_cost": "85.00"},
        {"name": "Limes", "unit_cost": "3.50"},
        {"name": "Ice", "unit_cost": "0.10"},
    ],
    "other": [
        {"name": "Sample Product A", "unit_cost": "10.00"},
        {"name": "Sample Product B", "unit_cost": "15.00"},
    ],
}

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
VALID_BUSINESS_TYPES = frozenset({"restaurant", "retail", "bar", "other"})


def _get_path(event: dict[str, Any]) -> str:
    """Extract request path from API Gateway event."""
    return event.get("path") or event.get("rawPath") or ""


def _get_method(event: dict[str, Any]) -> str:
    """Extract HTTP method from API Gateway event."""
    return (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or ""
    ).upper()


def _validate_create_tenant_body(body: dict[str, Any]) -> tuple[str | None, str | None]:
    """
    Validate create_tenant request body.
    Returns (error_message, None) if invalid, or (None, normalized_business_type) if valid.
    """
    business_name = (body.get("business_name") or "").strip()
    if not business_name:
        return "business_name is required", None

    owner_email = (body.get("owner_email") or "").strip().lower()
    if not owner_email:
        return "owner_email is required", None
    if not EMAIL_REGEX.match(owner_email):
        return "owner_email must be a valid email address", None

    owner_password = body.get("owner_password") or ""
    if len(owner_password) < 8:
        return "owner_password must be at least 8 characters", None

    business_type_raw = (body.get("business_type") or "other").strip().lower()
    if business_type_raw not in VALID_BUSINESS_TYPES:
        return f"business_type must be one of: {', '.join(sorted(VALID_BUSINESS_TYPES))}", None

    meta_phone_number_id = (body.get("meta_phone_number_id") or "").strip()
    if not meta_phone_number_id:
        return "meta_phone_number_id is required (from Meta Developer Console > WhatsApp > Phone numbers)", None

    return None, business_type_raw


def create_tenant(event: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new tenant: Cognito user + DynamoDB tenant record.
    No authentication required.
    """
    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError) as e:
        return error(f"Invalid JSON body: {e}", 400)

    err_msg, business_type = _validate_create_tenant_body(body)
    if err_msg:
        return error(err_msg, 400)

    business_name = (body.get("business_name") or "").strip()
    owner_email = (body.get("owner_email") or "").strip().lower()
    owner_password = body.get("owner_password")

    tenant_id = generate_id()
    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")

    if not user_pool_id:
        return server_error("COGNITO_USER_POOL_ID not configured")

    cognito = boto3.client("cognito-idp")

    # Step 1: Create Cognito user
    try:
        cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=owner_email,
            UserAttributes=[
                {"Name": "email", "Value": owner_email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "custom:tenant_id", "Value": tenant_id},
                {"Name": "custom:role", "Value": "owner"},
            ],
            MessageAction="SUPPRESS",
        )
        cognito.admin_set_user_password(
            UserPoolId=user_pool_id,
            Username=owner_email,
            Password=owner_password,
            Permanent=True,
        )
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "UsernameExistsException":
            return error("A user with this email already exists", 409)
        return error(f"Failed to create user: {e.response.get('Error', {}).get('Message', str(e))}", 400)

    # Step 2: Create tenant record in DynamoDB
    pk = build_pk(tenant_id)
    sk = build_sk("TENANT", tenant_id)
    created_at = now_iso()

    try:
        Tenant(
            id=tenant_id,
            business_name=business_name,
            business_type=business_type,
            owner_email=owner_email,
            plan="free",
            created_at=created_at,
        )
    except Exception as e:
        return error(f"Validation error: {e}", 400)

    tenant_item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "TENANT",
        "id": tenant_id,
        "business_name": business_name,
        "business_type": business_type,
        "owner_email": owner_email,
        "plan": "free",
        "created_at": created_at,
    }

    try:
        put_item(tenant_item)
    except DynamoDBError:
        # Best-effort cleanup: delete the Cognito user
        try:
            cognito.admin_delete_user(
                UserPoolId=user_pool_id,
                Username=owner_email,
            )
        except ClientError:
            pass  # Log and continue; we already return 500
        return server_error("Failed to create tenant record")

    _append_tenant_id_to_s3(tenant_id)

    # Optional: link Meta WhatsApp phone number and seed products during signup
    meta_phone_number_id = (body.get("meta_phone_number_id") or "").strip()
    if meta_phone_number_id:
        try:
            _upsert_phone_number_id_mapping(meta_phone_number_id, tenant_id)
            update_item(build_pk(tenant_id), build_sk("TENANT", tenant_id), {
                "meta_phone_number_id": meta_phone_number_id,
                "updated_at": now_iso(),
            })
        except DynamoDBError:
            pass  # Non-fatal; can be set later via /onboarding/setup

        try:
            _seed_products(tenant_id, business_type)
        except (DynamoDBError, ClientError):
            pass  # Non-fatal

    return created({
        "tenant_id": tenant_id,
        "message": "Tenant created successfully. Please log in to complete setup.",
    })


def _tenant_has_products(tenant_id: str) -> bool:
    """Return True if the tenant already has at least one product (avoids re-seeding)."""
    pk = build_pk(tenant_id)
    items, _ = query_items(pk=pk, sk_prefix="PRODUCT#", limit=1)
    return len(items) > 0


def _seed_products(tenant_id: str, business_type: str) -> None:
    """Seed sample products for the tenant based on business_type. Skips if tenant already has products."""
    if _tenant_has_products(tenant_id):
        return
    products = SEED_PRODUCTS.get(business_type, SEED_PRODUCTS["other"])
    pk = build_pk(tenant_id)
    created_at = now_iso()

    for prod in products:
        product_id = generate_id()
        sk = build_sk("PRODUCT", product_id)
        item: dict[str, Any] = {
            "pk": pk,
            "sk": sk,
            "entity_type": "PRODUCT",
            "id": product_id,
            "name": prod["name"],
            "quantity": 100,
            "unit_cost": Decimal(prod["unit_cost"]),
            "reorder_threshold": 20,
            "unit": "each",
            "created_at": created_at,
            "updated_at": created_at,
        }
        put_item(item)


@require_auth
def _handle_complete_setup(event: dict[str, Any]) -> dict[str, Any]:
    """Auth-required wrapper for complete_setup."""
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)
    return complete_setup(tenant_id, event)


TENANT_CONFIG_FIELDS = (
    "currency", "timezone", "business_hours", "settings",
    "phone_number", "meta_phone_number_id", "meta_business_account_id", "meta_access_token",
    "ai_system_prompt", "capabilities", "delivery_enabled", "payment_methods",
    "bank_name", "person_name", "account_type", "account_id", "identification_number",
    "follow_up_sequences", "tax_rate",
    "ig_business_account_id", "ig_access_token",
    "datafast_entity_id", "datafast_api_token",
    "support_phone",
)


def _upsert_phone_number_id_mapping(meta_phone_number_id: str, tenant_id: str) -> None:
    """Create or update the PHONE_NUMBER_ID -> tenant_id mapping in DynamoDB."""
    put_item({
        "pk": PHONE_NUMBER_ID_PK,
        "sk": meta_phone_number_id,
        "tenant_id": tenant_id,
    })


def _upsert_ig_account_mapping(ig_business_account_id: str, tenant_id: str) -> None:
    """Create or update the IG_ACCOUNT_ID -> tenant_id mapping in DynamoDB."""
    put_item({
        "pk": IG_ACCOUNT_ID_PK,
        "sk": ig_business_account_id,
        "tenant_id": tenant_id,
    })


def complete_setup(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """
    Complete tenant setup after first login.
    Updates tenant settings and optionally seeds sample products.
    """
    try:
        body = parse_body(event)
    except (TypeError, ValueError) as e:
        return error(f"Invalid JSON body: {e}", 400)

    pk = build_pk(tenant_id)
    sk = build_sk("TENANT", tenant_id)

    tenant = get_item(pk, sk)
    if not tenant:
        return error("Tenant not found", 404)

    updates: dict[str, Any] = {}
    for field in TENANT_CONFIG_FIELDS:
        if field in body and body[field] is not None:
            value = body[field]
            if isinstance(value, str):
                value = value.strip()
            updates[field] = value

    if updates:
        updates["updated_at"] = now_iso()
        try:
            update_item(pk, sk, updates)
        except DynamoDBError:
            return server_error("Failed to update tenant settings")

    if updates.get("meta_phone_number_id"):
        try:
            _upsert_phone_number_id_mapping(updates["meta_phone_number_id"], tenant_id)
        except DynamoDBError:
            pass  # Non-fatal; mapping can be retried

    # Seed sample products based on business_type
    business_type = tenant.get("business_type") or "other"
    try:
        _seed_products(tenant_id, business_type)
    except (DynamoDBError, ClientError):
        pass  # Non-fatal; setup is still complete

    return success({
        "message": "Setup complete. Your workspace is ready.",
    })


# ---------------------------------------------------------------------------
# Tenant config & phone resolution
# ---------------------------------------------------------------------------

def _load_tenant_config(tenant_id: str) -> dict[str, Any] | None:
    """Load tenant item from DynamoDB and return it as a config dict.
    Includes tenant_id for n8n and other API consumers that expect it."""
    pk = build_pk(tenant_id)
    sk = build_sk("TENANT", tenant_id)
    item = get_item(pk, sk)
    if not item:
        return None
    config = Tenant.from_dynamo(item).to_dict()
    config["tenant_id"] = tenant_id
    return config


def patch_config(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """PATCH /onboarding/config — partial update of tenant config fields."""
    try:
        body = parse_body(event)
    except (TypeError, ValueError) as e:
        return error(f"Invalid JSON body: {e}", 400)

    pk = build_pk(tenant_id)
    sk = build_sk("TENANT", tenant_id)

    if not get_item(pk, sk):
        return error("Tenant not found", 404)

    updates: dict[str, Any] = {}
    for field in TENANT_CONFIG_FIELDS:
        if field in body:
            value = body[field]
            if isinstance(value, str):
                value = value.strip()
            updates[field] = value

    if not updates:
        return error("No valid fields provided", 400)

    updates["updated_at"] = now_iso()
    try:
        update_item(pk, sk, updates)
    except DynamoDBError:
        return server_error("Failed to update config")

    if updates.get("meta_phone_number_id"):
        try:
            _upsert_phone_number_id_mapping(updates["meta_phone_number_id"], tenant_id)
        except DynamoDBError:
            pass

    if updates.get("ig_business_account_id"):
        try:
            _upsert_ig_account_mapping(updates["ig_business_account_id"], tenant_id)
        except DynamoDBError:
            pass

    return success({"message": "Config updated"})


def get_tenant_config(tenant_id: str, _event: dict[str, Any]) -> dict[str, Any]:
    """GET /onboarding/config — return full tenant config (token redacted for frontend)."""
    try:
        config = _load_tenant_config(tenant_id)
    except DynamoDBError as e:
        return server_error(str(e))
    if not config:
        return error("Tenant not found", 404)
    # Redact tokens — frontend must never receive them
    config.pop("meta_access_token", None)
    config.pop("ig_access_token", None)
    config.pop("datafast_api_token", None)
    return success(body=config)


def resolve_phone(event: dict[str, Any]) -> dict[str, Any]:
    """GET /onboarding/resolve-phone — resolve meta phone_number_id to tenant config.

    Requires service key auth (X-Service-Key header). No JWT needed.
    """
    print("[resolve_phone] ENTRY", flush=True)
    if not validate_service_key(event):
        headers = event.get("headers") or {}
        provided_key = headers.get("x-service-key") or headers.get("X-Service-Key") or ""
        if not provided_key:
            return error("X-Service-Key header required", 401)
        return error("Invalid service key", 401)

    params = event.get("queryStringParameters") or {}
    phone_number_id = (params.get("phone_number_id") or "").strip()
    if not phone_number_id:
        return error("phone_number_id query parameter is required", 400)

    try:
        mapping = get_item(pk=PHONE_NUMBER_ID_PK, sk=phone_number_id)
    except DynamoDBError as e:
        return server_error(str(e))

    if not mapping:
        return error("No tenant found for this phone_number_id", 404)

    resolved_tenant_id = mapping.get("tenant_id")
    if not resolved_tenant_id:
        return error("Mapping is missing tenant_id", 500)

    try:
        config = _load_tenant_config(resolved_tenant_id)
    except DynamoDBError as e:
        return server_error(str(e))

    if not config:
        return error("Tenant not found", 404)

    return success(body=config)


def resolve_ig_account(event: dict[str, Any]) -> dict[str, Any]:
    """GET /onboarding/resolve-ig — resolve ig_business_account_id to tenant config.

    Requires service key auth (X-Service-Key header). Used by n8n Instagram workflow.
    Returns full config including ig_access_token so n8n can reply to comments.
    """
    if not validate_service_key(event):
        headers = event.get("headers") or {}
        if not (headers.get("x-service-key") or headers.get("X-Service-Key")):
            return error("X-Service-Key header required", 401)
        return error("Invalid service key", 401)

    params = event.get("queryStringParameters") or {}
    ig_id = (params.get("ig_business_account_id") or "").strip()
    if not ig_id:
        return error("ig_business_account_id query parameter is required", 400)

    try:
        mapping = get_item(pk=IG_ACCOUNT_ID_PK, sk=ig_id)
    except DynamoDBError as e:
        return server_error(str(e))

    if not mapping:
        return error("No tenant found for this ig_business_account_id", 404)

    resolved_tenant_id = mapping.get("tenant_id")
    if not resolved_tenant_id:
        return error("Mapping is missing tenant_id", 500)

    try:
        config = _load_tenant_config(resolved_tenant_id)
    except DynamoDBError as e:
        return server_error(str(e))

    if not config:
        return error("Tenant not found", 404)

    return success(body=config)


def list_tenant_ids(event: dict[str, Any]) -> dict[str, Any]:
    """GET /onboarding/tenant-ids — return all tenant IDs from S3 (for schedulers, e.g. Phase 3). Service key only."""
    if not validate_service_key(event):
        headers = event.get("headers") or {}
        if not (headers.get("x-service-key") or headers.get("X-Service-Key")):
            return error("X-Service-Key header required", 401)
        return error("Invalid service key", 401)

    tenant_ids = _get_tenant_ids_from_s3()
    return success(body={"tenant_ids": tenant_ids, "count": len(tenant_ids)})


def get_service_tenant_context(event: dict[str, Any]) -> dict[str, Any]:
    """GET /onboarding/service/tenant?tenant_id= — full tenant row including meta_access_token (n8n / automation only)."""
    if not validate_service_key(event):
        headers = event.get("headers") or {}
        if not (headers.get("x-service-key") or headers.get("X-Service-Key")):
            return error("X-Service-Key header required", 401)
        return error("Invalid service key", 401)
    params = event.get("queryStringParameters") or {}
    tenant_id = (params.get("tenant_id") or "").strip()
    if not tenant_id:
        return error("tenant_id query parameter is required", 400)
    try:
        config = _load_tenant_config(tenant_id)
    except DynamoDBError as e:
        return server_error(str(e))
    if not config:
        return error("Tenant not found", 404)
    return success(body=config)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route onboarding requests."""
    path = _get_path(event)
    method = _get_method(event)
    print("[onboarding] method=%s path=%s" % (method, path), flush=True)

    # No auth: tenant creation
    if method == "POST" and ("/onboarding/tenant" in path):
        return create_tenant(event)

    # No JWT auth: phone resolution (service key checked inside handler)
    if method == "GET" and ("/onboarding/resolve-phone" in path):
        return resolve_phone(event)

    # No JWT auth: Instagram account resolution (service key checked inside handler)
    if method == "GET" and ("/onboarding/resolve-ig" in path):
        return resolve_ig_account(event)

    # Service key only: send daily summary email to tenant owner
    if method == "POST" and ("/onboarding/daily-summary" in path):
        params = event.get("queryStringParameters") or {}
        tid = (params.get("tenant_id") or "").strip()
        if not tid:
            body = parse_body(event) if event.get("body") else {}
            tid = (body.get("tenant_id") or "").strip()
        if not tid:
            return error("tenant_id required", 400)
        return send_daily_summary(tid, event)

    # Service key only: list tenant IDs (for Phase 3 scheduler / multi-tenant n8n)
    if method == "GET" and ("/onboarding/tenant-ids" in path):
        return list_tenant_ids(event)

    # Service key only: full tenant for n8n (WhatsApp send, Phase 3 nudges)
    if method == "GET" and ("/onboarding/service/tenant" in path):
        return get_service_tenant_context(event)

    # Auth required: setup and config
    if method == "POST" and ("/onboarding/setup" in path):
        return _handle_complete_setup(event)

    if method == "GET" and ("/onboarding/config" in path):
        tenant_id = extract_tenant_id(event)
        if not tenant_id:
            return error("Unauthorized", 401)
        return get_tenant_config(tenant_id, event)

    if method == "PATCH" and ("/onboarding/config" in path):
        tenant_id = extract_tenant_id(event)
        if not tenant_id:
            return error("Unauthorized", 401)
        return patch_config(tenant_id, event)

    return error("Not found", 404)
