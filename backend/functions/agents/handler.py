"""AI Social Media Campaign Agents Lambda.

Three practical scenarios that generate a campaign kit (copy + image) for
Instagram/Facebook ads, targeting real business data from DynamoDB.

POST /agents/{scenario}/run
  scenario: inactive | featured | vip

Response: { copy, image_url, wa_link, scenario }
"""

from __future__ import annotations

import base64
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
# Helpers (mirrors ai_insights pattern)
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
    model_id = os.environ.get("GEMINI_MODEL_ID", "gemma-3-1b")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config={"max_output_tokens": 2048, "temperature": 0.8},
    )
    text = _gemini_text(response)
    if not text:
        raise ValueError("Gemini returned no text")
    return _extract_json(text)


def _generate_image(image_prompt: str, tenant_id: str, scenario: str) -> str | None:
    """Generate image with Imagen 3, upload to S3, return public URL."""
    try:
        client = _gemini_client()
        # Using the state-of-the-art Imagen 4 Fast model for ultra-fast ad visuals
        model_id = "imagen-4.0-fast-001"
        
        result = client.models.generate_images(
            model=model_id,
            prompt=image_prompt,
            config={"number_of_images": 1, "aspect_ratio": "1:1"},
        )
        images = getattr(result, "generated_images", None) or []
        if not images:
            print(f"DEBUG Error: AI generated NO images for prompt: {image_prompt[:100]}...")
            return None
        
        image_bytes = getattr(images[0].image, "image_bytes", None)
        if not image_bytes:
            print("DEBUG Error: AI image object has NO bytes")
            return None
            
    except Exception as e:
        print(f"DEBUG Error: AI Image generation failed fundamentally: {str(e)}")
        return None

    # Upload to S3
    try:
        import boto3
        bucket = os.environ.get("DATA_BUCKET", "")
        if not bucket:
            print("DEBUG Error: DATA_BUCKET environment variable is MISSING or EMPTY")
            return None
            
        s3 = boto3.client("s3")
        now_ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        key = f"agents/{tenant_id}/{scenario}/{now_ts}.png"
        
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=image_bytes,
            ContentType="image/png",
        )
        
        region = os.environ.get("AWS_REGION", "us-east-1")
        image_url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        print(f"DEBUG Success: Image uploaded to {image_url}")
        return image_url
        
    except Exception as e:
        print(f"DEBUG Error: S3 upload failed: {str(e)}")
        return None


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

    # Tenant info
    tenant = get_item(pk, build_sk("TENANT", tenant_id)) or {}

    # Products
    products = []
    last_key = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="PRODUCT#", limit=100, last_key=last_key)
        products.extend(items)
        if not last_key:
            break

    # Contacts
    contacts = []
    last_key = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="CONTACT#", limit=200, last_key=last_key)
        contacts.extend(items)
        if not last_key:
            break

    # Recent transactions (last 100)
    transactions = []
    last_key = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix="TXN#", limit=100, last_key=last_key)
        transactions.extend(items)
        if not last_key or len(transactions) >= 100:
            break
    transactions = transactions[:100]

    # Inactive contacts: no purchase in 30+ days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    inactive = [
        c for c in contacts
        if not c.get("last_activity_ts") or c.get("last_activity_ts", "") < cutoff
    ]

    # Gold contacts
    gold = [c for c in contacts if c.get("tier") == "gold"]

    # Best selling product by revenue (or manually selected)
    best_product = None
    if product_id:
        best_product = next((p for p in products if (p.get("sk", "").split("#")[-1] or p.get("id", "")) == product_id), None)

    if not best_product:
        product_revenue: dict[str, float] = {}
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
# Scenario prompts
# ---------------------------------------------------------------------------

