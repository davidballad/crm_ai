---
name: Cost Tracking & Profit Visibility
description: Add product cost tracking and profit analytics to help customers understand profitability vs. sales recovery
type: design
---

# Cost Tracking & Profit Visibility Design

**Last updated:** 2026-05-02  
**Status:** Approved  
**Owner:** David  

## Problem Statement

Customers currently use paper notes to track sales and inventory. They have no visibility into:
- How much they paid for products (cost of goods)
- Whether they're making profit or just recovering their investment
- Which products/suppliers are most profitable

This feature adds cost tracking to products and a dedicated Profits & Analytics tab so customers can answer: **"Am I making money or breaking even?"**

---

## Use Case Flow

1. **Admin sets up products with cost prices**
   - Product: "Espresso" → Supplier A, $4.50/unit, sells for $12.00
   - Product: "Croissant" → Supplier B, $1.80/unit, sells for $5.50

2. **Customer makes a sale**
   - Sells 2x Espresso ($12 each) + 1x Croissant ($5.50)
   - Total sale: $29.50

3. **System captures cost snapshot at transaction time**
   - Espresso cost: 2 × $4.50 = $9.00
   - Croissant cost: 1 × $1.80 = $1.80
   - Total cost: $10.80
   - **Profit: $18.70 (63.3% margin)**

4. **Customer views profit analytics**
   - See total sales, total cost, profit, margin % by time period
   - Break down by product or supplier
   - Understand profitability trends

---

## Data Model

### Product (existing, no breaking changes)

Already has these fields; no changes needed:
```
- name: str
- supplier_id: str (optional) → links to Supplier
- unit_cost: Decimal (optional) → what you paid for one unit
- unit_price: Decimal (implied, captured in Transaction items)
```

### Transaction (ADD two fields)

```
- cost_total: Decimal
  - Sum of (item.quantity × item.unit_cost) for all items
  - Calculated at transaction creation time
  
- items: list[TransactionItem]
  - Each item now includes unit_cost snapshot
```

### TransactionItem (existing, ADD unit_cost snapshot)

```
- product_id: str
- product_name: str
- quantity: int
- unit_price: Decimal (sale price per unit)
- unit_cost: Decimal (NEW) → cost price per unit at time of sale
```

### Calculated Fields (runtime only, not stored)

```
- profit: Decimal = transaction.total - transaction.cost_total
- margin_percent: float = (profit / transaction.total) × 100
```

**Why snapshot unit_cost in each item?** If you update a product's cost later, past transactions still reflect what you actually paid that day.

---

## API Changes

### Product CRUD (`backend/functions/inventory/handler.py`)

**No changes needed.** `supplier_id` and `unit_cost` already exist.

### Transaction Creation (`backend/functions/transactions/handler.py`)

**POST /transactions** — When creating a transaction:

1. For each item in the request, fetch the current `Product.unit_cost`
2. Store `unit_cost` snapshot in `TransactionItem`
3. Calculate `cost_total = sum(item.quantity × item.unit_cost)`
4. Store `cost_total` in Transaction

```python
def create_transaction(tenant_id, items, total, ...):
    cost_total = Decimal(0)
    tx_items = []
    
    for item in items:
        product = get_product(tenant_id, item.product_id)
        unit_cost = product.unit_cost or Decimal(0)
        cost_total += item.quantity * unit_cost
        
        tx_items.append({
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "unit_cost": unit_cost,  # NEW: snapshot
        })
    
    transaction = {
        "items": tx_items,
        "total": total,
        "cost_total": cost_total,  # NEW
        ...
    }
    save_transaction(transaction)
```

### Transaction Retrieval (`backend/functions/transactions/handler.py`)

**GET /transactions/{id}** or **GET /transactions?limit=50**

Return calculated fields in response:

```python
def _transaction_response(item):
    cost_total = item.get("cost_total") or Decimal(0)
    total = item.get("total") or Decimal(0)
    
    profit = total - cost_total
    margin_percent = (profit / total * 100) if total > 0 else 0
    
    return {
        ...item,
        "cost_total": float(cost_total),
        "profit": float(profit),
        "margin_percent": float(margin_percent),
    }
```

### Profit Analytics Endpoints (NEW)

These are **read-only** and support filtering by time period.

#### `GET /profits/summary?period=this-month`

Returns:
```json
{
  "period": "this-month",
  "total_sales": 2450.00,
  "total_cost": 1380.00,
  "total_profit": 1070.00,
  "margin_percent": 43.7,
  "transaction_count": 24,
  "avg_profit_per_transaction": 44.58
}
```

