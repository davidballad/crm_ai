"""Auth middleware and helpers for API Gateway + Cognito JWT."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar

try:
    from typing import ParamSpec
except ImportError:
    from typing_extensions import ParamSpec

P = ParamSpec("P")
R = TypeVar("R")


def extract_tenant_id(event: dict[str, Any]) -> str | None:
    """Extract tenant_id from the Cognito JWT claims in the API Gateway event."""
    try:
        claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
        return claims.get("custom:tenant_id")
    except (AttributeError, TypeError, KeyError):
        return None


def extract_user_info(event: dict[str, Any]) -> dict[str, Any]:
    """Extract user info (sub, email, tenant_id, role) from JWT claims."""
    try:
        claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
        return {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "tenant_id": claims.get("custom:tenant_id"),
            "role": claims.get("custom:role"),
        }
    except (AttributeError, TypeError, KeyError):
        return {"sub": None, "email": None, "tenant_id": None, "role": None}


def require_auth(
    handler: Callable[P, R],
) -> Callable[P, dict[str, Any]]:
    """Decorator that extracts tenant_id and injects it into the event. Returns 401 if missing."""

    @wraps(handler)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> dict[str, Any]:
        from .response import error

        event = args[0] if args else kwargs.get("event", {})
        if not isinstance(event, dict):
            return error("Invalid event", 401)

        tenant_id = extract_tenant_id(event)
        if not tenant_id:
            return error("Missing or invalid tenant_id in JWT claims", 401)

        event["tenant_id"] = tenant_id
        event["user_info"] = extract_user_info(event)

        if args:
            return handler(event, *args[1:], **kwargs)
        kwargs["event"] = event
        return handler(**kwargs)

    return wrapper


def require_role(role: str):
    """Decorator factory that checks the user's custom:role claim."""

    def decorator(handler: Callable[P, R]) -> Callable[P, dict[str, Any]]:
        @wraps(handler)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> dict[str, Any]:
            from .response import error

            event = args[0] if args else kwargs.get("event", {})
            if not isinstance(event, dict):
                return error("Invalid event", 401)

            user_info = event.get("user_info") or extract_user_info(event)
            user_role = user_info.get("role")

            if user_role != role:
                return error(f"Insufficient permissions: role '{role}' required", 403)

            return handler(*args, **kwargs)

        return wrapper

    return decorator
