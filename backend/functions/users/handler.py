"""User management Lambda handler for multi-tenant SaaS CRM.

Allows tenant owners to invite users, list team members, update roles,
and deactivate accounts. Managers can invite staff only.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.auth import require_auth, require_role
from shared.db import DynamoDBError, get_item, put_item, query_items, update_item
from shared.models import User
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
VALID_ROLES = frozenset({"owner", "manager", "staff"})
ROLE_HIERARCHY = {"owner": 3, "manager": 2, "staff": 1}


def _get_method(event: dict[str, Any]) -> str:
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path(event: dict[str, Any]) -> str:
    return event.get("path", "") or event.get("rawPath", "")


def _cognito_client() -> Any:
    return boto3.client("cognito-idp")


def _can_manage_role(actor_role: str, target_role: str) -> bool:
    """Check if actor_role has permission to manage target_role."""
    return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)


def invite_user(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Invite a new user to the tenant. Creates Cognito user + DynamoDB record."""
    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError) as e:
        return error(f"Invalid JSON body: {e}", 400)

    email = (body.get("email") or "").strip().lower()
    if not email or not EMAIL_REGEX.match(email):
        return error("A valid email is required", 400)

    role = (body.get("role") or "staff").strip().lower()
    if role not in VALID_ROLES:
        return error(f"role must be one of: {', '.join(sorted(VALID_ROLES))}", 400)

    if role == "owner":
        return error("Cannot invite another owner", 400)

    display_name = (body.get("display_name") or email.split("@")[0]).strip()

    actor_info = event.get("user_info", {})
    actor_role = actor_info.get("role", "staff")

    if not _can_manage_role(actor_role, role):
        return error(f"Your role ({actor_role}) cannot invite users with role ({role})", 403)

    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        return server_error("COGNITO_USER_POOL_ID not configured")

    cognito = _cognito_client()
    user_id = generate_id()
    now = now_iso()

    # Step 1: Create Cognito user with a temporary password (Cognito emails the invite)
    try:
        cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "custom:tenant_id", "Value": tenant_id},
                {"Name": "custom:role", "Value": role},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "UsernameExistsException":
            return error("A user with this email already exists", 409)
        msg = e.response.get("Error", {}).get("Message", str(e))
        return error(f"Failed to create user: {msg}", 400)

    # Step 2: Store user record in DynamoDB
    pk = build_pk(tenant_id)
    sk = build_sk("USER", user_id)

    user = User(
        id=user_id,
        email=email,
        tenant_id=tenant_id,
        role=role,
        display_name=display_name,
        status="active",
        invited_by=actor_info.get("email"),
        created_at=now,
        updated_at=now,
    )

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "USER",
        **user.to_dynamo(),
    }

    try:
        put_item(item)
    except DynamoDBError:
        try:
            cognito.admin_delete_user(UserPoolId=user_pool_id, Username=email)
        except ClientError:
            pass
        return server_error("Failed to create user record")

    return created(user.model_dump(mode="json"))


def list_users(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List all users in the tenant."""
    pk = build_pk(tenant_id)

    try:
        items, _ = query_items(pk=pk, sk_prefix="USER#", limit=200)
        users = [User.from_dynamo(i).model_dump(mode="json") for i in items]
        return success({"users": users})
    except DynamoDBError as e:
        return server_error(str(e))


def get_user(tenant_id: str, user_id: str) -> dict[str, Any]:
    """Get a single user by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("USER", user_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("User not found")

    return success(User.from_dynamo(item).model_dump(mode="json"))


def update_user(tenant_id: str, user_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Update a user's role or display_name."""
    pk = build_pk(tenant_id)
    sk = build_sk("USER", user_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("User not found")

    existing_user = User.from_dynamo(existing)

    if existing_user.role == "owner":
        return error("Cannot modify the tenant owner", 403)

    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON body", 400)

    actor_info = event.get("user_info", {})
    actor_role = actor_info.get("role", "staff")

    if not _can_manage_role(actor_role, existing_user.role):
        return error(f"Your role ({actor_role}) cannot modify this user", 403)

    updates: dict[str, Any] = {"updated_at": now_iso()}

    new_role = body.get("role")
    if new_role:
        new_role = new_role.strip().lower()
        if new_role not in VALID_ROLES or new_role == "owner":
            return error("Invalid role", 400)
        if not _can_manage_role(actor_role, new_role):
            return error(f"Your role ({actor_role}) cannot assign role ({new_role})", 403)
        updates["role"] = new_role

        # Sync role to Cognito
        user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
        if user_pool_id:
            try:
                _cognito_client().admin_update_user_attributes(
                    UserPoolId=user_pool_id,
                    Username=existing_user.email,
                    UserAttributes=[{"Name": "custom:role", "Value": new_role}],
                )
            except ClientError:
                return server_error("Failed to update role in Cognito")

    if "display_name" in body and body["display_name"] is not None:
        updates["display_name"] = str(body["display_name"]).strip()

    try:
        updated = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(User.from_dynamo(updated).model_dump(mode="json"))


def deactivate_user(tenant_id: str, user_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Deactivate a user -- disables their Cognito account and marks them inactive."""
    pk = build_pk(tenant_id)
    sk = build_sk("USER", user_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("User not found")

    existing_user = User.from_dynamo(existing)

    if existing_user.role == "owner":
        return error("Cannot deactivate the tenant owner", 403)

    actor_info = event.get("user_info", {})
    actor_role = actor_info.get("role", "staff")

    if not _can_manage_role(actor_role, existing_user.role):
        return error(f"Your role ({actor_role}) cannot deactivate this user", 403)

    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
    if user_pool_id:
        try:
            _cognito_client().admin_disable_user(
                UserPoolId=user_pool_id,
                Username=existing_user.email,
            )
        except ClientError as e:
            msg = e.response.get("Error", {}).get("Message", str(e))
            return server_error(f"Failed to disable user in Cognito: {msg}")

    try:
        update_item(pk=pk, sk=sk, updates={"status": "inactive", "updated_at": now_iso()})
    except DynamoDBError as e:
        return server_error(str(e))

    return success({"message": f"User {existing_user.email} has been deactivated"})


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Route requests based on HTTP method and path."""
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path = _get_path(event).rstrip("/")
    path_params = event.get("pathParameters") or {}
    user_id = path_params.get("id")

    actor_role = event.get("user_info", {}).get("role", "staff")
    if actor_role not in ("owner", "manager"):
        return error("Only owners and managers can manage users", 403)

    if method == "POST" and not user_id:
        return invite_user(tenant_id, event)

    if method == "GET" and not user_id:
        return list_users(tenant_id, event)

    if method == "GET" and user_id:
        return get_user(tenant_id, user_id)

    if method == "PUT" and user_id:
        return update_user(tenant_id, user_id, event)

    if method == "DELETE" and user_id:
        return deactivate_user(tenant_id, user_id, event)

    return error("Not found", 404)
