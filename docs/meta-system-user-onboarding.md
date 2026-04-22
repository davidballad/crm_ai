# Meta System User Setup — Merchant Onboarding Guide

Use this checklist when onboarding a new merchant onto Clienta AI. You (the admin) complete these steps on behalf of the business — the merchant does not need a developer account.

---

## What you need before starting

- Access to the merchant's **Meta Business Suite** (business.facebook.com) — ask them to add you as an admin, or do this together in a screen share.
- A **WhatsApp number** already registered under their Business Account (or ready to register).
- The merchant's **Clienta AI tenant** already created (`POST /onboarding/tenant` or via the dashboard).

---

## Step 1 — Create a System User in Meta Business Suite

System Users generate permanent tokens that don't expire when an employee leaves or a password changes.

1. Go to **business.facebook.com** → select the merchant's Business.
2. **Business Settings** → **Users** → **System Users**.
3. Click **Add** → give it a name (e.g. `clientaai-bot`) → Role: **Admin**.
4. Click **Create System User**.

---

## Step 2 — Generate a Permanent Token

1. Still on the System User → click **Generate New Token**.
2. Select the App: choose the **Clienta AI Meta App** (or the merchant's own app if they have one).
3. Select permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Click **Generate Token**.
5. **Copy the token immediately** — it is only shown once. Store it securely (e.g. in 1Password under the merchant's name).

---

## Step 3 — Get the Meta Phone Number ID

1. In **Meta for Developers** → Apps → select the app → **WhatsApp** → **API Setup**.
2. Under **From**, select the WhatsApp number → copy the **Phone Number ID** (numeric, e.g. `123456789012345`).

   Alternatively: **Meta Business Suite** → **WhatsApp Manager** → select the number → the ID appears in the URL or details panel.

---

## Step 4 — Get the WhatsApp Business Account ID (WABA ID)

1. **Meta Business Suite** → **WhatsApp Manager** → top of the page shows the **Account ID**.
2. Or: in the App Dashboard → **WhatsApp** → **API Setup** → under the phone number it shows the WABA ID.

---

## Step 5 — Enter credentials in Clienta AI

Open **Settings → Connect WhatsApp** for the merchant's tenant and fill in:

| Field | Value |
|---|---|
| Meta Phone Number ID | From Step 3 |
| WhatsApp Business Phone Number | Plain number, digits only (e.g. `593987654321`) |
| Meta Access Token | System User token from Step 2 |
| Meta Business Account ID | WABA ID from Step 4 |

Click **Save**. The backend stores the token encrypted.

---

## Step 6 — Map the phone to the tenant (n8n resolve)

For n8n to route inbound messages to the right tenant, the `meta_phone_number_id` must be linked. Saving via Connect WhatsApp (Step 5) does this automatically via `POST /onboarding/setup`.

Verify with:
```
GET /onboarding/resolve-phone?phone_number_id=<id>
Headers: X-Service-Key: <service_key>
```
Should return the tenant config including `tenant_id` and `meta_access_token`.

---

## Step 7 — Set the webhook (one-time per Meta App)

If not already done for this Meta App:

1. **Meta for Developers** → App → **WhatsApp** → **Configuration**.
2. **Callback URL:** `https://<n8n-host>/webhook/whatsapp`
3. **Verify Token:** any string (e.g. `clienta-verify`).
4. Subscribe to **messages**.

This is shared across all tenants on the same n8n instance — only needs to be done once.

---

## Quick reference

| Item | Where to find |
|---|---|
| System User token | Meta Business Suite → Business Settings → System Users → Generate Token |
| Phone Number ID | Meta for Developers → App → WhatsApp → API Setup |
| WABA ID | Meta Business Suite → WhatsApp Manager → Account ID |
| Connect WhatsApp | Clienta AI → Settings → Connect WhatsApp |
| Verify tenant linked | `GET /onboarding/resolve-phone?phone_number_id=<id>` |

---

## Troubleshooting

**Token expired / invalid:** System User tokens don't expire, but they can be revoked. Go to Business Settings → System Users → select the user → regenerate a token and update it in Connect WhatsApp.

**`resolve-phone` returns 404:** The `meta_phone_number_id` wasn't saved correctly. Re-save via Connect WhatsApp and confirm the ID matches exactly what Meta shows (numeric string, no spaces).

**n8n not routing messages:** Confirm the n8n workflow is **Active** and the webhook URL matches the Callback URL in Meta. Also confirm the `meta_phone_number_id` in the inbound webhook payload matches what's stored.
