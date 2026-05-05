"""DynamoDB helper module for multi-tenant CRM."""

from __future__ import annotations

import os
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

_dynamodb_resource = None


class DynamoDBError(Exception):
    """Raised when a DynamoDB operation fails."""

    def __init__(self, message: str, original_error: Exception | None = None) -> None:
        super().__init__(message)
        self.original_error = original_error


def _get_resource():
    """Get the cached DynamoDB resource."""
    global _dynamodb_resource
    if _dynamodb_resource is None:
        _dynamodb_resource = boto3.resource("dynamodb")
    return _dynamodb_resource


def get_table():
    """Return the table resource. Table name from TABLE_NAME env var."""
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        raise DynamoDBError("TABLE_NAME environment variable is not set")
    try:
        return _get_resource().Table(table_name)
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def put_item(item: dict[str, Any]) -> None:
    """Put an item into the table."""
    try:
        table = get_table()
        table.put_item(Item=item)
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def get_item(pk: str, sk: str, consistent_read: bool = False) -> dict[str, Any] | None:
    """Get a single item by pk and sk. Use consistent_read=True to avoid stale reads after recent writes."""
    try:
        table = get_table()
        params: dict[str, Any] = {"Key": {"pk": pk, "sk": sk}}
        if consistent_read:
            params["ConsistentRead"] = True
        response = table.get_item(**params)
        return response.get("Item")
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def query_items(
    pk: str,
    sk_prefix: str | None = None,
    limit: int = 50,
    last_key: dict[str, Any] | None = None,
    *,
    scan_index_forward: bool = True,
    index_name: str | None = None,
    pk_attr: str = "pk",
    sk_attr: str = "sk",
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Query items with pagination. Supports GSI via index_name/pk_attr/sk_attr."""
    try:
        table = get_table()
        key_condition = Key(pk_attr).eq(pk)
        if sk_prefix is not None:
            key_condition = key_condition & Key(sk_attr).begins_with(sk_prefix)
        params: dict[str, Any] = {
            "KeyConditionExpression": key_condition,
            "Limit": limit,
            "ScanIndexForward": scan_index_forward,
        }
        if index_name:
            params["IndexName"] = index_name
        if last_key is not None:
            params["ExclusiveStartKey"] = last_key

        response = table.query(**params)
        items = response.get("Items", [])
        last_eval = response.get("LastEvaluatedKey")
        return items, last_eval
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def update_item(pk: str, sk: str, updates: dict[str, Any], remove_keys: list[str] | None = None) -> dict[str, Any]:
    """Update specific attributes. Builds UpdateExpression dynamically. Returns updated item.

    remove_keys: optional list of attribute names to remove (REMOVE expression). Useful when
    a field should be deleted from DynamoDB rather than set to None (which DynamoDB rejects).
    """
    if not updates and not remove_keys:
        item = get_item(pk, sk)
        if item is None:
            raise DynamoDBError("Item not found")
        return item

    try:
        table = get_table()
        expr_names: dict[str, str] = {}
        expr_values: dict[str, Any] = {}
        set_parts: list[str] = []

        for key, value in updates.items():
            placeholder = f"#{key.replace('.', '_')}"
            value_placeholder = f":{key.replace('.', '_').replace('#', '')}"
            expr_names[placeholder] = key
            expr_values[value_placeholder] = value
            set_parts.append(f"{placeholder} = {value_placeholder}")

        update_expr = "SET " + ", ".join(set_parts) if set_parts else ""

        if remove_keys:
            remove_parts: list[str] = []
            for key in remove_keys:
                placeholder = f"#{key.replace('.', '_')}"
                expr_names[placeholder] = key
                remove_parts.append(placeholder)
            remove_expr = "REMOVE " + ", ".join(remove_parts)
            update_expr = f"{update_expr} {remove_expr}".strip() if update_expr else remove_expr

        params: dict[str, Any] = {
            "Key": {"pk": pk, "sk": sk},
            "UpdateExpression": update_expr,
            "ExpressionAttributeNames": expr_names,
            "ReturnValues": "ALL_NEW",
        }
        if expr_values:
            params["ExpressionAttributeValues"] = expr_values

        response = table.update_item(**params)
        return response["Attributes"]
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def delete_item(pk: str, sk: str) -> None:
    """Delete an item."""
    try:
        table = get_table()
        table.delete_item(Key={"pk": pk, "sk": sk})
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def query_gsi(
    index_name: str,
    pk_attr: str,
    pk_value: str,
    sk_attr: str | None = None,
    sk_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """Query a GSI by partition key with optional sort key prefix."""
    try:
        table = get_table()
        key_condition = Key(pk_attr).eq(pk_value)
        if sk_attr is not None and sk_prefix is not None:
            key_condition = key_condition & Key(sk_attr).begins_with(sk_prefix)
        params: dict[str, Any] = {
            "IndexName": index_name,
            "KeyConditionExpression": key_condition,
        }

        response = table.query(**params)
        return response.get("Items", [])
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def batch_put_items(items: list[dict[str, Any]]) -> None:
    """Write items in batches of 25 (DynamoDB BatchWriteItem limit)."""
    if not items:
        return
    try:
        table = get_table()
        with table.batch_writer() as batch:
            for item in items:
                batch.put_item(Item=item)
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def scan_items(
    filter_expression: Any | None = None,
    limit: int = 100,
    last_key: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Scan table with optional filter. Returns (items, last_evaluated_key). Use for cross-tenant queries."""
    try:
        table = get_table()
        params: dict[str, Any] = {"Limit": limit}
        if filter_expression is not None:
            params["FilterExpression"] = filter_expression
        if last_key is not None:
            params["ExclusiveStartKey"] = last_key
        response = table.scan(**params)
        return response.get("Items", []), response.get("LastEvaluatedKey")
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def transact_write(items: list[dict[str, Any]]) -> None:
    """Wrapper around transact_write_items. Items is a list of transact item dicts (Put, Update, Delete, ConditionCheck)."""
    if not items:
        return

    try:
        client = _get_resource().meta.client
        client.transact_write_items(TransactItems=items)
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e
