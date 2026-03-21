# n8n WhatsApp Workflow — Setup Checklist

Use this after importing `docs/workflow.json` into n8n. Complete each step for the workflow to work end-to-end.

**Keeping the repo file updated:** After you edit the workflow in n8n, refresh `docs/workflow.json` so Git matches production — see [WORKFLOW-SYNC.md](./WORKFLOW-SYNC.md).

---

## 1. API URL and Service Key (Extract & Filter node)

The **Extract & Filter** Code node has two placeholders you must replace:

| Placeholder | What to set | Where to get it |
|-------------|-------------|------------------|
| `YOUR_API_BASE_URL` | Your Clienta AI API base URL | After deploy: `terraform output api_endpoint` (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com`). No trailing slash. |
| `YOUR_SERVICE_API_KEY` | Same secret used by your Lambdas | Same value as Terraform variable `service_api_key` (e.g. from `terraform/config/prod/secrets.tfvars` or CI). Never commit this value. |

**In n8n:** Open the **Extract & Filter** node → edit the first lines of the `jsCode`:

```javascript
const API_URL = "https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com";
const SERVICE_API_KEY = "your-actual-service-key";
```

Alternatively you can use n8n environment variables (e.g. `process.env.API_URL`) if you configure them in your n8n instance.

---

## 2. Meta WhatsApp Webhook URL

Meta must send webhooks to n8n. The workflow uses path **`whatsapp`**.

1. In **Meta for Developers** → your App → **WhatsApp** → **Configuration**, set:
   - **Callback URL:** `https://YOUR_N8N_HOST/webhook/whatsapp`
   - **Verify token:** any string you choose (e.g. `clienta-verify`); you only need it if Meta sends a GET verification request. The workflow returns `hub.challenge` and does not check the token.
2. Subscribe to **messages** (and any other fields you need).
3. Ensure your n8n instance is reachable from the internet (HTTPS). For local dev, use a tunnel (e.g. ngrok) and put that URL in Callback URL.

---

## 3. Meta Access Token (for sending replies)

The access token is **set per tenant** in **Connect WhatsApp** (Settings in the app). Each business owner enters their Meta Access Token and WhatsApp Business Account ID there. n8n receives them via **resolve-phone** (response includes `meta_access_token` and `meta_business_account_id`). All Graph API nodes use **Authorization: Bearer {{ $('Resolve Tenant').item.json.meta_access_token }}** — no env var or shared credential needed.

Nodes that send via Graph API (Send 3 Buttons, Send Products, Send Product Carousel, Send Order Text, Send Added, Send Cart Message, Send Order Placed, Send Reply) get the token dynamically from the Resolve Tenant response.

---

## 4. n8n Credentials (reconnect to yours)

The workflow **does not** use a shared WhatsApp API credential for sending. Graph API nodes use the per-tenant token from resolve-phone.

| Node / usage | Credential type | What to do |
|--------------|-----------------|------------|
| **Google Gemini Chat Model** | Google PaLM / Gemini API | Create a **Google Gemini (PaLM) API** credential with your API key and connect it to the **Google Gemini Chat Model** node so the **AI Agent** can run. |

No WhatsApp credential is required in n8n for send nodes; each tenant's token is supplied via Connect WhatsApp and resolve-phone.

---

## 5. Tenant and phone number mapping (backend)

For **Resolve Tenant** to return a `tenant_id` and credentials, each business must complete **Connect WhatsApp** in the app (or call the API).

1. **Create a tenant** (if needed) via your app or `POST /onboarding/tenant`.
2. **Run onboarding setup** with WhatsApp fields:
   - **`meta_phone_number_id`** (required) — the value Meta sends in `metadata.phone_number_id` for that WhatsApp number.
   - **`meta_access_token`** — from Meta App → WhatsApp → API (Temporary or System User token). Required for n8n to send replies.
   - **`meta_business_account_id`** — from Meta Business Suite → WhatsApp Manager → Phone numbers (Account ID). Optional but useful for some Graph API paths.
   - **`ai_system_prompt`** and other config (e.g. `business_name`) for the **AI Agent** ("Something else" path).

Use **Connect WhatsApp** in Settings, or `POST /onboarding/setup` with the above body. After this, `GET /onboarding/resolve-phone?phone_number_id=<id>` with **X-Service-Key** will return the full tenant config (including `tenant_id`, `meta_access_token`, `meta_business_account_id`).

**Already have a business signed up?** See [LINK-TENANT-AND-PROMPT.md](LINK-TENANT-AND-PROMPT.md) for step-by-step: get your tenant_id, get Meta's phone number ID, and call `POST /onboarding/setup` to link them and set the prompt (and token/Business Account ID).

## 6. Activate the workflow

In n8n, **activate** the workflow so the webhook is registered. Until it’s active, Meta’s requests to `/webhook/whatsapp` will not be handled.

---

## 7. Optional: First message and routing

- The **Route** node derives `route` from the first message or from button replies (`order`, `products`, `more_info`, `add_<id>`, `view_cart`, `checkout`).
- For the **first** text message (no button), the route is **show_options** → **Send 3 Buttons** (Order | Products | Something else).
- Ensure your **inventory** has at least one product if you want to test Products / Order / carousel.

---

## Quick reference

| Item | Value / action |
|------|----------------|
| Webhook path | `whatsapp` → full URL: `https://<n8n>/webhook/whatsapp` |
| API base URL | `terraform output api_endpoint` |
| Service key | Same as `service_api_key` in Terraform (secrets) |
| Meta token / WABA ID | Set per tenant in **Connect WhatsApp** (Settings); n8n gets them via resolve-phone |
| Tenant mapping | Connect WhatsApp or `POST /onboarding/setup` with `meta_phone_number_id`, `meta_access_token`, `meta_business_account_id` |
| Cart endpoints | Already in API: GET /cart, POST /cart/items, POST /cart/checkout |

Once these are done, the flow should: verify the webhook, resolve tenant, store inbound message, route by button/text, call inventory/cart/checkout or AI Agent, and send replies via WhatsApp.
