"""AI Social Media Campaign Agents Lambda.

Three practical scenarios that generate a campaign kit (copy only) for
Instagram/Facebook ads, targeting real business data from DynamoDB.

POST /agents/{scenario}/run
  scenario: inactive | featured | vip

Response: { copy, image_url: null, wa_link, scenario }
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.db import get_item, query_items, put_item
from shared.auth import require_auth
from shared.response import success, error, server_error, not_found
from shared.utils import build_pk, build_sk, parse_body, generate_id, now_iso


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_SCENARIOS = frozenset({"inactive", "featured", "vip"})
PRO_PLANS = frozenset({"pro"})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_method(event: dict) -> str:
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path_params(event: dict) -> dict:
    return event.get("pathParameters") or {}


def _to_float(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _get_tenant_plan(tenant_id: str) -> str:
    try:
        item = get_item(pk=build_pk(tenant_id), sk=build_sk("TENANT", tenant_id))
        return (item or {}).get("plan", "free") or "free"
    except Exception:
        return "free"


def _require_pro(tenant_id: str) -> dict | None:
    if _get_tenant_plan(tenant_id) not in PRO_PLANS:
        return error("Los agentes IA requieren el plan Pro. Por favor actualiza tu cuenta.", 403)
    return None


def _extract_json(text: str) -> dict:
    original = (text or "").strip()
    if not original:
        raise ValueError("Empty response")
    candidates = []
    # Search for markdown JSON block
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", original)
    if m:
        candidates.append(m.group(1).strip())
    candidates.append(original)
    
    decoder = json.JSONDecoder()
    for s in candidates:
        s = s.strip()
        if not s:
            continue
        try:
            parsed = json.loads(s)
        except json.JSONDecodeError:
            start = s.find("{")
            if start == -1:
                continue
            try:
                parsed, _ = decoder.raw_decode(s, start)
            except json.JSONDecodeError:
                continue
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("No JSON object in response")


def _gemini_text(response: Any) -> str:
    t = getattr(response, "text", None)
    if isinstance(t, str) and t.strip():
        return t
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return ""
    content = getattr(candidates[0], "content", None)
    parts = getattr(content, "parts", None) if content else None
    if not parts:
        return ""
    return "".join(getattr(p, "text", "") or "" for p in parts).strip()


def _gemini_client():
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")
    try:
        from google import genai  # type: ignore
    except ImportError as e:
        raise ValueError(f"Gemini SDK not installed: {e}") from e
    return genai.Client(api_key=api_key)


def _call_gemini(prompt: str) -> dict:
    client = _gemini_client()
    # Use Gemma 3 1B as requested by the user
    model_id = os.environ.get("GEMINI_MODEL_ID", "gemma-3-1b")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config={"max_output_tokens": 1024, "temperature": 0.7},
    )
    text = _gemini_text(response)
    if not text:
        raise ValueError("AI returned no text")
    return _extract_json(text)


# ---------------------------------------------------------------------------
# Data gathering
# ---------------------------------------------------------------------------

def _save_ai_campaign(tenant_id: str, scenario: str, copy_data: dict, image_url: str | None, wa_link: str) -> str:
    campaign_id = generate_id()
    pk = build_pk(tenant_id)
    sk = build_sk("AI_CAMPAIGN", campaign_id)
    put_item({
        "pk": pk,
        "sk": sk,
        "id": campaign_id,
        "tenant_id": tenant_id,
        "scenario": scenario,
        "copy": copy_data,
        "image_url": image_url or "",
        "wa_link": wa_link,
        "created_at": now_iso(),
    })
    return campaign_id


def _list_ai_history(tenant_id: str) -> dict:
    pk = build_pk(tenant_id)
    items = []
    last_key = None
    while True:
        batch, last_key = query_items(pk=pk, sk_prefix="AI_CAMPAIGN#", limit=50, last_key=last_key)
        items.extend(batch)
        if not last_key:
            break
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return success({"campaigns": items[:20]})


def _gather_data(tenant_id: str, product_id: str | None = None) -> dict:
    pk = build_pk(tenant_id)
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}

    products = []
    items, _ = query_items(pk=pk, sk_prefix="PRODUCT#", limit=100)
    products = items

    contacts = []
    items, _ = query_items(pk=pk, sk_prefix="CONTACT#", limit=200)
    contacts = items

    transactions = []
    items, _ = query_items(pk=pk, sk_prefix="TXN#", limit=50)
    transactions = items

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    inactive = [
        c for c in contacts
        if not c.get("last_activity_ts") or c.get("last_activity_ts", "") < cutoff
    ]
    gold = [c for c in contacts if c.get("tier") == "gold"]

    best_product = None
    if product_id:
        best_product = next((p for p in products if (p.get("sk", "").split("#")[-1] or p.get("id", "")) == product_id), None)

    if not best_product:
        product_revenue = {}
        for txn in transactions:
            for item in txn.get("items", []):
                pid = item.get("product_id") or item.get("id") or ""
                subtotal = _to_float(item.get("unit_price", 0)) * int(item.get("quantity", 1))
                product_revenue[pid] = product_revenue.get(pid, 0) + subtotal

        if product_revenue:
            best_pid = max(product_revenue, key=lambda k: product_revenue[k])
            best_product = next((p for p in products if (p.get("sk", "").split("#")[-1] or p.get("id", "")) == best_pid), None)
        if not best_product and products:
            best_product = products[0]

    return {
        "tenant": tenant,
        "products": products,
        "inactive_contacts": inactive,
        "gold_contacts": gold,
        "best_product": best_product,
        "total_contacts": len(contacts),
    }


# ---------------------------------------------------------------------------
# Scenario prompts (Strictly copy-only)
# ---------------------------------------------------------------------------

def _build_prompt(scenario: str, data: dict) -> str:
    tenant = data["tenant"]
    business_name = tenant.get("business_name", "la tienda")

    base_instruction = """Eres un experto en marketing digital para pequeños negocios latinoamericanos.
