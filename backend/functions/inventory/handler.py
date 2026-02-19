"""Inventory CRUD Lambda handler for multi-tenant SaaS CRM."""

import base64
import json
import os
import sys
from typing import Any

from boto3.dynamodb.conditions import Key

# Add project root for local development; Lambda uses layer for shared
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import (
    delete_item,
    get_item,
    get_table,
    put_item,
    query_items,
    update_item,
)
from shared.db import DynamoDBError
from shared.models import Product
from shared.response import (
    created,
    error,
    no_content,
    not_found,
    server_error,
    success,
)
from shared.utils import (
    build_pk,
    build_sk,
    generate_id,
    now_iso,
    parse_body,
)

PRODUCT_SK_PREFIX = "PRODUCT#"
GSI1_NAME = "GSI1"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    """Decode base64-encoded next_token to last_evaluated_key."""
    if not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded) if decoded else None
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    """Encode last_evaluated_key to base64 next_token."""
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def list_products(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List products with optional category filter and pagination."""
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    category = params.get("category")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        if category:
            # Use GSI1 for category filtering (gsi1pk, gsi1sk)
            table = get_table()
            key_condition = Key("gsi1pk").eq(pk) & Key("gsi1sk").eq(
                f"CATEGORY#{category}"
            )
            query_params: dict[str, Any] = {
                "IndexName": GSI1_NAME,
                "KeyConditionExpression": key_condition,
                "Limit": limit,
            }
            if last_key:
                query_params["ExclusiveStartKey"] = last_key

            response = table.query(**query_params)
            items = response.get("Items", [])
            last_eval = response.get("LastEvaluatedKey")
        else:
            items, last_eval = query_items(
                pk=pk,
                sk_prefix=PRODUCT_SK_PREFIX,
                limit=limit,
                last_key=last_key,
            )

        products = [Product.from_dynamo(item).model_dump(mode="json") for item in items]
        next_token_out = _encode_next_token(last_eval)

        body: dict[str, Any] = {"products": products}
        if next_token_out:
            body["next_token"] = next_token_out

        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_product(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a new product."""
    try:
        body = parse_body(event)
        product_data = Product.model_validate(body)
    except Exception as e:
        return error(str(e), 400)

    product_id = generate_id()
    created_at = now_iso()
    updated_at = created_at

    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "id": product_id,
        "name": product_data.name,
        "quantity": product_data.quantity,
        "reorder_threshold": product_data.reorder_threshold,
        "unit": product_data.unit,
        "created_at": created_at,
        "updated_at": updated_at,
    }

    if product_data.category is not None:
        item["category"] = product_data.category
        item["gsi1pk"] = pk
        item["gsi1sk"] = f"CATEGORY#{product_data.category}"

    if product_data.unit_cost is not None:
        item["unit_cost"] = product_data.unit_cost
    if product_data.supplier_id is not None:
        item["supplier_id"] = product_data.supplier_id
    if product_data.sku is not None:
        item["sku"] = product_data.sku
    if product_data.notes is not None:
        item["notes"] = product_data.notes

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    product_response = Product.from_dynamo(item).model_dump(mode="json")
    return created(product_response)


def get_product(tenant_id: str, product_id: str) -> dict[str, Any]:
    """Get a single product by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("Product not found")

    product = Product.from_dynamo(item).model_dump(mode="json")
    return success(body=product)


def update_product(
    tenant_id: str, product_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Update an existing product."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    # Check existence before update
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Product not found")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not body:
        return error("Request body is required", 400)

    # Build updates from allowed fields
    allowed = {
        "name", "category", "quantity", "unit_cost", "reorder_threshold",
        "supplier_id", "sku", "unit", "notes",
    }
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed and value is not None:
            updates[key] = value

    updates["updated_at"] = now_iso()

    # If category changed, update GSI keys
    if "category" in updates:
        category_val = updates["category"]
        updates["gsi1pk"] = pk
        updates["gsi1sk"] = f"CATEGORY#{category_val}"

    try:
        updated_item = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    product = Product.from_dynamo(updated_item).model_dump(mode="json")
    return success(body=product)


def delete_product(tenant_id: str, product_id: str) -> dict[str, Any]:
    """Delete a product."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route requests to the appropriate handler based on method and path."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path_params = event.get("pathParameters") or {}
        product_id = path_params.get("id")
        tenant_id = event.get("tenant_id", "")

        # GET /inventory - list
        if method == "GET" and not product_id:
            return list_products(tenant_id, event)

        # POST /inventory - create
        if method == "POST" and not product_id:
            return create_product(tenant_id, event)

        # GET /inventory/{id} - get one
        if method == "GET" and product_id:
            return get_product(tenant_id, product_id)

        # PUT /inventory/{id} - update
        if method == "PUT" and product_id:
            return update_product(tenant_id, product_id, event)

        # DELETE /inventory/{id} - delete
        if method == "DELETE" and product_id:
            return delete_product(tenant_id, product_id)

        return error("Method not allowed", 405)

    except Exception as e:
        return server_error(str(e))
