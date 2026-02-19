# CRM AI -- API Reference

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com`

All endpoints require a JWT `Authorization: Bearer <token>` header unless noted otherwise. The JWT is obtained from Cognito after sign-in and contains `custom:tenant_id` and `custom:role` claims.

---

## Onboarding

### Create Tenant

**No authentication required.**

```
POST /onboarding/tenant
```

Creates a new tenant with a Cognito user account.

**Request Body:**

| Field            | Type   | Required | Description                                      |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `business_name`  | string | yes      | Name of the business                             |
| `business_type`  | string | yes      | One of: `restaurant`, `retail`, `bar`, `other`   |
| `owner_email`    | string | yes      | Email for the owner account                      |
| `owner_password` | string | yes      | Password (min 8 chars, uppercase + lowercase + number) |

**Response:** `201 Created`

```json
{
  "tenant_id": "01HXYZ...",
  "message": "Tenant created successfully. Please log in to complete setup."
}
```

**Errors:** `400` validation error, `409` email already exists

**Example:**

```bash
curl -X POST "$API_URL/onboarding/tenant" \
  -H "Content-Type: application/json" \
  -d '{"business_name":"Joe Pizza","business_type":"restaurant","owner_email":"joe@pizza.com","owner_password":"Secret123"}'
```

---

### Complete Setup

```
POST /onboarding/setup
```

Finalizes tenant setup after first login. Updates settings and seeds sample products based on business type.

**Request Body (all optional):**

| Field            | Type   | Description                        |
| ---------------- | ------ | ---------------------------------- |
| `currency`       | string | e.g. `"USD"`, `"EUR"`             |
| `timezone`       | string | e.g. `"America/New_York"`         |
| `business_hours` | object | e.g. `{"open": "09:00", "close": "22:00"}` |
| `settings`       | object | Arbitrary settings key-value pairs |

**Response:** `200 OK`

```json
{
  "message": "Setup complete. Your workspace is ready."
}
```

---

## Inventory

### List Products

```
GET /inventory
```

**Query Parameters:**

| Param       | Type   | Default | Description                              |
| ----------- | ------ | ------- | ---------------------------------------- |
| `category`  | string | --      | Filter by category                       |
| `limit`     | int    | 50      | Max items per page (max 100)             |
| `next_token`| string | --      | Pagination token from previous response  |

**Response:** `200 OK`

```json
{
  "products": [
    {
      "id": "01HXYZ...",
      "name": "Chicken Breast",
      "category": "Food",
      "quantity": 45,
      "unit_cost": 4.50,
      "reorder_threshold": 10,
      "unit": "each",
      "created_at": "2025-01-15T10:00:00+00:00",
      "updated_at": "2025-01-15T10:00:00+00:00"
    }
  ],
  "next_token": "eyJw..."
}
```

**Example:**

```bash
curl "$API_URL/inventory?category=Food&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Create Product

```
POST /inventory
```

**Request Body:**

| Field               | Type    | Required | Default  | Description                  |
| ------------------- | ------- | -------- | -------- | ---------------------------- |
| `name`              | string  | yes      | --       | Product name                 |
| `category`          | string  | no       | --       | Category for filtering       |
| `quantity`           | int     | yes      | --       | Current stock (>= 0)        |
| `unit_cost`         | decimal | no       | --       | Cost per unit                |
| `reorder_threshold` | int     | no       | 10       | Low-stock alert threshold    |
| `supplier_id`       | string  | no       | --       | Link to a supplier           |
| `sku`               | string  | no       | --       | Stock keeping unit code      |
| `unit`              | string  | no       | `"each"` | Unit of measure              |
| `notes`             | string  | no       | --       | Free-text notes              |

**Response:** `201 Created` -- returns the created product object.

**Example:**

```bash
curl -X POST "$API_URL/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Chicken Breast","category":"Food","quantity":100,"unit_cost":4.50}'
```

---

### Get Product

```
GET /inventory/{id}
```

**Response:** `200 OK` -- product object. `404` if not found.

---

### Update Product

```
PUT /inventory/{id}
```

**Request Body:** Any subset of the create fields. Only provided fields are updated.

**Response:** `200 OK` -- updated product object. `404` if not found.

---

### Delete Product

```
DELETE /inventory/{id}
```

**Response:** `204 No Content`. `404` if not found.

---

## Transactions

### List Transactions

```
GET /transactions
```

Returns transactions in reverse chronological order (newest first).

**Query Parameters:**

| Param        | Type   | Default | Description                            |
| ------------ | ------ | ------- | -------------------------------------- |
| `start_date` | string | --      | Filter from date (YYYY-MM-DD)          |
| `end_date`   | string | --      | Filter to date (YYYY-MM-DD)            |
| `limit`      | int    | 50      | Max items per page (max 100)           |
| `next_token` | string | --      | Pagination token                       |

**Response:** `200 OK`

```json
{
  "transactions": [
    {
      "id": "01HXYZ...",
      "items": [
        {
          "product_id": "01HABC...",
          "product_name": "Chicken Breast",
          "quantity": 2,
          "unit_price": 4.50
        }
      ],
      "total": 9.00,
      "payment_method": "card",
      "notes": null,
      "created_at": "2025-01-15T14:30:00+00:00"
    }
  ],
  "next_token": "eyJw..."
}
```

---

### Record Sale

```
POST /transactions
```

