"""Tests for the inventory Lambda handler."""

import json
import os
import sys

import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.conftest import TENANT_ID, make_api_event


class TestInventoryHandler:
    @mock_aws
    def test_list_products_empty(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        event = make_api_event(method="GET", path="/inventory")
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["products"] == []

    @mock_aws
    def test_create_product(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        event = make_api_event(
            method="POST",
            path="/inventory",
            body={"name": "Chicken Breast", "category": "Food", "quantity": 50, "unit_cost": 4.50},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["name"] == "Chicken Breast"
        assert body["id"] is not None

    @mock_aws
    def test_create_and_list_products(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        for name in ["Product A", "Product B"]:
            event = make_api_event(
                method="POST",
                path="/inventory",
                body={"name": name, "quantity": 10},
            )
            lambda_handler(event, None)

        list_event = make_api_event(method="GET", path="/inventory")
        result = lambda_handler(list_event, None)
        body = json.loads(result["body"])
        assert len(body["products"]) == 2

    @mock_aws
    def test_get_product(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        create_event = make_api_event(
            method="POST", path="/inventory",
            body={"name": "Widget", "quantity": 25},
        )
        created = json.loads(lambda_handler(create_event, None)["body"])
        product_id = created["id"]

        get_event = make_api_event(
            method="GET", path=f"/inventory/{product_id}",
            path_params={"id": product_id},
        )
        result = lambda_handler(get_event, None)
        assert result["statusCode"] == 200
        assert json.loads(result["body"])["name"] == "Widget"

    @mock_aws
    def test_get_product_not_found(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        event = make_api_event(
            method="GET", path="/inventory/nonexistent",
            path_params={"id": "nonexistent"},
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 404

    @mock_aws
    def test_update_product(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        create_event = make_api_event(
            method="POST", path="/inventory",
            body={"name": "Old Name", "quantity": 10},
        )
        created = json.loads(lambda_handler(create_event, None)["body"])
        pid = created["id"]

        update_event = make_api_event(
            method="PUT", path=f"/inventory/{pid}",
            path_params={"id": pid},
            body={"name": "New Name", "quantity": 99},
        )
        result = lambda_handler(update_event, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["name"] == "New Name"
        assert body["quantity"] == 99

    @mock_aws
    def test_delete_product(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        create_event = make_api_event(
            method="POST", path="/inventory",
            body={"name": "ToDelete", "quantity": 1},
        )
        created = json.loads(lambda_handler(create_event, None)["body"])
        pid = created["id"]

        delete_event = make_api_event(
            method="DELETE", path=f"/inventory/{pid}",
            path_params={"id": pid},
        )
        result = lambda_handler(delete_event, None)
        assert result["statusCode"] == 204

        get_event = make_api_event(
            method="GET", path=f"/inventory/{pid}",
            path_params={"id": pid},
        )
        assert lambda_handler(get_event, None)["statusCode"] == 404

    @mock_aws
    def test_create_product_validation_error(self, dynamodb_table):
        from functions.inventory.handler import lambda_handler

        event = make_api_event(
            method="POST", path="/inventory",
            body={"quantity": -5},  # missing name, negative qty
        )
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400
