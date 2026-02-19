"""Shared test fixtures for CRM AI backend tests."""

import os
import sys
import json
import pytest
import boto3
from moto import mock_aws
from decimal import Decimal

# Ensure backend modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TABLE_NAME = "crm-ai-test-table"
TENANT_ID = "test-tenant-001"
USER_EMAIL = "test@example.com"


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    """Set required environment variables for all tests."""
    monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_TESTPOOL")
    monkeypatch.setenv("DATA_BUCKET", "crm-ai-test-data")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")


@pytest.fixture
def dynamodb_table():
    """Create a mocked DynamoDB table matching the production schema."""
    with mock_aws():
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
                {"AttributeName": "gsi1pk", "AttributeType": "S"},
                {"AttributeName": "gsi1sk", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "gsi1pk", "KeyType": "HASH"},
                        {"AttributeName": "gsi1sk", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "GSI2",
                    "KeySchema": [
                        {"AttributeName": "sk", "KeyType": "HASH"},
                        {"AttributeName": "pk", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        # Reset the cached DynamoDB resource in the shared.db module
        import shared.db as db_module
        db_module._dynamodb_resource = None

        yield boto3.resource("dynamodb", region_name="us-east-1").Table(TABLE_NAME)

        db_module._dynamodb_resource = None


def make_api_event(
    method="GET",
    path="/",
    body=None,
    path_params=None,
    query_params=None,
    tenant_id=TENANT_ID,
    role="owner",
    email=USER_EMAIL,
):
    """Build a mock API Gateway v2 event with JWT claims."""
    event = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": "test-sub-001",
                        "email": email,
                        "custom:tenant_id": tenant_id,
                        "custom:role": role,
                    }
                }
            },
        },
        "rawPath": path,
        "pathParameters": path_params or {},
        "queryStringParameters": query_params or {},
    }
    if body is not None:
        event["body"] = json.dumps(body) if isinstance(body, dict) else body
        event["isBase64Encoded"] = False
    return event
