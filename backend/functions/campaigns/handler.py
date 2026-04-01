"""Campaigns Lambda handler — broadcast WhatsApp messages to contact segments."""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import delete_item, get_item, put_item, query_items, update_item
from shared.db import DynamoDBError
from shared.models import Campaign
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

CAMPAIGN_SK_PREFIX = "CAMPAIGN#"
VALID_STATUSES = {"draft", "sending", "sent", "failed"}

# n8n webhook URL for campaign execution (set as Lambda env var)
N8N_CAMPAIGN_WEBHOOK = os.environ.get("N8N_CAMPAIGN_WEBHOOK_URL", "")


def _build_campaign_item(
    pk: str, sk: str, tenant_id: str, campaign_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    now = now_iso()
    return {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "campaign_id": campaign_id,
        "id": campaign_id,
        "name": data["name"],
        "message_template": data["message_template"],
        "segment_filters": data.get("segment_filters") or {},
        "status": "draft",
        "sent_count": 0,
        "failed_count": 0,
        "scheduled_at": data.get("scheduled_at"),
        "created_at": now,
        "updated_at": now,
    }


def list_campaigns(tenant_id: str) -> dict[str, Any]:
    """GET /campaigns — list all campaigns for this tenant."""
    pk = build_pk(tenant_id)
    try:
        items, _ = query_items(pk=pk, sk_prefix=CAMPAIGN_SK_PREFIX, limit=100)
        campaigns = [Campaign.from_dynamo(item).to_dict() for item in items]
        campaigns.sort(key=lambda c: c.get("created_at") or "", reverse=True)
        return success({"campaigns": campaigns})
    except DynamoDBError as e:
        return server_error(str(e))


def create_campaign(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /campaigns — create a new campaign in draft status."""
    try:
        body = parse_body(event)
    except Exception:
        return error("Cuerpo JSON inválido", 400)

    name = (body.get("name") or "").strip()
    message_template = (body.get("message_template") or "").strip()

    if not name:
        return error("El nombre de la campaña es requerido", 400)
    if not message_template:
        return error("El mensaje de la campaña es requerido", 400)

    campaign_id = generate_id()
    pk = build_pk(tenant_id)
    sk = build_sk("CAMPAIGN", campaign_id)
    item = _build_campaign_item(pk, sk, tenant_id, campaign_id, body)

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(Campaign.from_dynamo(item).to_dict())


def get_campaign(tenant_id: str, campaign_id: str) -> dict[str, Any]:
    """GET /campaigns/{id} — get a single campaign."""
    pk = build_pk(tenant_id)
    sk = build_sk("CAMPAIGN", campaign_id)
    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return not_found("Campaña no encontrada")
    return success(Campaign.from_dynamo(item).to_dict())


def patch_campaign(tenant_id: str, campaign_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """PATCH /campaigns/{id} — update campaign fields (used by n8n to report stats)."""
    pk = build_pk(tenant_id)
    sk = build_sk("CAMPAIGN", campaign_id)
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Campaña no encontrada")

    try:
        body = parse_body(event)
    except Exception:
        return error("Cuerpo JSON inválido", 400)

    allowed = {"name", "message_template", "segment_filters", "status", "sent_count", "failed_count", "error_message", "scheduled_at"}
    updates: dict[str, Any] = {k: v for k, v in body.items() if k in allowed}
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        return error(f"status debe ser uno de: {', '.join(sorted(VALID_STATUSES))}", 400)
    updates["updated_at"] = now_iso()

    try:
        updated = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(Campaign.from_dynamo(updated).to_dict())


def send_campaign(tenant_id: str, campaign_id: str) -> dict[str, Any]:
    """POST /campaigns/{id}/send — trigger immediate send via n8n webhook."""
    pk = build_pk(tenant_id)
    sk = build_sk("CAMPAIGN", campaign_id)
    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return not_found("Campaña no encontrada")

    current_status = item.get("status", "draft")
    if current_status == "sending":
        return error("La campaña ya está en proceso de envío", 409)
    if current_status == "sent":
        return error("La campaña ya fue enviada", 409)

    # Mark as sending
    try:
        update_item(pk=pk, sk=sk, updates={"status": "sending", "updated_at": now_iso()})
    except DynamoDBError as e:
        return server_error(str(e))

    # Trigger n8n webhook
    webhook_url = N8N_CAMPAIGN_WEBHOOK
    if not webhook_url:
        # If no webhook configured, just mark as failed
        try:
            update_item(pk=pk, sk=sk, updates={"status": "failed", "updated_at": now_iso()})
        except Exception:
            pass
        return error("N8N_CAMPAIGN_WEBHOOK_URL no está configurada", 503)

    payload = json.dumps({
        "campaign_id": campaign_id,
        "tenant_id": tenant_id,
        "message_template": item.get("message_template", ""),
        "segment_filters": item.get("segment_filters") or {},
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        try:
            update_item(pk=pk, sk=sk, updates={"status": "failed", "updated_at": now_iso()})
        except Exception:
            pass
        return server_error(f"Error al activar el workflow de campaña: {e}")

    return success({"mensaje": "Campaña iniciada", "campaign_id": campaign_id, "status": "sending"})


def delete_campaign(tenant_id: str, campaign_id: str) -> dict[str, Any]:
    """DELETE /campaigns/{id} — delete a draft campaign."""
    pk = build_pk(tenant_id)
    sk = build_sk("CAMPAIGN", campaign_id)
    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return not_found("Campaña no encontrada")
    if item.get("status") == "sending":
        return error("No se puede eliminar una campaña en proceso de envío", 409)
    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route campaign requests."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        path_params = event.get("pathParameters") or {}
        campaign_id = path_params.get("id")
        tenant_id = event.get("tenant_id", "")

        # GET /campaigns
        if method == "GET" and (path == "/campaigns" or path.endswith("/campaigns")) and not campaign_id:
            return list_campaigns(tenant_id)

        # POST /campaigns
        if method == "POST" and (path == "/campaigns" or path.endswith("/campaigns")) and not campaign_id:
            return create_campaign(tenant_id, event)

        # POST /campaigns/{id}/send
        if method == "POST" and campaign_id and path.endswith("/send"):
            return send_campaign(tenant_id, campaign_id)

        # GET /campaigns/{id}
        if method == "GET" and campaign_id:
            return get_campaign(tenant_id, campaign_id)

        # PATCH /campaigns/{id}
        if method == "PATCH" and campaign_id:
            return patch_campaign(tenant_id, campaign_id, event)

        # DELETE /campaigns/{id}
        if method == "DELETE" and campaign_id:
            return delete_campaign(tenant_id, campaign_id)

        return error("Método no permitido", 405)
    except Exception as e:
        return server_error(str(e))
