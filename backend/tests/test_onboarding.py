"""Tests for the onboarding Lambda handler."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.conftest import TENANT_ID, make_api_event


class TestOnboardingHandler:
    @mock_aws
    @patch("functions.onboarding.handler.boto3")
    def test_create_tenant(self, mock_boto3, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        mock_cognito = MagicMock()
        mock_boto3.client.return_value = mock_cognito
        mock_cognito.admin_create_user.return_value = {}
        mock_cognito.admin_set_user_password.return_value = {}

        event = {
            "requestContext": {"http": {"method": "POST", "path": "/onboarding/tenant"}},
            "rawPath": "/onboarding/tenant",
            "path": "/onboarding/tenant",
            "httpMethod": "POST",
            "body": json.dumps({
                "business_name": "Test Biz",
                "business_type": "restaurant",
                "owner_email": "owner@test.com",
                "owner_password": "SecurePass123",
            }),
            "isBase64Encoded": False,
        }
        result = lambda_handler(event, None)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert "tenant_id" in body
        assert "message" in body

        mock_cognito.admin_create_user.assert_called_once()
        mock_cognito.admin_set_user_password.assert_called_once()

    @mock_aws
    def test_create_tenant_missing_fields(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        event = {
            "requestContext": {"http": {"method": "POST", "path": "/onboarding/tenant"}},
            "rawPath": "/onboarding/tenant",
            "body": json.dumps({"business_name": ""}),
            "isBase64Encoded": False,
        }
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_create_tenant_invalid_email(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        event = {
            "requestContext": {"http": {"method": "POST", "path": "/onboarding/tenant"}},
            "rawPath": "/onboarding/tenant",
            "body": json.dumps({
                "business_name": "Test",
                "business_type": "retail",
                "owner_email": "not-an-email",
                "owner_password": "Password123",
            }),
            "isBase64Encoded": False,
        }
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_create_tenant_short_password(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        event = {
            "requestContext": {"http": {"method": "POST", "path": "/onboarding/tenant"}},
            "rawPath": "/onboarding/tenant",
            "body": json.dumps({
                "business_name": "Test",
                "business_type": "bar",
                "owner_email": "ok@test.com",
                "owner_password": "short",
            }),
            "isBase64Encoded": False,
        }
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_complete_setup_seeds_products(self, dynamodb_table):
        from functions.onboarding.handler import complete_setup

        # Pre-create a tenant record
        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"TENANT#{TENANT_ID}",
            "entity_type": "TENANT",
            "id": TENANT_ID,
            "business_name": "Test Restaurant",
            "business_type": "restaurant",
            "owner_email": "test@test.com",
            "plan": "free",
        })

        event = make_api_event(
            method="POST",
            path="/onboarding/setup",
            body={"currency": "USD", "timezone": "America/New_York"},
        )

        result = complete_setup(TENANT_ID, event)
        assert result["statusCode"] == 200

        # Verify seed products were created (restaurant = 5 products)
        from shared.db import query_items
        items, _ = query_items(f"TENANT#{TENANT_ID}", sk_prefix="PRODUCT#")
        assert len(items) == 5

    @mock_aws
    def test_complete_setup_tenant_not_found(self, dynamodb_table):
        from functions.onboarding.handler import complete_setup

        event = make_api_event(method="POST", path="/onboarding/setup", body={})
        result = complete_setup("nonexistent-tenant", event)
        assert result["statusCode"] == 404


class TestDeliveryZonesConfig:
    @mock_aws
    def test_patch_valid_delivery_zones(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        # Seed tenant
        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"TENANT#{TENANT_ID}",
            "business_name": "Test Biz",
            "business_type": "retail",
            "owner_email": "owner@test.com",
            "delivery_enabled": True,
        })

        event = make_api_event(
            method="PATCH",
            path="/onboarding/config",
            body={"delivery_zones": [{"name": "Centro", "price": 2.5}, {"name": "Norte", "price": 5.0}]},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

        item = dynamodb_table.get_item(
            Key={"pk": f"TENANT#{TENANT_ID}", "sk": f"TENANT#{TENANT_ID}"}
        )["Item"]
        assert len(item["delivery_zones"]) == 2
        assert item["delivery_zones"][0]["name"] == "Centro"

    @mock_aws
    def test_patch_delivery_zones_duplicate_names_rejected(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"TENANT#{TENANT_ID}",
            "business_name": "Test Biz",
            "business_type": "retail",
            "owner_email": "owner@test.com",
        })

        event = make_api_event(
            method="PATCH",
            path="/onboarding/config",
            body={"delivery_zones": [{"name": "Centro", "price": 2.5}, {"name": "Centro", "price": 3.0}]},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_patch_delivery_zones_negative_price_rejected(self, dynamodb_table):
        from functions.onboarding.handler import lambda_handler

        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"TENANT#{TENANT_ID}",
            "business_name": "Test Biz",
            "business_type": "retail",
            "owner_email": "owner@test.com",
        })

        event = make_api_event(
            method="PATCH",
            path="/onboarding/config",
            body={"delivery_zones": [{"name": "Centro", "price": -1}]},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400
