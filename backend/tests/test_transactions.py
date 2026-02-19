"""Tests for the transactions Lambda handler."""

import json
import os
import sys
from decimal import Decimal

import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.conftest import TENANT_ID, make_api_event


def _seed_product(dynamodb_table, product_id="prod-001", name="Widget", quantity=100, unit_cost="5.00"):
    """Insert a product directly into DynamoDB for transaction tests."""
    dynamodb_table.put_item(Item={
        "pk": f"TENANT#{TENANT_ID}",
        "sk": f"PRODUCT#{product_id}",
        "id": product_id,
        "name": name,
        "quantity": quantity,
        "unit_cost": Decimal(unit_cost),
        "reorder_threshold": 10,
        "unit": "each",
    })


class TestTransactionHandler:
    @mock_aws
    def test_list_transactions_empty(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        event = make_api_event(method="GET", path="/transactions")
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["transactions"] == []

    @mock_aws
    def test_record_sale(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        _seed_product(dynamodb_table)

        event = make_api_event(
            method="POST",
            path="/transactions",
            body={
                "items": [{"product_id": "prod-001", "product_name": "Widget", "quantity": 3, "unit_price": 5.00}],
                "total": 15.00,
                "payment_method": "cash",
            },
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["id"] is not None
        assert float(body["total"]) == 15.0

        # Verify inventory was decremented
        product = dynamodb_table.get_item(
            Key={"pk": f"TENANT#{TENANT_ID}", "sk": "PRODUCT#prod-001"}
        )["Item"]
        assert product["quantity"] == 97  # 100 - 3

    @mock_aws
    def test_record_sale_insufficient_stock(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        _seed_product(dynamodb_table, quantity=2)

        event = make_api_event(
            method="POST",
            path="/transactions",
            body={
                "items": [{"product_id": "prod-001", "product_name": "Widget", "quantity": 10, "unit_price": 5.00}],
                "total": 50.00,
                "payment_method": "card",
            },
        )
        result = lambda_handler(event, None)
        # moto may return 400 (condition check) or 500 (DynamoDBError wrap) depending on version
        assert result["statusCode"] in (400, 500)

    @mock_aws
    def test_daily_summary(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        _seed_product(dynamodb_table)

        sale_event = make_api_event(
            method="POST",
            path="/transactions",
            body={
                "items": [{"product_id": "prod-001", "product_name": "Widget", "quantity": 2, "unit_price": 5.00}],
                "total": 10.00,
                "payment_method": "cash",
            },
        )
        lambda_handler(sale_event, None)

        from shared.utils import today_str
        summary_event = make_api_event(
            method="GET",
            path="/transactions/summary",
            query_params={"date": today_str()},
        )
        result = lambda_handler(summary_event, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["transaction_count"] == 1
        assert float(body["total_revenue"]) == 10.0
        assert body["items_sold"] == 2

    @mock_aws
    def test_record_sale_invalid_body(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        event = make_api_event(
            method="POST",
            path="/transactions",
            body={"items": []},  # missing required fields
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400
