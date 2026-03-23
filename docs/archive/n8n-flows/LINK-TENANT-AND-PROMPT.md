# Link Your Existing Business (tenant_id + prompt) for n8n

If you already have a test business signed up and only need to **link the WhatsApp phone number** and **set the AI prompt**, do this from the app or with API calls.

---

## 1. Get your Meta Phone Number ID

n8n resolves the tenant using Meta’s **phone number ID**, not the human-readable number.

1. Go to [Meta for Developers](https://developers.facebook.com/) → your App → **WhatsApp** → **API Setup** (or **Configuration**).
2. Under **Phone numbers**, find the number you use for the test business.
3. Copy the **Phone number ID** (e.g. `106540352242922`). That is your **`meta_phone_number_id`**.

---

## 2. Get your tenant_id

You need the tenant ID of the business that “owns” this WhatsApp number.

**Option A — From the app (easiest)**  
Log in as the owner of the test business. The app gets `tenant_id` from the JWT (`custom:tenant_id`). If your app shows a “Settings” or “Workspace” screen that calls `GET /onboarding/config`, the response body includes `id` (and now also `tenant_id`) — that value is your tenant ID.

**Option B — From the API**  
Call your API with the owner’s JWT:

```http
GET https://YOUR_API_ENDPOINT/onboarding/config
Authorization: Bearer <owner_id_token>
```

The response body will include `"id"` and `"tenant_id"` (same value). Use that as your **tenant_id**.

**Option C — From the browser**  
Log in to the frontend, open DevTools → Application (or Storage) → look for the stored token or any API response that contains `custom:tenant_id` or the config response; that value is your tenant_id.

---

## 3. Link the phone number and set the prompt (POST /onboarding/setup)

This step creates the **phone_number_id → tenant_id** mapping (so n8n’s “Resolve Tenant” works) and saves the **AI system prompt** (used for “Something else” in the flow).

You must be authenticated as the **owner** of that tenant (JWT).

**Request:**

```http
POST https://YOUR_API_ENDPOINT/onboarding/setup
Authorization: Bearer <owner_id_token>
Content-Type: application/json

{
  "meta_phone_number_id": "106540352242922",
  "ai_system_prompt": "You are a helpful store assistant for Maria's Kitchen. Answer customer questions about the menu, opening hours, and location. Be friendly and concise. Respond in the same language the customer uses. Do not take orders—direct customers to use the Order button."
}
```

- Replace `YOUR_API_ENDPOINT` with your API base URL (e.g. from `terraform output api_endpoint`).
- Replace `106540352242922` with the **Phone number ID** from step 1.
- Replace `ai_system_prompt` with your own text (or omit it to use the default in the workflow).
- You can also set other fields in the same call (e.g. `business_hours`, `currency`) — see the onboarding API for allowed fields.

**From the frontend:**  
If your app has a “Complete setup” or “Connect WhatsApp” screen that calls `completeSetup(data)`, use it and pass the same payload:

```js
completeSetup({
  meta_phone_number_id: "106540352242922",
  ai_system_prompt: "You are a helpful store assistant for..."
});
```

---

## 4. What this fixes

| Before | After |
|--------|--------|
| n8n calls GET /onboarding/resolve-phone?phone_number_id=X → **404** (no tenant) | The mapping exists → response includes **tenant_id** and **ai_system_prompt** |
| AI Agent “Something else” has no custom prompt | AI Agent uses your **ai_system_prompt** (or the workflow fallback) |

After this, when a message hits your webhook, n8n will resolve the tenant, get `tenant_id` and `ai_system_prompt`, and the rest of the flow (inventory, cart, AI reply) will work for that business.

---

## 5. Optional: Verify

- Call **GET /onboarding/resolve-phone?phone_number_id=YOUR_PHONE_NUMBER_ID** with **X-Service-Key** and confirm the JSON has `tenant_id` and, if you set it, `ai_system_prompt`.
- Send a WhatsApp message to your business number and confirm you get the three buttons and that “Something else” uses your prompt.
