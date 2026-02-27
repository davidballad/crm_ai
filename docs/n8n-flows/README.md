# n8n Flow Templates for Clienta AI

This folder contains n8n workflow templates for the WhatsApp guided order flow.

## Prerequisites

- n8n instance (self-hosted or cloud)
- Clienta AI API base URL (e.g. `https://<api-id>.execute-api.<region>.amazonaws.com`)
- JWT token for authenticated API calls: store in n8n credentials or env var `CLIENTA_AI_TOKEN`
- Meta WhatsApp Cloud API access token for sending messages

## Webhook URL

Point Meta WhatsApp Cloud API to your API Gateway:

- **Verification (GET):** `https://<api>/webhooks/inbound-message`
- **Events (POST):** Same URL. Lambda validates HMAC, stores the message, and returns 200.

After storing the message, configure Lambda (or an EventBridge rule) to trigger the n8n Inbound Message Handler webhook.

## Phone → Tenant Mapping

DynamoDB item required:

- `pk` = `PHONE`, `sk` = normalized business phone number, `tenant_id` = your tenant ID

## Workflows

| File | Purpose |
|------|---------|
| `inbound-message-handler.json` | Routes incoming messages to Order, Info, or AI Chatbot subflows |
| `order-flow.json` | Guided order: menu → cart → delivery/pickup → payment → confirm |
| `incomplete-handling.json` | Sends reminders for stale conversations, marks abandoned |
| `post-order.json` | On payment confirmation: update transaction, contact status, tier |

## WhatsApp Flow Summary

```
Customer sends first message
  → Welcome: "Choose: 1) Order  2) Info  3) Something Else"

Option 1 (Order):
  → Show menu (from inventory API)
  → Collect cart items
  → Ask: Pickup or Delivery?
  → If delivery: ask for location
  → Ask: Cash or Transfer?
  → Confirm with name
  → Check inventory → Create transaction (idempotent)
  → Send confirmation

Option 2 (Info):
  → Send store info (hours, directions, contact)
  → Offer to start Order flow

Option 3 (Something Else):
  → Forward to AI chatbot
```

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

## API Endpoints Used

| Purpose | Method | Endpoint | Auth |
|---------|--------|----------|------|
| Find contact by phone | GET | /contacts?phone=X | JWT |
| Create contact | POST | /contacts | JWT |
| Update contact | PATCH | /contacts/{id} | JWT |
| Save message | POST | /messages | JWT |
| Update message flags | PATCH | /messages/{id}/flags | JWT |
| List messages | GET | /messages?category=X | JWT |
| Check inventory | GET | /inventory/{id} | JWT |
| Create transaction | POST | /transactions | JWT |
| Update transaction | PATCH | /transactions/{id} | JWT |
| Inbound webhook | POST | /webhooks/inbound-message | HMAC |

See the main [API Reference](../api-reference.md) for full request/response formats.
