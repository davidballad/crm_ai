"""Profit analytics Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.auth import require_auth
from shared.db import query_items
from shared.response import error, not_found, server_error, success
from shared.utils import build_pk

TRANSACTION_SK_PREFIX = "TXN#"
VALID_PERIODS = {"this-month", "last-month", "this-year", "all-time"}


def _get_period_date_range(period: str) -> tuple[str, str]:
    """Return (start_iso, end_iso) strings for the given period."""
    now = datetime.now(tz=timezone.utc)

    if period == "this-month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)

    elif period == "last-month":
        if now.month == 1:
            start = now.replace(year=now.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(month=now.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    elif period == "this-year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    else:  # all-time
        return ("1970-01-01", "2099-12-31")

    return (start.isoformat(), end.isoformat())


def _get_transactions_for_period(pk: str, start_iso: str, end_iso: str) -> list[dict[str, Any]]:
    """Fetch all transactions within a date range."""
    results: list[dict[str, Any]] = []
    last_key: dict[str, Any] | None = None

    while True:
        items, last_key = query_items(
            pk=pk,
            sk_prefix=TRANSACTION_SK_PREFIX,
            limit=100,
            last_key=last_key,
        )

        for item in items:
            created_at = item.get("created_at") or ""
            if start_iso <= created_at < end_iso:
                results.append(item)

        if not last_key:
            break

    return results


def get_summary(tenant_id: str, period: str) -> dict[str, Any]:
    """Aggregate total sales, cost, profit, and margin for the given period, with supplier details per product."""
    from shared.db import get_item
    from shared.utils import build_sk

    start_iso, end_iso = _get_period_date_range(period)
    pk = build_pk(tenant_id)

    transactions = _get_transactions_for_period(pk, start_iso, end_iso)

    total_sales = Decimal(0)
    total_cost = Decimal(0)
    supplier_stats: dict[str, dict[str, Any]] = {}

    for txn in transactions:
        txn_total = Decimal(str(txn.get("total") or 0))
        txn_cost = Decimal(str(txn.get("cost_total") or 0))
        total_sales += txn_total
        total_cost += txn_cost

        items = txn.get("items", [])
        for item in items:
            product_id = item.get("product_id")
            if not product_id:
                continue

            item_qty = item.get("quantity", 0)
            item_unit_cost = Decimal(str(item.get("unit_cost") or 0))
            item_cost = item_qty * item_unit_cost

            try:
                product_sk = build_sk("PRODUCT", product_id)
                product = get_item(pk=pk, sk=product_sk)
                supplier_id = None
                if product:
                    supplier_id = product.get("supplier_id")
            except Exception:
                supplier_id = None

            supplier_key = supplier_id or "unknown"
            if supplier_key not in supplier_stats:
                supplier_stats[supplier_key] = {
                    "supplier_id": supplier_id,
                    "total_cost": Decimal(0),
                    "item_count": 0,
                }
            supplier_stats[supplier_key]["total_cost"] += item_cost
            supplier_stats[supplier_key]["item_count"] += 1

    total_profit = total_sales - total_cost
    transaction_count = len(transactions)
    margin_percent = float(total_profit / total_sales * 100) if total_sales > 0 else 0.0
    avg_profit = float(total_profit / transaction_count) if transaction_count > 0 else 0.0

    suppliers_list = [
        {
            "supplier_id": stats["supplier_id"],
            "total_cost": float(stats["total_cost"]),
            "item_count": stats["item_count"],
        }
        for stats in supplier_stats.values()
    ]

    return success({
        "period": period,
        "total_sales": float(total_sales),
        "total_cost": float(total_cost),
        "total_profit": float(total_profit),
        "margin_percent": round(margin_percent, 2),
        "transaction_count": transaction_count,
        "avg_profit_per_transaction": round(avg_profit, 2),
        "suppliers": suppliers_list,
    })


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route /profits/* requests."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        tenant_id: str = event.get("tenant_id", "")
        query_params = event.get("queryStringParameters") or {}

        if method == "GET" and path.endswith("/profits/summary"):
            period = query_params.get("period", "this-month")
            if period not in VALID_PERIODS:
                return error(f"Invalid period. Must be one of: {', '.join(sorted(VALID_PERIODS))}")
            return get_summary(tenant_id, period)

        return not_found("Profit endpoint not found")

    except Exception as exc:
        return server_error(str(exc))
