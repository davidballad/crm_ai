"""Tests for shared modules: db, auth, response, models, utils."""

import json
import os
import sys
from decimal import Decimal

import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.conftest import TENANT_ID, make_api_event


class TestUtils:
    def test_generate_id_is_unique(self):
        from shared.utils import generate_id

        ids = {generate_id() for _ in range(100)}
        assert len(ids) == 100

    def test_now_iso_format(self):
        from shared.utils import now_iso

        ts = now_iso()
        assert "T" in ts
        assert "+" in ts or "Z" in ts

    def test_today_str_format(self):
        from shared.utils import today_str

        d = today_str()
        assert len(d) == 10
        assert d[4] == "-" and d[7] == "-"

    def test_build_pk(self):
        from shared.utils import build_pk

        assert build_pk("abc") == "TENANT#abc"

    def test_build_sk(self):
        from shared.utils import build_sk

        assert build_sk("PRODUCT", "123") == "PRODUCT#123"

    def test_parse_body(self):
        from shared.utils import parse_body

        event = {"body": '{"name": "test"}', "isBase64Encoded": False}
        assert parse_body(event) == {"name": "test"}

    def test_parse_body_empty(self):
        from shared.utils import parse_body

        assert parse_body({}) == {}


class TestAuth:
    def test_extract_tenant_id(self):
        from shared.auth import extract_tenant_id

        event = make_api_event(tenant_id="tid-123")
        assert extract_tenant_id(event) == "tid-123"

    def test_extract_tenant_id_missing(self):
        from shared.auth import extract_tenant_id

        assert extract_tenant_id({}) is None

    def test_extract_user_info(self):
        from shared.auth import extract_user_info

        event = make_api_event(tenant_id="tid-1", role="owner", email="a@b.com")
        info = extract_user_info(event)
        assert info["tenant_id"] == "tid-1"
        assert info["role"] == "owner"
        assert info["email"] == "a@b.com"

    def test_require_auth_injects_tenant_id(self):
        from shared.auth import require_auth

        @require_auth
        def handler(event, context=None):
            return {"statusCode": 200, "body": event["tenant_id"]}

        event = make_api_event(tenant_id="tid-ok")
        result = handler(event, None)
        assert result["body"] == "tid-ok"

    def test_require_auth_rejects_missing_tenant(self):
        from shared.auth import require_auth

        @require_auth
        def handler(event, context=None):
            return {"statusCode": 200}

        event = {"requestContext": {"authorizer": {"jwt": {"claims": {}}}}}
        result = handler(event, None)
        assert result["statusCode"] == 401


class TestResponse:
    def test_success(self):
        from shared.response import success

        r = success({"key": "val"})
        assert r["statusCode"] == 200
        body = json.loads(r["body"])
        assert body["key"] == "val"
        assert "Access-Control-Allow-Origin" in r["headers"]

    def test_error_response(self):
        from shared.response import error

        r = error("bad input", 400)
        assert r["statusCode"] == 400
        assert "bad input" in json.loads(r["body"])["error"]

    def test_created(self):
        from shared.response import created

        r = created({"id": "1"})
        assert r["statusCode"] == 201

    def test_not_found(self):
        from shared.response import not_found

        r = not_found()
        assert r["statusCode"] == 404

    def test_no_content(self):
        from shared.response import no_content

        r = no_content()
        assert r["statusCode"] == 204


class TestModels:
    def test_product_round_trip(self):
        from shared.models import Product

        p = Product(name="Widget", quantity=50, unit_cost=Decimal("9.99"))
        d = p.to_dynamo()
        assert d["name"] == "Widget"
        assert d["unit_cost"] == Decimal("9.99")

        p2 = Product.from_dynamo(d)
        assert p2.name == "Widget"
        assert p2.quantity == 50

    def test_product_quantity_validation(self):
        from shared.models import Product

        with pytest.raises(Exception):
            Product(name="Bad", quantity=-1)

    def test_transaction_model(self):
        from shared.models import Transaction, TransactionItem

        t = Transaction(
            items=[TransactionItem(product_id="p1", product_name="A", quantity=2, unit_price=Decimal("5.00"))],
            total=Decimal("10.00"),
            payment_method="cash",
        )
        d = t.to_dynamo()
        assert d["total"] == Decimal("10.00")
        assert len(d["items"]) == 1

    def test_tenant_model(self):
        from shared.models import Tenant

        t = Tenant(business_name="Joe's", business_type="restaurant", owner_email="joe@test.com")
        d = t.to_dynamo()
        assert d["business_type"] == "restaurant"

    def test_purchase_order_model(self):
        from shared.models import PurchaseOrder, PurchaseOrderItem

        po = PurchaseOrder(
            supplier_name="Acme",
            items=[PurchaseOrderItem(product_id="p1", product_name="W", quantity=10, unit_cost=Decimal("5.00"))],
        )
        assert po.status == "draft"
        d = po.to_dynamo()
        assert d["supplier_name"] == "Acme"


class TestDB:
    @mock_aws
    def test_put_and_get_item(self, dynamodb_table):
        from shared.db import put_item, get_item

        put_item({"pk": "TENANT#t1", "sk": "PRODUCT#p1", "name": "Test"})
        item = get_item("TENANT#t1", "PRODUCT#p1")
        assert item is not None
        assert item["name"] == "Test"

    @mock_aws
    def test_get_item_not_found(self, dynamodb_table):
        from shared.db import get_item

        item = get_item("TENANT#nope", "PRODUCT#nope")
        assert item is None

    @mock_aws
    def test_query_items(self, dynamodb_table):
        from shared.db import put_item, query_items

        for i in range(3):
            put_item({"pk": "TENANT#t1", "sk": f"PRODUCT#p{i}", "name": f"P{i}"})

        items, last_key = query_items("TENANT#t1", sk_prefix="PRODUCT#")
        assert len(items) == 3

    @mock_aws
    def test_update_item(self, dynamodb_table):
        from shared.db import put_item, update_item

        put_item({"pk": "TENANT#t1", "sk": "PRODUCT#p1", "name": "Old", "quantity": 10})
        updated = update_item("TENANT#t1", "PRODUCT#p1", {"name": "New", "quantity": 20})
        assert updated["name"] == "New"
        assert updated["quantity"] == 20

    @mock_aws
    def test_delete_item(self, dynamodb_table):
        from shared.db import put_item, delete_item, get_item

        put_item({"pk": "TENANT#t1", "sk": "PRODUCT#p1", "name": "Gone"})
        delete_item("TENANT#t1", "PRODUCT#p1")
        assert get_item("TENANT#t1", "PRODUCT#p1") is None
