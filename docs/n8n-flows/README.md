# n8n Workflow Templates for Clienta AI

This folder contains n8n workflow templates for the WhatsApp AI agent integration.

## Architecture

```
Meta WhatsApp Cloud API
        │
        ▼
  n8n Webhook (single URL, all tenants)
        │
        ▼
  Resolve tenant (GET /onboarding/resolve-phone?phone_number_id=X)
        │
        ▼
  Load tenant config (response includes ai_system_prompt, capabilities, etc.)
        │
        ▼
  n8n AI Agent Node (Bedrock via credentials)
        │
        ├── Tool: search_products → GET /inventory
        ├── Tool: create_order → POST /transactions
        ├── Tool: find_contact → GET /contacts?phone=X
        ├── Tool: create_contact → POST /contacts
        ├── Tool: save_message → POST /messages
        ├── Tool: update_message → PATCH /messages/{id}/flags
        └── Tool: update_contact → PATCH /contacts/{id}
        │
        ▼
  Send reply via WhatsApp Cloud API
  Store outbound message via POST /messages
```

Meta sends messages directly to n8n — no Lambda webhook in between. n8n resolves the tenant from the Meta `phone_number_id`, loads the tenant's AI config, and runs a single AI Agent workflow for all tenants.

## Prerequisites

- n8n instance (self-hosted Docker or n8n Cloud)
- Clienta AI API base URL (e.g. `https://<api-id>.execute-api.<region>.amazonaws.com`)
- Service API key for n8n → Clienta API calls (set as `SERVICE_API_KEY` in AWS, stored in n8n credentials)
- Meta WhatsApp Cloud API access token for sending replies
- AWS Bedrock credentials (for n8n AI Agent node)

## Authentication

n8n uses **service key auth** instead of JWT. Every API call includes two headers:

```
X-Service-Key: <your-service-api-key>
X-Tenant-Id: <resolved-tenant-id>
```

The service key is a shared secret set in both:
- AWS Lambda env var `SERVICE_API_KEY` (via Terraform `service_api_key` variable)
- n8n HTTP Request credentials (as a custom header)

## Phone Number → Tenant Resolution

Meta includes `phone_number_id` in every webhook payload (text message example):

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550783881",
              "phone_number_id": "106540352242922"
            },
            "contacts": [
              {
                "profile": { "name": "Sheena Nelson" },
                "wa_id": "16505551234"
              }
            ],
            "messages": [
              {
                "from": "16505551234",
                "id": "wamid.HBgL...",
                "timestamp": "1749416383",
                "type": "text",
                "text": { "body": "Does it come in another color?" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Fields we use:**

| Path | Purpose |
|------|---------|
| `entry[0].changes[0].value.metadata.phone_number_id` | Resolve to `tenant_id` |
| `entry[0].changes[0].value.metadata.display_phone_number` | Human-readable business number |
| `entry[0].changes[0].value.messages[0].from` | Customer's WhatsApp ID (for contact/conversation) |
| `entry[0].changes[0].value.messages[0].id` | Message ID (dedup/storage) |
| `entry[0].changes[0].value.messages[0].type` | `text`, `image`, `audio`, etc. |
| `entry[0].changes[0].value.messages[0].text.body` | Text content (when `type === "text"`) |

n8n may wrap the webhook in an array; the Meta payload is in `body` (e.g. `$json.body.entry[0].changes[0].value`).

### Mapping Flow

During tenant setup (`POST /onboarding/setup`), the business owner provides their `meta_phone_number_id`. This creates a DynamoDB mapping:

- `pk` = `PHONE_NUMBER_ID`, `sk` = `<phone_number_id>`, `tenant_id` = `<tenant_id>`

n8n calls `GET /onboarding/resolve-phone?phone_number_id=102938...` to resolve the tenant and load the full config (business name, AI system prompt, capabilities, etc.).

### Webhook Verification

Meta may send a GET with `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. Respond with status 200 and body = `hub.challenge` to verify.

## Workflows

| File | Purpose |
|------|---------|
| [../workflow.json](../workflow.json) | Main WhatsApp workflow: 3 options (Order \| Products \| Something else), product carousel + Add to cart, cart/checkout, AI for "Something else" |

## Tenant Configuration

Each tenant's AI behavior is controlled by their config (set during onboarding setup):

```json
{
  "business_name": "Maria's Kitchen",
  "business_type": "restaurant",
  "ai_system_prompt": "You are the virtual assistant for Maria's Kitchen...",
  "capabilities": ["ordering", "menu_info", "hours_info", "delivery_tracking"],
  "delivery_enabled": true,
  "payment_methods": ["cash", "transfer"],
  "business_hours": {"open": "09:00", "close": "21:00"},
  "currency": "MXN",
  "timezone": "America/Mexico_City"
}
```

The AI Agent node receives `ai_system_prompt` as its system prompt and the rest as context. One workflow handles all business types — the prompt controls behavior.

## API Endpoints Used

| Purpose | Method | Endpoint | Auth |
|---------|--------|----------|------|
| Resolve tenant from phone | GET | /onboarding/resolve-phone?phone_number_id=X | Service Key |
| Get tenant config | GET | /onboarding/config | Service Key or JWT |
| Find contact by phone | GET | /contacts?phone=X | Service Key |
| Create contact | POST | /contacts | Service Key |
| Update contact | PATCH | /contacts/{id} | Service Key |
| Save message | POST | /messages | Service Key |
| Update message flags | PATCH | /messages/{id}/flags | Service Key |
| List messages | GET | /messages?category=X | Service Key |
| Check inventory | GET | /inventory | Service Key |
| Get product | GET | /inventory/{id} | Service Key |
| Create transaction | POST | /transactions | Service Key |
| Update transaction | PATCH | /transactions/{id} | Service Key |
| Get cart | GET | /cart?customer_id=X | Service Key |
| Add to cart | POST | /cart/items | Service Key |
| Checkout (create order from cart) | POST | /cart/checkout | Service Key |

See the main [API Reference](../api-reference.md) for full request/response formats.

## Lead Status Transitions

| Event | Status |
|-------|--------|
| New contact created | `prospect` |
| Viewed menu or asked for info | `interested` |
| Order confirmed (transaction created) | `interested` → `closed_won` on payment |
| No reply after reminders | `abandoned` |

## Tier Rules (nightly recalculation)

| Tier | Criteria (last 90 days) |
|------|-------------------------|
| Bronze | orders <= 2 OR spend < $50 |
| Silver | 3-7 orders OR spend $50-$300 |
| Gold | >= 8 orders OR spend > $300 |