Genera copy para un anuncio de Instagram/Facebook en español. El objetivo es maximizar conversiones.
Responde SOLO con este JSON (sin texto adicional, sin menciones a imágenes):
{
  "headline": "título del anuncio (máx 40 caracteres)",
  "body": "texto principal del anuncio (máx 150 palabras, casual y directo)",
  "cta": "texto del botón de llamado a la acción (máx 20 caracteres)"
}"""

    if scenario == "inactive":
        count = len(data["inactive_contacts"])
        return f"{base_instruction}\n\nEscenario: Reactivación de clientes ({count} inactivos).\nNegocio: {business_name}."

    elif scenario == "featured":
        bp = data["best_product"] or {}
        name = bp.get("name", "nuestro producto")
        return f"{base_instruction}\n\nEscenario: Producto destacado ({name}).\nNegocio: {business_name}."

    else:  # vip
        count = len(data["gold_contacts"])
        return f"{base_instruction}\n\nEscenario: Exclusivo para clientes VIP ({count} clientes).\nNegocio: {business_name}."


# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def _run_scenario(tenant_id: str, scenario: str, product_id: str | None = None) -> dict:
    gate = _require_pro(tenant_id)
    if gate:
        return gate
    
    if scenario not in VALID_SCENARIOS:
        return error(f"Escenario '{scenario}' no válido.", 400)

    try:
        data = _gather_data(tenant_id, product_id=product_id)
        prompt = _build_prompt(scenario, data)
        copy_data = _call_gemini(prompt)

        # Build WhatsApp link
        tenant = data["tenant"]
        phone = (tenant.get("phone_number") or "").strip().lstrip("+")
        phone_clean = "".join(c for c in phone if c.isdigit())
        wa_link = f"https://wa.me/{phone_clean}?text=Hola" if phone_clean else ""

        campaign_id = _save_ai_campaign(tenant_id, scenario, copy_data, None, wa_link)

        return success({
            "campaign_id": campaign_id,
            "scenario": scenario,
            "copy": copy_data,
            "image_url": None,
            "wa_link": wa_link,
        })
    except Exception as e:
        return server_error(f"Error procesando agente: {str(e)}")


@require_auth
def lambda_handler(event: dict, context: Any = None) -> dict:
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path_params = _get_path_params(event)
    scenario = path_params.get("agent_type", "")
    path = event.get("rawPath") or event.get("path") or ""

    if method == "GET" and path.endswith("/history"):
        return _list_ai_history(tenant_id)

    if method == "POST" and scenario:
        body = parse_body(event) or {}
        return _run_scenario(tenant_id, scenario, product_id=body.get("product_id"))

    return not_found("Route not found")
