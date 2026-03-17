"""Auth middleware and helpers for API Gateway + Cognito JWT + service key."""

from __future__ import annotations

import hmac
import json
import os
import urllib.request
from functools import wraps
from typing import Any, Callable, TypeVar

try:
    from typing import ParamSpec
except ImportError:
    from typing_extensions import ParamSpec

P = ParamSpec("P")
R = TypeVar("R")

# Cached Cognito JWKS (key id -> public key) so we don't fetch on every request
_jwks_cache: dict[str, Any] | None = None


def _get_cognito_jwks() -> dict[str, Any]:
    """Fetch Cognito JWKS for the user pool (cached)."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    pool_id = os.environ.get("COGNITO_USER_POOL_ID", "").strip()
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    if not pool_id:
        return {}
    url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            _jwks_cache = {k["kid"]: k for k in data.get("keys", [])}
            return _jwks_cache
    except Exception:
        return {}


def _decode_bearer_token(event: dict[str, Any]) -> dict[str, Any] | None:
    """
    When API Gateway does not run the JWT authorizer (e.g. messages/contacts routes),
    decode the Bearer token from the Authorization header and return claims.
    Returns None if token is missing, invalid, or verification fails.
    Uses PyJWT only when available (lazy import so Lambda does not crash if layer missing).
    """
    try:
        import jwt
    except ImportError:
        return None
    headers = event.get("headers") or {}
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    pool_id = os.environ.get("COGNITO_USER_POOL_ID", "").strip()
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"
    jwks = _get_cognito_jwks()
    if not jwks:
        return None
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        if not kid or kid not in jwks:
            return None
        key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwks[kid]))
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
        return payload
    except Exception:
        return None


def _get_claims_from_event(event: dict[str, Any]) -> dict[str, Any] | None:
    """Get JWT claims from either API Gateway authorizer or from Bearer token in header."""
    try:
        claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
        if claims and claims.get("custom:tenant_id"):
            return claims
    except (AttributeError, TypeError, KeyError):
        pass
    try:
        return _decode_bearer_token(event)
    except Exception:
        return None


def _extract_jwt_tenant_id(event: dict[str, Any]) -> str | None:
    """Extract tenant_id from Cognito JWT claims (authorizer or Bearer token)."""
    claims = _get_claims_from_event(event)
    return claims.get("custom:tenant_id") if claims else None


def validate_service_key(event: dict[str, Any]) -> bool:
    """Return True if X-Service-Key header matches SERVICE_API_KEY. Use for routes that only need key validation (e.g. resolve-phone)."""
    service_api_key = os.environ.get("SERVICE_API_KEY", "").strip()
    if not service_api_key:
        return False
    headers = event.get("headers") or {}
    raw = headers.get("x-service-key") or headers.get("X-Service-Key") or ""
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if isinstance(raw, bytes):
        provided_key = raw.decode("utf-8", errors="replace").strip()
    elif isinstance(raw, str):
        provided_key = raw.strip()
    else:
        provided_key = ""
    if not provided_key:
        return False
    a, b = str(provided_key).strip(), str(service_api_key).strip()
    return a == b


def extract_service_tenant_id(event: dict[str, Any]) -> str | None:
    """Extract tenant_id from service key auth (X-Service-Key + X-Tenant-Id headers)."""
    if not validate_service_key(event):
        return None
    headers = event.get("headers") or {}
    return headers.get("x-tenant-id") or headers.get("X-Tenant-Id") or None


def extract_tenant_id(event: dict[str, Any]) -> str | None:
    """Extract tenant_id from JWT claims first, then fall back to service key auth."""
    tenant_id = _extract_jwt_tenant_id(event)
    if tenant_id:
        return tenant_id
    return extract_service_tenant_id(event)


def extract_user_info(event: dict[str, Any]) -> dict[str, Any]:
    """Extract user info (sub, email, tenant_id, role) from JWT claims (authorizer or Bearer token)."""
    claims = _get_claims_from_event(event)
    if not claims:
        return {"sub": None, "email": None, "tenant_id": None, "role": None}
    return {
        "sub": claims.get("sub"),
        "email": claims.get("email"),
        "tenant_id": claims.get("custom:tenant_id"),
        "role": claims.get("custom:role"),
    }


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
        try:
            tenant_id = extract_tenant_id(event)
            if not tenant_id:
                return error("Missing or invalid tenant_id in JWT claims", 401)
            event["tenant_id"] = tenant_id
            event["user_info"] = extract_user_info(event)
        except Exception:
            return error("Missing or invalid tenant_id in JWT claims", 401)

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