Records a sale and **atomically deducts** inventory quantities for each item. If any product has insufficient stock, the entire transaction is rejected.

**Request Body:**

| Field            | Type   | Required | Description                           |
| ---------------- | ------ | -------- | ------------------------------------- |
| `items`          | array  | yes      | Line items (see below)                |
| `total`          | decimal| yes      | Total sale amount                     |
| `payment_method` | string | yes      | `"cash"`, `"card"`, or `"other"`      |
| `notes`          | string | no       | Optional notes                        |

**Line Item:**

| Field          | Type    | Required | Description          |
| -------------- | ------- | -------- | -------------------- |
| `product_id`   | string  | yes      | Product ID           |
| `product_name` | string  | yes      | Product name         |
| `quantity`      | int     | yes      | Quantity sold (> 0)  |
| `unit_price`   | decimal | yes      | Price per unit       |

**Response:** `201 Created` -- the transaction object.

**Errors:** `400` if insufficient stock.

**Example:**

```bash
curl -X POST "$API_URL/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"product_id":"01HABC","product_name":"Chicken Breast","quantity":2,"unit_price":4.50}],
    "total": 9.00,
    "payment_method": "card"
  }'
```

---

### Get Transaction

```
GET /transactions/{id}
```

**Response:** `200 OK` -- transaction object. `404` if not found.

---

### Daily Summary

```
GET /transactions/summary
```

**Query Parameters:**

| Param  | Type   | Default | Description            |
| ------ | ------ | ------- | ---------------------- |
| `date` | string | today   | Date (YYYY-MM-DD)     |

**Response:** `200 OK`

```json
{
  "date": "2025-01-15",
  "total_revenue": 1234.56,
  "transaction_count": 42,
  "items_sold": 156,
  "revenue_by_payment_method": {
    "cash": 500.00,
    "card": 734.56
  }
}
```

---

## Purchases

### List Purchase Orders

```
GET /purchases
```

**Query Parameters:**

| Param       | Type   | Default | Description           |
| ----------- | ------ | ------- | --------------------- |
| `status`    | string | --      | Filter by status      |
| `limit`     | int    | 50      | Max items per page    |
| `next_token`| string | --      | Pagination token      |

**Response:** `200 OK`

```json
{
  "purchase_orders": [...],
  "next_token": "eyJw..."
}
```

---

### Create Purchase Order

```
POST /purchases
```

**Request Body:**

| Field         | Type    | Required | Description                                    |
| ------------- | ------- | -------- | ---------------------------------------------- |
| `supplier_id` | string  | no       | Supplier reference                             |
| `supplier_name`| string | yes      | Supplier name                                  |
| `items`       | array   | yes      | Items to order (product_id, product_name, quantity, unit_cost) |
| `notes`       | string  | no       | Optional notes                                 |

**Response:** `201 Created` -- purchase order with `status: "draft"`.

---

### Get Purchase Order

```
GET /purchases/{id}
```

**Response:** `200 OK` -- purchase order object. `404` if not found.

---

### Update Purchase Order

```
PUT /purchases/{id}
```

Update status or details. When status changes to `"received"`, product quantities are automatically increased.

**Request Body:**

| Field    | Type   | Description                                          |
| -------- | ------ | ---------------------------------------------------- |
| `status` | string | `"draft"`, `"sent"`, `"received"`, or `"cancelled"`  |
| `notes`  | string | Updated notes                                        |

**Response:** `200 OK` -- updated purchase order.

---

## AI Insights

### Get Insights

```
GET /insights
```

Returns the cached AI insight for a given date.

**Query Parameters:**

| Param  | Type   | Default | Description          |
| ------ | ------ | ------- | -------------------- |
| `date` | string | today   | Date (YYYY-MM-DD)   |

**Response:** `200 OK`

```json
{
  "tenant_id": "01HXYZ...",
  "date": "2025-01-15",
  "summary": "Your business is performing well with steady sales...",
  "forecasts": [
    {
      "product_name": "Chicken Breast",
      "estimated_restock_date": "2025-01-20",
      "reason": "Based on current consumption rate..."
    }
  ],
  "reorder_suggestions": [
    {
      "product_name": "Rice",
      "current_quantity": 5,
      "reorder_threshold": 10,
      "suggested_order_quantity": 50,
      "reason": "Below threshold..."
    }
  ],
  "spending_trends": ["Food costs stable at $X/week..."],
  "revenue_insights": ["Saturdays generate 3x weekday revenue..."],
  "generated_at": "2025-01-15T06:00:00+00:00"
}
```

**Errors:** `404` if no insights exist for the date.

---

### Generate Insights

```
POST /insights/generate
```

Gathers inventory and transaction data (last 30 days), sends to Amazon Bedrock (Claude Haiku), and caches the result.

**Request Body:** None required.

**Response:** `201 Created` -- the generated insight object (same shape as GET).

**Errors:** `503` if Bedrock is unavailable.

**Example:**

```bash
curl -X POST "$API_URL/insights/generate" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Common Error Response Format

All errors follow this shape:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning                                    |
| ------ | ------------------------------------------ |
| 400    | Bad request (validation, insufficient stock) |
| 401    | Unauthorized (missing or invalid JWT)       |
| 403    | Forbidden (insufficient role)               |
| 404    | Resource not found                          |
| 409    | Conflict (duplicate email on signup)        |
| 500    | Internal server error                       |
| 503    | Service unavailable (Bedrock down)          |
