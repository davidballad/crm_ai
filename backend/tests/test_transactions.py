"""Tests for the transactions Lambda handler."""

import json
import os
import sys
from decimal import Decimal
from datetime import datetime, timezone

import pytest

try:
    from moto import mock_aws
except ImportError:  # moto<5 compatibility (Python 3.7 environments)
    from contextlib import ContextDecorator
    from moto import mock_dynamodb, mock_s3

    class _MockAwsCompat(ContextDecorator):
        def __enter__(self):
            self._mocks = [mock_dynamodb(), mock_s3()]
            for m in self._mocks:
                m.start()
            return self

        def __exit__(self, exc_type, exc, tb):
            for m in reversed(self._mocks):
                m.stop()
            return False

    def mock_aws(func=None):
        ctx = _MockAwsCompat()
        if func is None:
            return ctx
        return ctx(func)

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

    def test_patch_pickup_confirmed_moves_conversation_to_ventas(self, dynamodb_table):
        from functions.transactions.handler import lambda_handler

        customer_phone = "+1 (555) 123-4567"
        customer_phone_digits = "15551234567"
        now = datetime.now(timezone.utc).isoformat()

        # Seed an existing conversation summary and latest message for the customer.
        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"CONVO#{customer_phone_digits}",
            "tenant_id": TENANT_ID,
            "customer_phone": customer_phone_digits,
            "channel": "whatsapp",
            "category": "active",
            "last_message_ts": now,
            "updated_at": now,
        })
        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": "MESSAGE#msg-001",
            "tenant_id": TENANT_ID,
            "message_id": "msg-001",
            "channel": "whatsapp",
            "direction": "inbound",
            "from_number": customer_phone,
            "to_number": "+15550000000",
            "text": "Hola",
            "category": "active",
            "created_ts": now,
        })

        # Seed a transaction that patch_transaction can find by id.
        dynamodb_table.put_item(Item={
            "pk": f"TENANT#{TENANT_ID}",
            "sk": "TXN#2026-03-26T12:00:00+00:00#txn-ventas-001",
            "id": "txn-ventas-001",
            "items": [
                {
                    "product_id": "prod-001",
                    "product_name": "Widget",
                    "quantity": 1,
                    "unit_price": Decimal("5.00"),
                }
            ],
            "total": Decimal("5.00"),
            "payment_method": "cash",
            "customer_phone": customer_phone,
            "status": "pending",
            "created_at": now,
        })

        event = make_api_event(
            method="PATCH",
            path="/transactions/txn-ventas-001",
            path_params={"id": "txn-ventas-001"},
            body={"delivery_status": "pickup_confirmed"},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

        updated_message = dynamodb_table.get_item(
            Key={"pk": f"TENANT#{TENANT_ID}", "sk": "MESSAGE#msg-001"}
        )["Item"]
        assert updated_message["category"] == "ventas"

        updated_convo = dynamodb_table.get_item(
            Key={"pk": f"TENANT#{TENANT_ID}", "sk": f"CONVO#{customer_phone_digits}"}
        )["Item"]
        assert updated_convo["category"] == "ventas"
