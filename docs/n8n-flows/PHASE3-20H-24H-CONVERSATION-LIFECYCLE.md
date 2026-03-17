# Phase 3: 20h / 24h conversation lifecycle (n8n scheduled workflow)

This doc describes how to implement **follow-up after 20h** and **auto-close after 24h** using a **scheduled n8n workflow** (no EventBridge/Lambda).

---

## Backend (already done)

- **POST /messages/mark-conversation**  
  Body: `{ "from_number": "<customer_phone>", "category": "incomplete" | "closed" }`  
  Auth: `X-Service-Key` + `X-Tenant-Id`.  
  Sets the **latest message** of that conversation to the given category.

- **POST /messages/send**  
  Already supports service-key auth. n8n can call it with `X-Service-Key`, `X-Tenant-Id`, and body `{ "to_number", "text" }` to send a reminder (optional).

---

## Multi-tenant: no manual tenant list

The Phase 3 flow **fetches all tenants from your API** each run, so you never add tenants manually in n8n.

1. **GET /onboarding/tenant-ids** (service key only) returns `{ "tenant_ids": ["id1", "id2", ...], "count": N }` for every tenant in your database.
2. The workflow calls this once per run, then **loops over each tenant** (GET messages → find 20h/24h → mark-conversation). When you onboard a 6th business, it appears in the API response and is included automatically.

You only set **two** values in n8n (once):

| Variable | Source | Where to set |
|----------|--------|----------------|
| `CLIENTA_API_URL` | Your API Gateway URL (Terraform output) | n8n env / deployment |
| `CLIENTA_SERVICE_API_KEY` | Same service key the webhook uses | n8n env / deployment |

No `CLIENTA_TENANT_ID` — the list of tenants comes from **GET /onboarding/tenant-ids**.

**Where the list lives:** Tenant IDs are stored in S3 (`tenant-registry/tenant-ids.json` in the data bucket). When a new tenant is created (POST /onboarding/tenant), the onboarding Lambda appends that tenant’s ID to the file. GET /onboarding/tenant-ids reads from S3 (one GetObject per call, no DynamoDB scan). No separate Lambda or n8n update is needed.

**Existing tenants (bootstrap):** If you had tenants before this was added, the S3 file may be empty. Either onboard a test tenant (which writes the file and adds that ID) or run a one-time script/API that builds the list from DynamoDB once and writes it to S3.

---

## n8n: one workflow per tenant (recommended)

Because **GET /messages** is tenant-scoped (via `X-Tenant-Id`), the simplest approach is **one scheduled workflow per tenant**, or a single workflow that **loops over a fixed list of tenant IDs** (e.g. from an n8n static list or a stored config).

### Option A: Single workflow with a “tenant list” and loop

1. **Schedule trigger**  
   - Cron: every hour (e.g. `0 * * * *`).

2. **Set / read tenant list**  
   - e.g. **Set** node or **Code** node that outputs one item per tenant:  
     `[{ "tenant_id": "xxx", "api_url": "https://...", "service_api_key": "..." }]`.  
   - You can store this in n8n static data or fetch from a small config endpoint if you add one.

3. **Loop over tenants**  
   - **Split Out** or **Loop Over Items** so each item is one tenant.

4. **GET /messages** for this tenant  
   - URL: `{{ $json.api_url }}/messages?limit=100`  
   - Headers: `X-Service-Key`, `X-Tenant-Id` (from current item).  
   - Optional: paginate (follow `next_token`) until you have all recent messages.

5. **Code node: find conversations to update**  
   - Input: `$input.first().json` (messages array from GET /messages response; adjust if your HTTP node returns a different shape).  
   - Logic:
     - Group messages by **customer phone**: for each message, the “customer” is `from_number` on inbound and `to_number` on outbound (inbound = customer sent; outbound = business sent). Normalize phones (strip spaces, leading `+`).
     - For each customer, find the **latest message** in the thread (max `created_ts`).
     - Get current **category** from that latest message.
     - Compute **hours since last message** from `created_ts` to now.
     - Output two lists:
       - **To 20h**: conversations where `category === "active"` and age ≥ 20 hours → output `{ tenant_id, api_url, service_api_key, from_number: customer_phone, action: "incomplete" }`.
       - **To 24h**: conversations where (`category === "active"` or `category === "incomplete"`) and age ≥ 24 hours → output `{ tenant_id, api_url, service_api_key, from_number: customer_phone, action: "closed" }`.
   - Emit one item per conversation to update (so n8n can loop and call the API for each).

6. **Optional: send follow-up for 20h**  
   - Filter items where `action === "incomplete"`.
   - **HTTP Request**: **POST** `{{ $json.api_url }}/messages/send`  
     Body: `{ "to_number": "{{ $json.from_number }}", "text": "Your reminder text here..." }`  
     Headers: `X-Service-Key`, `X-Tenant-Id`.  
   - **WhatsApp policy:** After 24h you may only send template messages. Within 24h you can send a free-form text. So the 20h reminder can be free-form; if you ever add a “no reply by 24h” message, use a Meta-approved template.

7. **POST /messages/mark-conversation** for each item  
   - For each output from the Code node (both 20h and 24h):  
     **POST** `{{ $json.api_url }}/messages/mark-conversation`  
     Body:  
     `{ "from_number": "{{ $json.from_number }}", "category": "{{ $json.action === 'closed' ? 'closed' : 'incomplete' }}" }`  
     Headers: `X-Service-Key`, `X-Tenant-Id`.  
   - So 20h items get `category: "incomplete"`, 24h items get `category: "closed"`.

### Option B: One scheduled workflow per tenant

- Duplicate the same workflow per tenant; in each copy, **Set** or **Code** node defines a single tenant’s `tenant_id`, `api_url`, `service_api_key`.
- Then: **GET /messages** (with that tenant’s headers) → **Code** (same logic as above, no loop over tenants) → optional **POST /messages/send** for 20h → **POST /messages/mark-conversation** for each conversation.

---

## Summary

| What                | How (n8n)                                                                 |
|---------------------|---------------------------------------------------------------------------|
| When to run         | Schedule trigger every hour                                              |
| Which conversations | GET /messages per tenant → Code: group by customer, latest message, age  |
| 20h no reply        | Optional: POST /messages/send (reminder); then POST /messages/mark-conversation with `category: "incomplete"` |
| 24h no reply        | POST /messages/mark-conversation with `category: "closed"`               |

No new AWS infrastructure; everything is n8n + existing API.
