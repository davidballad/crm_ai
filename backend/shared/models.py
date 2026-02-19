"""Pydantic models for CRM entities with DynamoDB serialization."""

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _to_dynamo_value(value: Any) -> Any:
    """Convert a value to DynamoDB-compatible format. Decimals stay as Decimal."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [_to_dynamo_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_dynamo_value(v) for k, v in value.items()}
    return value


class Product(BaseModel):
    """Product/inventory item model."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: str | None = None
    name: str
    category: str | None = None
    quantity: int = Field(ge=0)
    unit_cost: Decimal | None = None
    reorder_threshold: int = 10
    supplier_id: str | None = None
    sku: str | None = None
    unit: str = "each"
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB (Decimal preserved)."""
        return _to_dynamo_value(self.model_dump(exclude_none=True))

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "Product":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)


class TransactionItem(BaseModel):
    """Line item within a transaction."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    product_id: str
    product_name: str
    quantity: int = Field(gt=0)
    unit_price: Decimal

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB."""
        return _to_dynamo_value(self.model_dump())

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "TransactionItem":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)


class Transaction(BaseModel):
    """Sales/purchase transaction model."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: str | None = None
    items: list[TransactionItem]
    total: Decimal
    payment_method: Literal["cash", "card", "other"]
    notes: str | None = None
    created_at: str | None = None

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB."""
        data = self.model_dump(exclude_none=True)
        if "items" in data:
            data["items"] = [item.model_dump() if hasattr(item, "model_dump") else item for item in data["items"]]
            data["items"] = [_to_dynamo_value(i) for i in data["items"]]
        return _to_dynamo_value(data)

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "Transaction":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)


class Supplier(BaseModel):
    """Supplier/vendor model."""

    id: str | None = None
    name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    lead_time_days: int | None = None
    notes: str | None = None

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB."""
        return _to_dynamo_value(self.model_dump(exclude_none=True))

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "Supplier":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)


class Tenant(BaseModel):
    """Tenant/organization model."""

    id: str | None = None
    business_name: str
    business_type: Literal["restaurant", "retail", "bar", "other"]
    owner_email: str
    plan: str = "free"
    settings: dict[str, Any] | None = None
    created_at: str | None = None

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB."""
        return _to_dynamo_value(self.model_dump(exclude_none=True))

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "Tenant":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)


class AIInsight(BaseModel):
    """AI-generated insight/report model."""

    tenant_id: str
    date: str
    summary: str
    forecasts: list[Any] | None = None
    reorder_suggestions: list[Any] | None = None
    spending_trends: list[Any] | None = None
    revenue_insights: list[Any] | None = None
    generated_at: str

    def to_dynamo(self) -> dict[str, Any]:
        """Return a dict suitable for DynamoDB."""
        return _to_dynamo_value(self.model_dump(exclude_none=True))

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> "AIInsight":
        """Create model from a DynamoDB item."""
        return cls.model_validate(item)
