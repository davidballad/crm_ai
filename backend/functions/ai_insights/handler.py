"""AI insights Lambda handler for multi-tenant SaaS CRM.

Uses Google Gemini (AI Studio) via the official SDK. The client reads GEMINI_API_KEY
from the environment (set in Terraform or Lambda Console).
"""

from __future__ import annotations

import sys
import os
import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.db import get_item, put_item, query_items, get_table
from shared.auth import require_auth
from shared.response import success, error, server_error, not_found, created
from shared.models import Contact, Product, Transaction
from shared.utils import now_iso, today_str, build_pk, build_sk, parse_body

from boto3.dynamodb.conditions import Key


def _get_method(event: dict[str, Any]) -> str:
    """Extract HTTP method from event."""
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path(event: dict[str, Any]) -> str:
    """Extract path from event."""
    return event.get("path", "") or event.get("rawPath", "")


def _get_query_params(event: dict[str, Any]) -> dict[str, str]:
    """Extract query parameters from event."""
    params = event.get("queryStringParameters") or {}
    return {k: v for k, v in params.items()} if isinstance(params, dict) else {}


def _to_json_serializable(obj: Any) -> Any:
    """Recursively convert DynamoDB/Decimal values to JSON-serializable types."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _to_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_json_serializable(i) for i in obj]
    return obj


def _floats_to_decimal(obj: Any) -> Any:
    """Recursively convert float to Decimal for DynamoDB (boto3 rejects Python float)."""
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, int):
        return obj
    if isinstance(obj, Decimal):
        return obj
    if isinstance(obj, dict):
        return {k: _floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_floats_to_decimal(i) for i in obj]
    return obj


# ---------------------------------------------------------------------------
# Data gathering helpers for generate_insights
# ---------------------------------------------------------------------------


def _gather_products(tenant_id: str) -> tuple[list[dict[str, Any]], int, Any]:
    """
    Query all products for the tenant. Returns (products, low_stock_count, total_inventory_value).
    """
    pk = build_pk(tenant_id)
    all_products: list[dict[str, Any]] = []
    last_key = None

    while True:
        items, last_key = query_items(
            pk=pk,
            sk_prefix="PRODUCT#",
            limit=200,
            last_key=last_key,
        )
        all_products.extend(items)
        if last_key is None:
            break

    total_inventory_value = Decimal("0")
    low_stock_count = 0

    for item in all_products:
        try:
            product = Product.from_dynamo(item)
            if product.unit_cost is not None:
                total_inventory_value += product.unit_cost * product.quantity
            if product.quantity <= product.reorder_threshold:
                low_stock_count += 1
        except Exception:
            continue

    return all_products, low_stock_count, total_inventory_value


def _gather_transactions(tenant_id: str) -> list[dict[str, Any]]:
    """Query transactions from the last 30 days."""
    pk = build_pk(tenant_id)
    end_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_date = end_date - timedelta(days=30)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    sk_start = f"TXN#{start_str}"
    sk_end = f"TXN#{end_str}\uffff"

    table = get_table()
    all_items: list[dict[str, Any]] = []
    last_key = None

    while True:
        params: dict[str, Any] = {
            "KeyConditionExpression": Key("pk").eq(pk) & Key("sk").between(sk_start, sk_end),
            "Limit": 500,
        }
        if last_key:
            params["ExclusiveStartKey"] = last_key

        response = table.query(**params)
        items = response.get("Items", [])
        all_items.extend(items)
        last_key = response.get("LastEvaluatedKey")
        if last_key is None:
            break

    return all_items


def _build_transaction_summary(transaction_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute transaction summary: total revenue, count, top products, revenue by day of week."""
    total_revenue = Decimal("0")
    transaction_count = len(transaction_items)
    product_sales: dict[str, dict[str, Any]] = {}  # product_id -> {revenue, qty, name}
    revenue_by_dow: dict[str, Decimal] = {}  # "Monday", etc. -> total

    dow_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    for item in transaction_items:
        try:
            txn = Transaction.from_dynamo(item)
        except Exception:
            continue

        total_revenue += txn.total

        # Day of week
        created_at = txn.created_at or ""
        if created_at:
            try:
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                dow = dow_names[dt.weekday()]
                revenue_by_dow[dow] = revenue_by_dow.get(dow, Decimal("0")) + txn.total
            except (ValueError, TypeError):
                pass

        for line in (txn.items or []):
            pid = line.get("product_id") if isinstance(line, dict) else getattr(line, "product_id", None)
            if not pid:
                continue
            name = line.get("product_name", "") if isinstance(line, dict) else getattr(line, "product_name", "")
            qty = line.get("quantity", 0) if isinstance(line, dict) else getattr(line, "quantity", 0)
            qty = int(qty) if qty is not None else 0
            up = line.get("unit_price", 0) if isinstance(line, dict) else getattr(line, "unit_price", 0)
            up = Decimal(str(up)) if up is not None else Decimal("0")
            if pid not in product_sales:
                product_sales[pid] = {"product_id": pid, "product_name": name, "revenue": Decimal("0"), "quantity": 0}
            product_sales[pid]["revenue"] += qty * up
            product_sales[pid]["quantity"] += qty

    top_products = sorted(
        product_sales.values(),
        key=lambda x: float(x["revenue"]),
        reverse=True,
    )[:10]

    return {
        "total_revenue": float(total_revenue),
        "transaction_count": transaction_count,
        "top_selling_products": [
            {"product_name": p["product_name"], "revenue": float(p["revenue"]), "quantity_sold": p["quantity"]}
            for p in top_products
        ],
        "revenue_by_day_of_week": {k: float(v) for k, v in revenue_by_dow.items()},
    }


