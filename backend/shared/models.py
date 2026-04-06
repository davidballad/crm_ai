"""Data models for CRM entities with DynamoDB serialization (stdlib dataclasses)."""

from __future__ import annotations

from dataclasses import dataclass, field, fields, asdict
from decimal import Decimal
from typing import Any


def _serialize_value(value: Any, *, for_json: bool = False) -> Any:
    """Convert a value for DynamoDB or JSON output."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value) if for_json else value
    if isinstance(value, (list, tuple)):
        return [_serialize_value(v, for_json=for_json) for v in value]
    if isinstance(value, dict):
        return {k: _serialize_value(v, for_json=for_json) for k, v in value.items()}
    return value


def _dict_no_none(obj: Any, *, for_json: bool = False) -> dict[str, Any]:
    """Convert a dataclass to dict, dropping None values and serializing Decimals."""
    raw = asdict(obj)
    return {k: _serialize_value(v, for_json=for_json) for k, v in raw.items() if v is not None}


class _BaseModel:
    """Mixin with to_dynamo / to_dict / from_dynamo helpers."""

    def to_dynamo(self) -> dict[str, Any]:
        return _dict_no_none(self, for_json=False)

    def to_dict(self) -> dict[str, Any]:
        return _dict_no_none(self, for_json=True)

    @classmethod
    def from_dynamo(cls, item: dict[str, Any]) -> Any:
        valid_fields = {f.name for f in fields(cls)}
        filtered = {k: v for k, v in item.items() if k in valid_fields}
        return cls(**filtered)


@dataclass
class Product(_BaseModel):
    name: str
    id: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    quantity: int = 0
    unit_cost: Decimal | None = None
    reorder_threshold: int = 10
    supplier_id: str | None = None
    sku: str | None = None
    unit: str = "each"
    image_url: str | None = None
    notes: str | None = None
    promo_price: Decimal | None = None
    promo_end_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class TransactionItem(_BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: Decimal


@dataclass
class Transaction(_BaseModel):
    items: list
    total: Decimal
    payment_method: str
    id: str | None = None
    contact_id: str | None = None
    delivery_method: str | None = None
    delivery_location: str | None = None
    delivery_status: str | None = None
    delivery_window_requested: str | None = None
    delivery_window_approved: str | None = None
    delivery_decision_note: str | None = None
    subtotal: Decimal | None = None
    tax_rate: Decimal | None = None
    tax_amount: Decimal | None = None
    status: str = "pending"
    idempotency_key: str | None = None
    square_payment_id: str | None = None
    customer_phone: str | None = None
    order_notes: str | None = None
    payment_reference: str | None = None
    payment_verification_status: str | None = None
    payment_proof_s3_key: str | None = None
    payment_proof_content_type: str | None = None
    payment_proof_received_at: str | None = None
    created_at: str | None = None


@dataclass
class Supplier(_BaseModel):
    name: str
    id: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    lead_time_days: int | None = None
    notes: str | None = None


@dataclass
class Tenant(_BaseModel):
    business_name: str
    business_type: str
    owner_email: str
    id: str | None = None
    plan: str = "free"
    settings: dict[str, Any] | None = None
    phone_number: str | None = None
    meta_phone_number_id: str | None = None
    meta_business_account_id: str | None = None
    meta_access_token: str | None = None
    ig_business_account_id: str | None = None
    ig_access_token: str | None = None
    datafast_entity_id: str | None = None
    datafast_api_token: str | None = None
    ai_system_prompt: str | None = None
    bank_name: str | None = None
    person_name: str | None = None
    account_type: str | None = None
    account_id: str | None = None
    identification_number: str | None = None
    capabilities: list[str] | None = None
    delivery_enabled: bool = False
    payment_methods: list[str] | None = None
    currency: str | None = None
    timezone: str | None = None
    business_hours: dict[str, Any] | None = None
    store_slug: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class PurchaseOrderItem(_BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_cost: Decimal


@dataclass
class PurchaseOrder(_BaseModel):
    supplier_name: str
    items: list
    id: str | None = None
    supplier_id: str | None = None
    total_cost: Decimal | None = None
    status: str = "draft"
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class User(_BaseModel):
    email: str
    tenant_id: str
    id: str | None = None
    role: str = "staff"
    display_name: str | None = None
    status: str = "active"
    invited_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class SquareConnection(_BaseModel):
    tenant_id: str
    square_merchant_id: str
    square_access_token: str
    square_refresh_token: str | None = None
    square_location_id: str | None = None
    connected_at: str | None = None
    updated_at: str | None = None


@dataclass
class Payment(_BaseModel):
    square_payment_id: str
    amount: Decimal
    id: str | None = None
    transaction_id: str | None = None
    square_order_id: str | None = None
    currency: str = "USD"
    status: str = "pending"
    source_type: str = "card_present"
    card_brand: str | None = None
    card_last4: str | None = None
    receipt_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class AIInsight(_BaseModel):
    tenant_id: str
    date: str
    summary: str
    generated_at: str
    forecasts: list | None = None
    reorder_suggestions: list | None = None
    spending_trends: list | None = None
    revenue_insights: list | None = None
    lead_insights: list | None = None


@dataclass
class Contact(_BaseModel):
    name: str
    tenant_id: str | None = None
    contact_id: str | None = None
    phone: str | None = None
    email: str | None = None
    source_channel: str | None = None
    lead_status: str = "prospect"
    tier: str = "bronze"
    total_spent: Decimal | None = None
    last_activity_ts: str | None = None
    tags: list[str] | None = None
    created_ts: str | None = None
    # WhatsApp: "bot" = AI/n8n handles replies; "human" = staff-only until set back to bot
    conversation_mode: str = "bot"


@dataclass
class Message(_BaseModel):
    tenant_id: str | None = None
    message_id: str | None = None
    channel: str = "whatsapp"
    channel_message_id: str | None = None
    direction: str | None = None  # inbound | outbound
    from_number: str | None = None
    to_number: str | None = None
    text: str | None = None
    metadata: dict[str, Any] | None = None
    contact_id: str | None = None
    category: str = "activo"
    processed_flags: list[str] | None = None
    created_ts: str | None = None


@dataclass
class Campaign(_BaseModel):
    name: str
    message_template: str
    id: str | None = None
    segment_filters: dict | None = None   # tier, lead_status, min_spent, max_spent, days_inactive, tag
    status: str = "draft"                 # draft | sending | sent | failed
    sent_count: int = 0
    failed_count: int = 0
    error_message: str | None = None

    scheduled_at: str | None = None
    n8n_webhook_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class ConversationSummary(_BaseModel):
    """Fast inbox/reminder view per customer conversation."""

    tenant_id: str
    customer_phone: str
    channel: str = "whatsapp"
    category: str = "activo"
    last_message_ts: str | None = None
    last_inbound_ts: str | None = None
    last_outbound_ts: str | None = None
    last_direction: str | None = None
    last_text: str | None = None
    updated_at: str | None = None
