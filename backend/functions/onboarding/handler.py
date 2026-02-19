"""Onboarding and tenant provisioning Lambda handler."""

import json
import os
import re
import sys
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.auth import require_auth
from shared.db import DynamoDBError, get_item, put_item, update_item
from shared.models import Tenant
from shared.response import created, error, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

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

    return created({
        "tenant_id": tenant_id,
        "message": "Tenant created successfully. Please log in to complete setup.",
    })


def _seed_products(tenant_id: str, business_type: str) -> None:
    """Seed sample products for the tenant based on business_type."""
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
    if "currency" in body and body["currency"] is not None:
        updates["currency"] = str(body["currency"]).strip()
    if "timezone" in body and body["timezone"] is not None:
        updates["timezone"] = str(body["timezone"]).strip()
    if "business_hours" in body and body["business_hours"] is not None:
        updates["business_hours"] = body["business_hours"]
    if "settings" in body and body["settings"] is not None:
        updates["settings"] = body["settings"]

    if updates:
        updates["updated_at"] = now_iso()
        try:
            update_item(pk, sk, updates)
        except DynamoDBError:
            return server_error("Failed to update tenant settings")

    # Seed sample products based on business_type
    business_type = tenant.get("business_type") or "other"
    try:
        _seed_products(tenant_id, business_type)
    except (DynamoDBError, ClientError):
        pass  # Non-fatal; setup is still complete

    return success({
        "message": "Setup complete. Your workspace is ready.",
    })


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route onboarding requests by path. /onboarding/tenant has no auth; /onboarding/setup requires auth."""
    path = _get_path(event)
    method = _get_method(event)

    if method == "POST":
        if path.endswith("/onboarding/tenant") or "/onboarding/tenant" in path:
            return create_tenant(event)
        if path.endswith("/onboarding/setup") or "/onboarding/setup" in path:
            return _handle_complete_setup(event)

    return error("Not found", 404)