def _gather_contacts(tenant_id: str) -> list[dict[str, Any]]:
    """Query all contacts (leads) for the tenant."""
    pk = build_pk(tenant_id)
    all_items: list[dict[str, Any]] = []
    last_key = None
    while True:
        items, last_key = query_items(
            pk=pk,
            sk_prefix="CONTACT#",
            limit=200,
            last_key=last_key,
        )
        all_items.extend(items)
        if last_key is None:
            break
    return all_items


def _build_leads_summary(contact_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate contacts for prompts and dashboard charts (pipeline, tier, recency)."""
    by_status: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    by_source: dict[str, int] = {}
    new_last_30 = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    for raw in contact_items:
        try:
            c = Contact.from_dynamo(raw)
        except Exception:
            continue
        st = (c.lead_status or "prospect").strip() or "prospect"
        by_status[st] = by_status.get(st, 0) + 1
        tier = (c.tier or "bronze").strip() or "bronze"
        by_tier[tier] = by_tier.get(tier, 0) + 1
        src = (c.source_channel or "unknown").strip() or "unknown"
        by_source[src] = by_source.get(src, 0) + 1
        ts = c.created_ts
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    new_last_30 += 1
            except (ValueError, TypeError):
                pass

    total = len(contact_items)
    top_sources = sorted(by_source.items(), key=lambda x: x[1], reverse=True)[:6]

    return {
        "total": total,
        "new_last_30_days": new_last_30,
        "by_lead_status": by_status,
        "by_tier": by_tier,
        "top_source_channels": [{"source": k, "count": v} for k, v in top_sources],
    }


def _build_insights_prompt(
    product_count: int,
    total_inventory_value: Decimal,
    low_stock_count: int,
    low_stock_items: list[dict[str, Any]],
    transaction_summary: dict[str, Any],
    leads_summary: dict[str, Any],
    language: str = "en",
) -> str:
    """Build a structured prompt for the AI model to generate insights."""
    low_stock_list = "\n".join(
        f"- {p.get('name', 'Unknown')} (ID: {p.get('id', '')}): quantity={p.get('quantity', 0)}, threshold={p.get('reorder_threshold', 10)}"
        for p in low_stock_items[:20]
    )

    lang_instruction = (
        "You must write the entire JSON response in Spanish (summary, forecasts, reorder_suggestions, spending_trends, revenue_insights, lead_insights — all text in Spanish)."
        if (language or "").strip().lower().startswith("es")
        else "You must write the entire JSON response in English."
    )

    ls = leads_summary
    leads_block = f"""## Leads & Contacts (CRM)
- Total contacts: {ls.get('total', 0)}
- New contacts (approx. last 30 days, by created_ts): {ls.get('new_last_30_days', 0)}
- Count by lead_status: {json.dumps(ls.get('by_lead_status', {}), default=str)}
- Count by tier: {json.dumps(ls.get('by_tier', {}), default=str)}
- Top source channels: {json.dumps(ls.get('top_source_channels', []), default=str)}"""

    return f"""You are a senior business analyst and growth advisor for a small business CRM. Be specific, actionable, and tie inventory, sales, and pipeline together. {lang_instruction}

Based on the following data, generate a JSON object with the specified fields.

## Business Context (Inventory)
- Total number of products: {product_count}
- Total inventory value (estimated): ${float(total_inventory_value):,.2f}
- Number of low-stock items (quantity <= reorder threshold): {low_stock_count}

Low-stock items (first 20):
{low_stock_list if low_stock_list else "(none)"}

## Transaction Summary (Last 30 Days)
- Total revenue: ${transaction_summary.get('total_revenue', 0):,.2f}
- Transaction count: {transaction_summary.get('transaction_count', 0)}
- Top selling products: {json.dumps(transaction_summary.get('top_selling_products', [])[:5], default=str)}
- Revenue by day of week: {json.dumps(transaction_summary.get('revenue_by_day_of_week', {}), default=str)}

{leads_block}

## Your Task
Generate a JSON object with exactly these keys (no extra keys):

1. "summary" (string): A concise executive-style summary in 3-5 sentences: inventory health, sales momentum, and (if contacts exist) pipeline/leads. Mention trade-offs and priorities.

2. "forecasts" (array of objects): Up to 5 products likely to need restocking soon. Each object: {{"product_name": str, "product_id": str or null, "estimated_restock_date": str (YYYY-MM-DD or "ASAP"), "reason": str}}

3. "reorder_suggestions" (array of objects): Products below threshold with suggested order quantities. Each: {{"product_name": str, "product_id": str or null, "current_quantity": int, "reorder_threshold": int, "suggested_order_quantity": int, "reason": str}}

4. "spending_trends" (array of strings): 2-4 bullet points on cost/inventory spend patterns and what to watch.

5. "revenue_insights" (array of strings): 2-4 bullet points on revenue (best days, mix, growth opportunities).

6. "lead_insights" (array of strings): 2-4 expert bullet points on the sales pipeline — lead_status mix, tier concentration, sources, follow-up priorities, and how leads relate to revenue. If there are zero contacts, use an empty array [].

Return ONLY valid JSON. No markdown, no explanation outside the JSON."""


def _extract_json_from_response(response_text: str) -> dict[str, Any]:
    """Parse JSON from the AI response, handling markdown fences and leading prose."""
    original = (response_text or "").strip()
    if not original:
        raise ValueError("AI returned empty response")

    candidates: list[str] = []
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", original)
    if match:
        inner = match.group(1).strip()
        if inner:
            candidates.append(inner)
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

    raise ValueError("AI did not return a JSON object; try again.")


def _gemini_response_text(response: Any) -> str:
    """Best-effort text from google-genai response (`.text` or concatenated parts)."""
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
    chunks: list[str] = []
    for p in parts:
        pt = getattr(p, "text", None)
        if isinstance(pt, str) and pt:
            chunks.append(pt)
    return "".join(chunks).strip()


def _invoke_gemini(prompt: str) -> dict[str, Any]:
    """Call Google Gemini (AI Studio) via the official SDK and return parsed JSON."""
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in Lambda environment")

    try:
        from google import genai  # type: ignore
    except ImportError as e:
        raise ValueError(f"Gemini SDK not installed: {e}") from e
    except Exception as e:
        raise ValueError(f"Gemini SDK error: {e}") from e

    model_id = os.environ.get("GEMINI_MODEL_ID", "gemini-2.5-flash")
    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={"max_output_tokens": 4096, "temperature": 0.2},
        )
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}") from e

    text = _gemini_response_text(response) if response else ""
    if not text:
        raise ValueError("Gemini response had no text (check finish_reason / safety blocks in logs)")

    return _extract_json_from_response(text)


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------


def get_insights(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /insights - return cached insight for the given date."""
    query_params = _get_query_params(event)
    date_str = query_params.get("date", today_str())

    pk = build_pk(tenant_id)
    sk = build_sk("INSIGHT", date_str)

    try:
        item = get_item(pk=pk, sk=sk)
    except Exception as e:
        import traceback
        try:
            print(f"GET /insights get_item error: {e}")
            print(traceback.format_exc())
        except Exception:
            pass
        return server_error(str(e))

    if not item:
        return success({"insight": None, "date": date_str})

    body = _to_json_serializable(item)
    return success(body)


def _safe_low_stock_items(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build list of low-stock product dicts, skipping any item that fails to parse."""
    result: list[dict[str, Any]] = []
    for p in products:
        try:
            qty = p.get("quantity")
            thresh = p.get("reorder_threshold", 10)
            if qty is None:
                continue
            q = int(qty) if not isinstance(qty, Decimal) else int(qty)
            t = int(thresh) if not isinstance(thresh, Decimal) else int(thresh)
            if q <= t:
                result.append(Product.from_dynamo(p).to_dict())
        except Exception:
            continue
    return result


def generate_insights(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /insights/generate - gather data, call Gemini, store and return insight."""
    date_str = today_str()
    pk = build_pk(tenant_id)
    sk = build_sk("INSIGHT", date_str)

    try:
        body = parse_body(event)
        language = (body.get("language") or "").strip() or "en"

        # Step 1: Gather business data
        products, low_stock_count, total_inventory_value = _gather_products(tenant_id)
        transaction_items = _gather_transactions(tenant_id)
        transaction_summary = _build_transaction_summary(transaction_items)
        low_stock_items = _safe_low_stock_items(products)
        contact_items = _gather_contacts(tenant_id)
        leads_summary = _build_leads_summary(contact_items)

        # Step 2 & 3: Build prompt and call Gemini
        prompt = _build_insights_prompt(
            product_count=len(products),
            total_inventory_value=total_inventory_value,
            low_stock_count=low_stock_count,
            low_stock_items=low_stock_items,
            transaction_summary=transaction_summary,
            leads_summary=leads_summary,
            language=language,
        )

        try:
            ai_result = _invoke_gemini(prompt)
        except ValueError as e:
            return error(str(e), 503)
        except RuntimeError as e:
            return error(f"AI service error: {e}", 503)
        except json.JSONDecodeError as e:
            return error(f"Invalid AI response format: {e}", 502)
        except Exception as e:
            return error(f"AI generation failed: {type(e).__name__}: {e}", 503)

        # Step 4 & 5: Build insight record and store in DynamoDB
        generated_at = now_iso()
        insight_record: dict[str, Any] = {
            "pk": pk,
            "sk": sk,
            "entity_type": "INSIGHT",
            "tenant_id": tenant_id,
            "date": date_str,
            "summary": ai_result.get("summary", "No summary generated."),
            "forecasts": ai_result.get("forecasts", []),
            "reorder_suggestions": ai_result.get("reorder_suggestions", []),
            "spending_trends": ai_result.get("spending_trends", []),
            "revenue_insights": ai_result.get("revenue_insights", []),
            "lead_insights": ai_result.get("lead_insights", []),
            "revenue_by_day_of_week": transaction_summary.get("revenue_by_day_of_week", {}),
            "top_selling_products": (transaction_summary.get("top_selling_products") or [])[:10],
            "leads_by_status": leads_summary.get("by_lead_status", {}),
            "leads_by_tier": leads_summary.get("by_tier", {}),
            "contacts_total": leads_summary.get("total", 0),
            "contacts_new_30d": leads_summary.get("new_last_30_days", 0),
            "generated_at": generated_at,
        }

        ttl_days = 7
        ttl_seconds = int(datetime.now().timestamp()) + (ttl_days * 24 * 60 * 60)
        insight_record["ttl"] = ttl_seconds

        ddb_item = _floats_to_decimal(insight_record)
        put_item(ddb_item)

        # Step 6: Return the insight (convert Decimals for JSON)
        body = _to_json_serializable(ddb_item)
        return created(body)

    except Exception as e:
        import traceback
        err_msg = f"Insights error: {type(e).__name__}: {str(e)}"
        try:
            print(err_msg)
            print(traceback.format_exc())
        except Exception:
            pass
        return server_error(err_msg)


# ---------------------------------------------------------------------------
# Lambda entrypoint
# ---------------------------------------------------------------------------


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Main Lambda handler - routes GET /insights and POST /insights/generate."""
    tenant_id = event.get("tenant_id")
    if not tenant_id:
        return error("Missing tenant_id", 401)

    method = _get_method(event)
    path = _get_path(event)
    path_norm = path.rstrip("/")

    if method == "GET" and ("/insights" in path_norm and not path_norm.endswith("/generate")):
        return get_insights(tenant_id, event)

    if method == "POST" and path_norm.endswith("/insights/generate"):
        return generate_insights(tenant_id, event)

    return error("Not found", 404)
