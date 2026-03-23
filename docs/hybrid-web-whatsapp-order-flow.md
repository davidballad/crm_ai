# Hybrid: web shop → WhatsApp (order summary + payment screenshot)

Goal: customers browse/add to cart on a **small web UI**, complete checkout there, then **continue in WhatsApp** with the same **order summary + ask for payment screenshot** behavior you already support (`payment_proof` on transactions, inbound images in n8n).

---

## What “back to WhatsApp automatically” really means

Browsers **cannot** force-open WhatsApp without a user gesture on some platforms. Production pattern:

1. **Primary (best UX):** When checkout succeeds, your **backend** sends a **WhatsApp message** to the customer’s number using the **Cloud API** (same as n8n: `POST` to Graph `/{phone-number-id}/messages`). The customer **sees a new message in the chat** — that *is* “returning” to WhatsApp.
2. **Secondary:** On the **order success page**, show a button **“Open WhatsApp”** using a deep link:
   - `https://wa.me/<BUSINESS_WA_NUMBER>?text=<urlencoded_summary>`
   - Pre-fills text so they only tap Send (or attach screenshot). Use **E.164 without +** for `wa.me` (e.g. `5215512345678`).

Use **both**: server push = automatic thread update; button = backup if push fails or user closed the app.

---

## End-to-end flow

| Step | Where | What |
|------|--------|------|
| 1 | WhatsApp | Bot sends link: **“Full catalog”** → `https://app.clientaai.com/shop?t=<token>&tenant=...` (magic link or short-lived JWT tying **tenant + customer phone**). |
| 2 | Web | List products (inventory API), cart (`GET/POST /cart` with same **customer_phone** as WhatsApp). |
| 3 | Web | **Checkout** → `POST /cart/checkout` (same as today) with `customer_phone`, name, etc. |
| 4 | API | Returns **transaction** (id, total, …). Cart clears as now. |
| 5 | API (new hook) | **Outbound WhatsApp**: call Meta API with a **text** (and optional **template**) summarizing order + **“Reply with your payment screenshot here.”** |
| 6 | WhatsApp | User stays in thread; workflow receives **image** → existing path to **attach payment proof** / staff review. |

Your **n8n** flow for inbound messages **unchanged** for the payment step: still listens for media, maps to tenant, updates transaction if you already do that in Lambda/tools.

---

## Implemented in Clienta

### Backend — `backend/functions/shop/handler.py`

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /shop/token` | Service key (n8n) | Returns HMAC-signed token: `{ "token": "..." }`. Body: `tenant_id`, `customer_phone`. |
| `GET /shop/products?token=T` | Token | Product list for tenant. |
| `GET /shop/cart?token=T` | Token | Cart for this customer. |
| `POST /shop/cart?token=T` | Token | Body: `product_id`, `action` (`add`/`remove`/`set`), `quantity`. |
| `POST /shop/checkout?token=T` | Token | Creates transaction, decrements inventory, sends WhatsApp summary, clears cart. Returns `transaction_id`, `total`, `wa_link`. |

Token: `base64(tenant_id:phone:timestamp:hmac_sha256_16chars)`, signed with `SERVICE_API_KEY`, expires 24 h.

### Frontend — `/shop?t=<token>`

`frontend/src/pages/Shop.jsx` — mobile-first product grid, category filter, inline +/− quantity, slide-up cart panel, checkout with name, success page with **"Open WhatsApp"** button (`wa.me` deep link).

### n8n — what to add

1. In **Order** path (or as a new button), add an **HTTP Request** node: `POST {{api_url}}/shop/token` with service key, body `{ "tenant_id": "...", "customer_phone": "..." }`.
2. Send a **WhatsApp button** or **text** to the customer with URL: `https://www.clientaai.com/shop?t={{$json.token}}`.
3. After checkout, backend sends WhatsApp summary automatically — no n8n node needed for that.

### Post-checkout WhatsApp message

The shop Lambda loads the tenant's `meta_access_token` and `meta_phone_number_id` from DynamoDB and sends a text message via Graph API with order summary + "Reply here with your payment screenshot."

---

## Copy example (WhatsApp message after web checkout)

```
Pedido #abc123 — Total: $45.00
Gracias. Para continuar, envía aquí una captura de tu pago (transferencia).
```

(Adjust to match your existing checkout / bank-instructions copy.)

---

## Summary

- **Hybrid** = web for **catalog + cart UX**; WhatsApp for **trust, payment proof, and support**.
- **“Automatic” return** = **server-sent WhatsApp message** after checkout (plus optional `wa.me` button).
- **Same backend**: `POST /cart/checkout`. **Same proof**: existing `payment_proof` + inbound message handling.
