"""DynamoDB helper module for multi-tenant CRM."""

from __future__ import annotations

import os
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
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


def get_item(pk: str, sk: str) -> dict[str, Any] | None:
    """Get a single item by pk and sk."""
    try:
        table = get_table()
        response = table.get_item(Key={"pk": pk, "sk": sk})
        return response.get("Item")
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def query_items(
    pk: str,
    sk_prefix: str | None = None,
    limit: int = 50,
    last_key: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Query items by pk with optional sk begins_with. Returns (items, last_evaluated_key)."""
    try:
        table = get_table()
        key_condition = Key("pk").eq(pk)
        if sk_prefix is not None:
            key_condition = key_condition & Key("sk").begins_with(sk_prefix)
        params: dict[str, Any] = {
            "KeyConditionExpression": key_condition,
            "Limit": limit,
        }
        if last_key is not None:
            params["ExclusiveStartKey"] = last_key

        response = table.query(**params)
        items = response.get("Items", [])
        last_eval = response.get("LastEvaluatedKey")
        return items, last_eval
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e


def update_item(pk: str, sk: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update specific attributes. Builds UpdateExpression dynamically. Returns updated item."""
    if not updates:
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

        update_expr = "SET " + ", ".join(set_parts)
        params: dict[str, Any] = {
            "Key": {"pk": pk, "sk": sk},
            "UpdateExpression": update_expr,
            "ExpressionAttributeNames": expr_names,
            "ExpressionAttributeValues": expr_values,
            "ReturnValues": "ALL_NEW",
        }

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


def transact_write(items: list[dict[str, Any]]) -> None:
    """Wrapper around transact_write_items. Items is a list of transact item dicts (Put, Update, Delete, ConditionCheck)."""
    if not items:
        return

    try:
        client = _get_resource().meta.client
        client.transact_write_items(TransactItems=items)
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e
