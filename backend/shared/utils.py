"""General utilities for CRM backend."""

import base64
import json
from datetime import datetime, timezone

import ulid


def generate_id() -> str:
    """Generate a ULID-based ID."""
    return str(ulid.new())


def now_iso() -> str:
    """Current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    """Today's date as YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def parse_body(event: dict) -> dict:
    """Parse the JSON body from an API Gateway event (handles base64 encoding if needed)."""
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    return json.loads(body) if isinstance(body, str) else body


def build_pk(tenant_id: str) -> str:
    """Return partition key for tenant: TENANT#<tenant_id>."""
    return f"TENANT#{tenant_id}"


def build_sk(entity_type: str, entity_id: str) -> str:
    """Return sort key: <entity_type>#<entity_id>."""
    return f"{entity_type}#{entity_id}"
