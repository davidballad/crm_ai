"""Unit tests for shared delivery utilities."""
import sys
import os
from decimal import Decimal
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shared.delivery import get_delivery_fee, validate_delivery_zones


class TestGetDeliveryFee:
    def test_returns_fee_for_matching_zone(self):
        zones = [{"name": "Centro", "price": 2.5}, {"name": "Norte", "price": 5.0}]
        assert get_delivery_fee(zones, "Centro") == Decimal("2.5")

    def test_returns_none_for_unknown_zone(self):
        zones = [{"name": "Centro", "price": 2.5}]
        assert get_delivery_fee(zones, "Sur") is None

    def test_returns_none_for_empty_zones(self):
        assert get_delivery_fee([], "Centro") is None

    def test_returns_none_for_none_zones(self):
        assert get_delivery_fee(None, "Centro") is None

    def test_fee_is_decimal(self):
        zones = [{"name": "Centro", "price": 3}]
        fee = get_delivery_fee(zones, "Centro")
        assert isinstance(fee, Decimal)

    def test_fee_works_with_string_price(self):
        zones = [{"name": "Centro", "price": "2.50"}]
        fee = get_delivery_fee(zones, "Centro")
        assert fee == Decimal("2.50")
        assert isinstance(fee, Decimal)


class TestValidateDeliveryZones:
    def test_valid_zones(self):
        zones = [{"name": "Centro", "price": 2.5}, {"name": "Norte", "price": 5.0}]
        error = validate_delivery_zones(zones)
        assert error is None

    def test_empty_name_is_invalid(self):
        zones = [{"name": "", "price": 2.5}]
        error = validate_delivery_zones(zones)
        assert isinstance(error, str)

    def test_missing_name_is_invalid(self):
        zones = [{"price": 2.5}]
        error = validate_delivery_zones(zones)
        assert isinstance(error, str)

    def test_negative_price_is_invalid(self):
        zones = [{"name": "Centro", "price": -1}]
        error = validate_delivery_zones(zones)
        assert isinstance(error, str)

    def test_missing_price_is_invalid(self):
        zones = [{"name": "Centro"}]
        error = validate_delivery_zones(zones)
        assert isinstance(error, str)

    def test_duplicate_names_are_invalid(self):
        zones = [{"name": "Centro", "price": 2.5}, {"name": "Centro", "price": 3.0}]
        error = validate_delivery_zones(zones)
        assert isinstance(error, str)

    def test_zero_price_is_valid(self):
        zones = [{"name": "Centro", "price": 0}]
        error = validate_delivery_zones(zones)
        assert error is None

    def test_string_price_is_valid(self):
        zones = [{"name": "Centro", "price": "2.50"}]
        error = validate_delivery_zones(zones)
        assert error is None
