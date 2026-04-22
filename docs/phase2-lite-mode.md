# Phase 2: Lite Mode — WhatsApp without Meta API

**Status:** Not started. Kept for future reference.

**Why this exists:** Requiring the Meta WhatsApp Business API is the main onboarding hurdle for merchants who haven't gone through Meta's approval process. Lite Mode lets any business start selling immediately with just a plain WhatsApp number, then upgrade to full API later.

---

## What Lite Mode means

| Feature | Full (Meta API) | Lite (plain number) |
|---|---|---|
| Web checkout | ✅ | ✅ |
| Lead capture on checkout | ✅ | ✅ |
| Store link (`clientaai.com/store/<slug>`) | ✅ | ✅ |
| Inbound message capture (via n8n) | ✅ | ❌ no API to hook into |
| Order confirmation sent automatically | ✅ | ❌ manual via wa.me |
| Payment status update | ✅ | ❌ manual |
| Owner-approval → customer notified | ✅ | ❌ manual |
| Campaign broadcasts | ✅ | ❌ |
| Staff reply from CRM inbox | ✅ | ❌ read-only |

In Lite Mode the merchant handles order confirmations manually — the CRM shows a **"Send via WhatsApp"** button that opens a pre-filled `wa.me` deep link in their phone.

---

## Scope of work

### Backend

1. **Tenant model** — add `lite_mode: bool` flag (derived: `meta_phone_number_id` is absent).  
   File: [backend/shared/models.py](backend/shared/models.py)
   
   **Note on shop tokens:** Shop tokens are **not** tied to Meta API. Tokens are generated using `(tenant_id, customer_phone, timestamp, hmac_signature)` — `tenant_id` is a ULID created during tenant signup, independent of Meta credentials. Lite Mode tenants get a `tenant_id` normally, so shop token generation works identically in both modes. No special token handling needed.

2. **`_send_whatsapp_message()`** — already returns `False` silently when token/ID missing ([shop/handler.py:420-448](backend/functions/shop/handler.py#L420)).  
   Change: instead of silent fail, write a `pending_outbound` record to DynamoDB so the CRM can surface it.

3. **New endpoint** `GET /transactions/{id}/wa-link` — returns a pre-filled `wa.me` URL for an order:
   ```
   https://wa.me/<customer_phone>?text=<url-encoded confirmation message>
   ```
   File: [backend/functions/transactions/handler.py](backend/functions/transactions/handler.py)

4. **Onboarding** — allow `POST /onboarding/setup` with only `phone_number` (no `meta_phone_number_id`).  
   File: [backend/functions/onboarding/handler.py](backend/functions/onboarding/handler.py)
   
   **Implementation detail:** Currently `create_tenant()` requires `meta_phone_number_id`. For Lite Mode, make this field optional. The tenant will still get a `tenant_id` (ULID) and `phone_number` stored, enabling shop link generation and message recording.

### Frontend

5. **Connect WhatsApp** — make Meta fields optional when `lite_mode` is true; show a clear "Lite Mode" badge and "Upgrade to Full" CTA.  
   File: [frontend/src/pages/WhatsAppSetup.jsx](frontend/src/pages/WhatsAppSetup.jsx)

6. **Order detail / transaction view** — when `lite_mode` is true and an order lacks a sent confirmation, show:
   > ⚠️ Confirmation not sent — [Send via WhatsApp ↗]()  
   Button opens `wa.me` link in new tab.

7. **CRM Inbox** — show a banner "Inbox is read-only in Lite Mode" instead of the message compose box.

### n8n

8. No n8n changes needed for Lite Mode — n8n hooks only apply when the merchant has a Meta API phone registered.

---

## Upgrade path (Lite → Full)

Merchant enters Meta credentials in Connect WhatsApp → `meta_phone_number_id` is saved → `lite_mode` flag becomes `false` automatically → all features unlock, no data migration needed.

---

## Decision criteria for starting Phase 2

Start this work when **any** of the following is true:
- A prospective merchant declines to sign up specifically because of Meta API setup friction.
- Monthly signups plateau and onboarding interviews point to this barrier.
- A competitor launches a similar tool with zero-friction onboarding.

Until then, admin-assisted Meta setup ([docs/meta-system-user-onboarding.md](meta-system-user-onboarding.md)) covers the current scale.

---

## Estimated effort

| Area | Days |
|---|---|
| Backend (model flag, pending_outbound, wa-link endpoint, onboarding change) | 2 |
| Frontend (WhatsApp Setup, order detail button, inbox banner) | 2 |
| QA + deploy | 1 |
| **Total** | **~5 days** |
