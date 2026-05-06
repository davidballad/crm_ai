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
    results: list[dict[str, Any]] = []
    last_key: dict[str, Any] | None = None
    while True:
        items, last_key = query_items(pk=pk, sk_prefix=TRANSACTION_SK_PREFIX, limit=100, last_key=last_key)
        for item in items:
            created_at = item.get("created_at") or ""
            if start_iso <= created_at < end_iso:
                results.append(item)
        if not last_key:
            break
    return results


def get_summary(tenant_id: str, period: str) -> dict[str, Any]:
    from shared.db import get_item
    from shared.utils import build_sk

    start_iso, end_iso = _get_period_date_range(period)
    pk = build_pk(tenant_id)
    transactions = _get_transactions_for_period(pk, start_iso, end_iso)

    total_sales = Decimal(0)
    total_cost = Decimal(0)

    # product_id -> aggregated stats
    product_stats: dict[str, dict[str, Any]] = {}
    # supplier_id -> aggregated stats
    supplier_stats: dict[str, dict[str, Any]] = {}

    # Cache product and supplier lookups within this request
    product_cache: dict[str, dict[str, Any] | None] = {}
    supplier_cache: dict[str, dict[str, Any] | None] = {}

    for txn in transactions:
        txn_total = Decimal(str(txn.get("total") or 0))
        txn_cost = Decimal(str(txn.get("cost_total") or 0))
        total_sales += txn_total
        total_cost += txn_cost

        for item in txn.get("items", []):
            product_id = item.get("product_id")
            if not product_id:
                continue

            item_qty = int(item.get("quantity") or 0)
            item_unit_price = Decimal(str(item.get("unit_price") or item.get("price") or 0))
            item_unit_cost = Decimal(str(item.get("unit_cost") or 0))
            item_sales = item_qty * item_unit_price
            item_cost = item_qty * item_unit_cost
            item_profit = item_sales - item_cost

            # Resolve product name and supplier (cached)
            product_name = item.get("product_name") or product_id
            supplier_id: str | None = None
            supplier_name: str | None = None

            if product_id not in product_cache:
                try:
                    product_cache[product_id] = get_item(pk=pk, sk=build_sk("PRODUCT", product_id))
                except Exception:
                    product_cache[product_id] = None

            product = product_cache[product_id]
            if product:
                product_name = product.get("name") or product_name
                supplier_id = product.get("supplier_id")
                if supplier_id:
                    if supplier_id not in supplier_cache:
                        try:
                            supplier_cache[supplier_id] = get_item(pk=pk, sk=build_sk("SUPPLIER", supplier_id))
                        except Exception:
                            supplier_cache[supplier_id] = None
                    sup = supplier_cache[supplier_id]
                    if sup:
                        supplier_name = sup.get("name")

            # Aggregate by product
            if product_id not in product_stats:
                product_stats[product_id] = {
                    "product_id": product_id,
                    "product_name": product_name,
                    "supplier_name": supplier_name,
                    "units_sold": 0,
                    "total_sales": Decimal(0),
                    "total_cost": Decimal(0),
                }
            ps = product_stats[product_id]
            ps["units_sold"] += item_qty
            ps["total_sales"] += item_sales
            ps["total_cost"] += item_cost

            # Aggregate by supplier
            supplier_key = supplier_id or "unknown"
            if supplier_key not in supplier_stats:
                supplier_stats[supplier_key] = {
                    "supplier_id": supplier_id,
                    "supplier_name": supplier_name,
                    "total_sales": Decimal(0),
                    "total_cost": Decimal(0),
                    "units_sold": 0,
                }
            ss = supplier_stats[supplier_key]
            ss["total_sales"] += item_sales
            ss["total_cost"] += item_cost
            ss["units_sold"] += item_qty

    total_profit = total_sales - total_cost
    transaction_count = len(transactions)
    margin_percent = float(total_profit / total_sales * 100) if total_sales > 0 else 0.0
    avg_profit = float(total_profit / transaction_count) if transaction_count > 0 else 0.0

    def _product_row(ps: dict[str, Any]) -> dict[str, Any]:
        sales = float(ps["total_sales"])
        cost = float(ps["total_cost"])
        profit = sales - cost
        margin = (profit / sales * 100) if sales > 0 else 0.0
        return {
            "product_id": ps["product_id"],
            "product_name": ps["product_name"],
            "supplier_name": ps["supplier_name"],
            "units_sold": ps["units_sold"],
            "total_sales": round(sales, 2),
            "total_cost": round(cost, 2),
            "total_profit": round(profit, 2),
            "margin_percent": round(margin, 1),
        }

    def _supplier_row(ss: dict[str, Any]) -> dict[str, Any]:
        sales = float(ss["total_sales"])
        cost = float(ss["total_cost"])
        profit = sales - cost
        margin = (profit / sales * 100) if sales > 0 else 0.0
        return {
            "supplier_id": ss["supplier_id"],
            "supplier_name": ss["supplier_name"] or "Sin proveedor",
            "units_sold": ss["units_sold"],
            "total_sales": round(sales, 2),
            "total_cost": round(cost, 2),
            "total_profit": round(profit, 2),
            "margin_percent": round(margin, 1),
        }

    by_product = sorted(
        [_product_row(ps) for ps in product_stats.values()],
        key=lambda r: r["total_profit"],
        reverse=True,
    )
    by_supplier = sorted(
        [_supplier_row(ss) for ss in supplier_stats.values()],
        key=lambda r: r["total_profit"],
        reverse=True,
    )

    return success({
        "period": period,
        "total_sales": round(float(total_sales), 2),
        "total_cost": round(float(total_cost), 2),
        "total_profit": round(float(total_profit), 2),
        "margin_percent": round(margin_percent, 2),
        "transaction_count": transaction_count,
        "avg_profit_per_transaction": round(avg_profit, 2),
        "by_product": by_product,
        "by_supplier": by_supplier,
        # kept for backwards compat with ProfitsOverview supplier cost card
        "suppliers": [
            {"supplier_id": r["supplier_id"], "supplier_name": r["supplier_name"],
             "total_cost": r["total_cost"], "item_count": r["units_sold"]}
            for r in by_supplier
        ],
    })


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
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
