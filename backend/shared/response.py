"""API response helpers for API Gateway."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}


def _json_default(obj: Any) -> Any:
    """Handle Decimal and other non-serializable types in JSON encoding."""
    if isinstance(obj, Decimal):
        if obj == int(obj):
            return int(obj)
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def success(body: dict[str, Any] | None = None, status_code: int = 200) -> dict[str, Any]:
    """Return a properly formatted API Gateway response with JSON body and CORS headers."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            **CORS_HEADERS,
        },
        "body": json.dumps(
            body if body is not None else {},
            default=_json_default,
        ),
    }


def error(message: str, status_code: int = 400) -> dict[str, Any]:
    """Return an error response."""
    return success(body={"error": message}, status_code=status_code)


def created(body: dict[str, Any]) -> dict[str, Any]:
    """Return a 201 Created response."""
    return success(body=body, status_code=201)


def no_content() -> dict[str, Any]:
    """Return a 204 No Content response."""
    return {
        "statusCode": 204,
        "headers": CORS_HEADERS,
        "body": "",
    }


def not_found(message: str = "Resource not found") -> dict[str, Any]:
    """Return a 404 Not Found response."""
    return error(message=message, status_code=404)


def server_error(message: str = "Internal server error") -> dict[str, Any]:
    """Return a 500 Internal Server Error response."""
    return error(message=message, status_code=500)