#### `GET /profits/by-product?period=this-month`

Returns array of:
```json
{
  "product_id": "prod-123",
  "product_name": "Espresso Double Shot",
  "supplier_id": "supp-a",
  "supplier_name": "Supplier A",
  "units_sold": 24,
  "total_sales": 288.00,
  "total_cost": 108.00,
  "total_profit": 180.00,
  "margin_percent": 62.5
}
```

#### `GET /profits/by-supplier?period=this-month`

Returns array of:
```json
{
  "supplier_id": "supp-a",
  "supplier_name": "Supplier A",
  "product_count": 2,
  "total_cost": 141.00,
  "total_sales": 385.50,
  "total_profit": 244.50,
  "margin_percent": 63.4
}
```

#### `GET /profits/breakdown?period=this-month`

Returns margin tiers (for "Profit Breakdown" section):
```json
{
  "premium": {
    "label": "Premium Margin (40%+)",
    "transaction_count": 7,
    "total_profit": 420.00,
    "percent_of_total": 39.3
  },
  "good": {
    "label": "Good Margin (20-40%)",
    "transaction_count": 12,
    "total_profit": 520.00,
    "percent_of_total": 48.6
  },
  "low": {
    "label": "Low Margin (<20%)",
    "transaction_count": 5,
    "total_profit": 130.00,
    "percent_of_total": 12.1
  }
}
```

**Period parameter:** `this-month`, `last-month`, `this-year`, `all-time`

---

## Frontend Changes

### New Page: `frontend/src/pages/Profits.jsx`

A dedicated **Profits & Analytics** page with three tabs:

#### Tab 1: Overview
- **Key Metrics Grid**
  - Total Sales
  - Total Cost
  - Total Profit
  - Transaction count + avg profit/transaction
  
- **Profit Trend Chart** (line chart over time)
  
- **Profit Breakdown** (margin tier breakdown)

#### Tab 2: By Product
- **Table** with columns:
  - Product name + supplier
  - Units sold
  - Total sales
  - Total cost
  - Profit + margin %

#### Tab 3: By Supplier
- **Table** with columns:
  - Supplier name
  - Product count
  - Total cost
  - Total sales
  - Average margin %

**Period filter:** This Month, Last Month, This Year, All Time

### Updated Components

**Transactions page** — No changes (keep cost/profit data out of transaction list)

**Product edit form** — No changes (supplier_id and unit_cost already exist)

---

## Implementation Priority

### Phase 1 (MVP — Required)
- Add `cost_total` field to Transaction
- Snapshot `unit_cost` in each TransactionItem
- Implement transaction creation with cost calculation
- Add `/profits/summary` endpoint
- Build Profits page with Overview tab

### Phase 2 (Enhancement)
- Add `/profits/by-product` endpoint
- Add `/profits/by-supplier` endpoint
- Build By Product and By Supplier tabs
- Add profit trend chart

### Phase 3 (Polish)
- Add `/profits/breakdown` endpoint
- Build Profit Breakdown section
- Add advanced filtering and date ranges

---

## Database Queries

All queries are **read-only** and use DynamoDB's query/scan operations:

- **Summary:** Query all transactions by creation date, sum sales/cost
- **By Product:** Scan all transactions, group by product_id, sum metrics
- **By Supplier:** Scan transactions, join with products, group by supplier_id
- **Breakdown:** Scan transactions, bucket by margin %, count & sum

**Optimization notes:**
- Consider adding GSI for fast date-range queries if transaction volume grows
- Cache summary results for performance (invalidate on new transaction)
- Lazy-load detailed breakdowns (load on-demand from tab click)

---

## Testing Strategy

### Unit Tests
- Transaction creation calculates cost_total correctly
- Margin % calculation handles edge cases (zero sale total, negative margins)
- API responses include all required fields

### Integration Tests
- Create transaction with multiple items, verify cost snapshot per item
- Retrieve transaction, verify calculated profit/margin are correct
- Fetch profit summary, verify aggregation matches raw transactions

### Manual Testing
- Admin sets product with cost price
- Customer creates sale
- Verify Profits tab shows correct summary and breakdown
- Verify product/supplier tables match transaction data

---

## Success Criteria

✅ Customers can see total profit by time period  
✅ Customers can see which products are most profitable  
✅ Customers can see supplier performance  
✅ Cost snapshots prevent historical data corruption  
✅ Margins calculated correctly in all views  

---

## Open Questions / Future Work

- Should we add export (CSV) of profit reports?
- Should we alert customers if a product's margin drops below a threshold?
- Should we track cost changes over time (price history per product)?