def _build_prompt(scenario: str, data: dict) -> str:
    tenant = data["tenant"]
    business_name = tenant.get("business_name", "la tienda")

    if scenario == "inactive":
        count = len(data["inactive_contacts"])
        products_preview = ", ".join(
            p.get("name", "") for p in data["products"][:5] if p.get("name")
        ) or "nuestros productos"
        return f"""Eres un experto en marketing digital para pequeños negocios latinoamericanos.
Crea una campaña de reactivación para clientes inactivos (sin compras en 30+ días).

Negocio: {business_name}
Clientes inactivos: {count}
Productos disponibles: {products_preview}

Genera copy para un anuncio de Instagram/Facebook en español. El objetivo es que vuelvan a comprar.
Incluye urgencia y un llamado a la acción claro.

Responde SOLO con este JSON (sin texto adicional):
{{
  "headline": "título del anuncio (máx 40 caracteres)",
  "body": "texto principal del anuncio (máx 150 palabras, casual y directo)",
  "cta": "texto del botón de llamado a la acción (máx 20 caracteres)",
  "image_prompt": "detailed English prompt for Imagen AI to generate a warm, inviting product/lifestyle photo for a Latin American small business ad (no text in image, photorealistic)"
}}"""

    elif scenario == "featured":
        bp = data["best_product"] or {}
        name = bp.get("name", "nuestro producto destacado")
        price = _to_float(bp.get("unit_cost", 0))
        category = bp.get("category", "")
        image_url = bp.get("image_url", "")
        return f"""Eres un experto en marketing digital para pequeños negocios latinoamericanos.
Crea un anuncio para promocionar el producto más vendido del negocio.

Negocio: {business_name}
Producto destacado: {name}
Precio: ${price:.2f}
Categoría: {category}
{'Tiene imagen: sí' if image_url else 'Sin imagen propia'}

Genera copy para un anuncio de Instagram/Facebook en español que destaque este producto.

Responde SOLO con este JSON (sin texto adicional):
{{
  "headline": "título del anuncio (máx 40 caracteres)",
  "body": "texto principal del anuncio (máx 150 palabras, entusiasta y convincente)",
  "cta": "texto del botón de llamado a la acción (máx 20 caracteres)",
  "image_prompt": "detailed English prompt for Imagen AI to generate a beautiful, appetizing/appealing product photo of '{name}' for a Latin American small business Instagram ad (photorealistic, good lighting, no text overlay)"
}}"""

    else:  # vip
        count = len(data["gold_contacts"])
        products_preview = ", ".join(
            p.get("name", "") for p in data["products"][:5] if p.get("name")
        ) or "productos exclusivos"
        return f"""Eres un experto en marketing digital para pequeños negocios latinoamericanos.
Crea un anuncio exclusivo para clientes VIP (los mejores compradores del negocio).

Negocio: {business_name}
Clientes VIP: {count}
Productos disponibles: {products_preview}

Genera copy para un anuncio de Instagram/Facebook en español que haga sentir especiales a los clientes VIP.
Tono exclusivo, de aprecio y privilegio.

Responde SOLO con este JSON (sin texto adicional):
{{
  "headline": "título del anuncio (máx 40 caracteres)",
  "body": "texto principal del anuncio (máx 150 palabras, exclusivo y personal)",
  "cta": "texto del botón de llamado a la acción (máx 20 caracteres)",
  "image_prompt": "detailed English prompt for Imagen AI to generate a premium, luxurious lifestyle photo for a VIP customer campaign for a Latin American small business (photorealistic, elegant, no text in image)"
}}"""


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------

def _run_scenario(tenant_id: str, scenario: str, product_id: str | None = None) -> dict:
    gate = _require_pro(tenant_id)
    if gate:
        return gate
    
    if scenario not in VALID_SCENARIOS:
        return error(f"Escenario '{scenario}' no válido. Usa: inactive, featured, o vip.", 400)

    try:
        data = _gather_data(tenant_id, product_id=product_id)
    except Exception as e:
        return server_error(f"Error cargando datos: {e}")

    prompt = _build_prompt(scenario, data)

    try:
        copy_data = _call_gemini(prompt)
    except Exception as e:
        return server_error(f"Error generando copy: {e}")

    # Simplified: focus on high-quality ad copy only
    image_url = None
    wa_link = ""
    
    tenant = data["tenant"]
    phone = (tenant.get("phone_number") or "").strip().lstrip("+")
    phone_clean = "".join(c for c in phone if c.isdigit())
    if phone_clean:
        wa_link = f"https://wa.me/{phone_clean}?text=Hola"

    # Save to history
    try:
        campaign_id = _save_ai_campaign(tenant_id, scenario, copy_data, image_url, wa_link)
    except Exception:
        campaign_id = None

    return success({
        "campaign_id": campaign_id,
        "scenario": scenario,
        "copy": copy_data,
        "image_url": image_url,
        "wa_link": wa_link,
    })


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------

@require_auth
def lambda_handler(event: dict, context: Any = None) -> dict:
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path_params = _get_path_params(event)
    scenario = path_params.get("agent_type", "")  # reuses existing route {agent_type}
    path = event.get("rawPath") or event.get("path") or ""

    if method == "GET" and path.endswith("/history"):
        return _list_ai_history(tenant_id)

    if method == "POST" and scenario:
        body = {}
        try:
            body = parse_body(event) or {}
        except Exception:
            pass
        product_id = body.get("product_id") or None
        return _run_scenario(tenant_id, scenario, product_id=product_id)

    return not_found("Route not found")
