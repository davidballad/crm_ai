"""AI insights Lambda handler for multi-tenant SaaS CRM."""

import sys
import os
import json
import re
import boto3
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.db import get_item, put_item, query_items, get_table
from shared.auth import require_auth
from shared.response import success, error, server_error, not_found, created
from shared.models import AIInsight, Product, Transaction
from shared.utils import now_iso, today_str, build_pk, build_sk

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


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
        product = Product.from_dynamo(item)
        if product.unit_cost is not None:
            total_inventory_value += product.unit_cost * product.quantity
        if product.quantity <= product.reorder_threshold:
            low_stock_count += 1

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

        for line in txn.items:
            pid = line.product_id
            if pid not in product_sales:
                product_sales[pid] = {"product_id": pid, "product_name": line.product_name, "revenue": Decimal("0"), "quantity": 0}
            product_sales[pid]["revenue"] += line.quantity * line.unit_price
            product_sales[pid]["quantity"] += line.quantity

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


def _build_bedrock_prompt(
    product_count: int,
    total_inventory_value: Decimal,
    low_stock_count: int,
    low_stock_items: list[dict[str, Any]],
    transaction_summary: dict[str, Any],
) -> str:
    """Build a structured prompt for Bedrock to generate insights."""
    low_stock_list = "\n".join(
        f"- {p.get('name', 'Unknown')} (ID: {p.get('id', '')}): quantity={p.get('quantity', 0)}, threshold={p.get('reorder_threshold', 10)}"
        for p in low_stock_items[:20]
    )

    return f"""You are a business analyst for a small business CRM. Based on the following data, generate a JSON object with the specified fields.

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

## Your Task
Generate a JSON object with exactly these keys (no extra keys):

1. "summary" (string): A natural language business summary in 2-3 sentences about the current state (inventory, sales, trends).

2. "forecasts" (array of objects): Top 5 products likely to need restocking soon. Each object: {{"product_name": str, "product_id": str or null, "estimated_restock_date": str (YYYY-MM-DD or "ASAP"), "reason": str}}

3. "reorder_suggestions" (array of objects): Products below threshold with suggested order quantities. Each: {{"product_name": str, "product_id": str or null, "current_quantity": int, "reorder_threshold": int, "suggested_order_quantity": int, "reason": str}}

4. "spending_trends" (array of strings): 2-4 brief bullet points about spending/cost trends and recommendations.

5. "revenue_insights" (array of strings): 2-4 brief bullet points about revenue (best days, trends, growth opportunities).

Return ONLY valid JSON. No markdown, no explanation outside the JSON."""


def _extract_json_from_response(response_text: str) -> dict[str, Any]:
    """Parse JSON from the AI response, handling markdown code blocks if present."""
    text = response_text.strip()

    # Try to extract from ```json ... ``` block
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()

    return json.loads(text)


def _invoke_bedrock(prompt: str) -> dict[str, Any]:
    """Call Bedrock and return parsed JSON from the response."""
    bedrock = boto3.client("bedrock-runtime")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")

    response = bedrock.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
        }),
    )

    response_body = json.loads(response["body"].read().decode())
    content_blocks = response_body.get("content", [])
    text = ""
    for block in content_blocks:
        if block.get("type") == "text":
            text += block.get("text", "")
            break

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
        return server_error(str(e))

    if not item:
        return not_found(
            "No insights for this date. Use POST /insights/generate to create them."
        )

    body = _to_json_serializable(item)
    return success(body)


def generate_insights(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /insights/generate - gather data, call Bedrock, store and return insight."""
    date_str = today_str()
    pk = build_pk(tenant_id)
    sk = build_sk("INSIGHT", date_str)

    try:
        # Step 1: Gather business data
        products, low_stock_count, total_inventory_value = _gather_products(tenant_id)
        transaction_items = _gather_transactions(tenant_id)
        transaction_summary = _build_transaction_summary(transaction_items)

        low_stock_items = [
            Product.from_dynamo(p).model_dump()
            for p in products
            if p.get("quantity", 0) <= p.get("reorder_threshold", 10)
        ]

        # Step 2 & 3: Build prompt and call Bedrock
        prompt = _build_bedrock_prompt(
            product_count=len(products),
            total_inventory_value=total_inventory_value,
            low_stock_count=low_stock_count,
            low_stock_items=low_stock_items,
            transaction_summary=transaction_summary,
        )

        try:
            ai_result = _invoke_bedrock(prompt)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            return error(
                f"AI service unavailable ({error_code}). Please try again later.",
                503,
            )
        except json.JSONDecodeError as e:
            return server_error(f"Failed to parse AI response: {e}")
        except Exception as e:
            return server_error(f"AI generation failed: {str(e)}")

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
            "generated_at": generated_at,
        }

        ttl_days = 7
        ttl_seconds = int(datetime.now().timestamp()) + (ttl_days * 24 * 60 * 60)
        insight_record["ttl"] = ttl_seconds

        put_item(insight_record)

        # Step 6: Return the insight (convert Decimals for JSON)
        body = _to_json_serializable(insight_record)
        return created(body)

    except Exception as e:
        return server_error(str(e))


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
