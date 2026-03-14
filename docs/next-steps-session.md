# Next Steps (continue from previous session)

Use this after opening a new chat so the next assistant has context.

---

## Where you left off

- **Signup, dashboard, inventory, messages, leads, and AI insights are working.** Auth works for both browser (JWT) and n8n (X-Service-Key + X-Tenant-Id).
- **Pydantic** was removed earlier; models use stdlib dataclasses in `backend/shared/models.py`.
- **Terraform** is in sync. CloudFront custom domain: `www.clientaai.com`. Service API key via `TF_VAR_service_api_key` or `-var="service_api_key=..."`.
- **Lambda layer** must be built with **`make layer-docker`** on Windows (not `make layer`), so `cryptography` and PyJWT get Linux binaries for Lambda.

---

## What was done this session

1. **Cognito custom attributes (signup 400 "Attribute does not exist")**  
   The user pool was created before `custom:tenant_id` and `custom:role` were in Terraform. We added them to the **existing** pool via AWS CLI (no pool replace):
   ```bash
   aws cognito-idp add-custom-attributes --user-pool-id <POOL_ID> --custom-attributes Name=custom:tenant_id,AttributeDataType=String,Mutable=true Name=custom:role,AttributeDataType=String,Mutable=true
   ```

2. *(Rest of original session notes could not be recovered — file was not in git.)*

---

## Steps left to do (workflow setup)

You were in the middle of **WhatsApp workflow setup**. Suggested order:

### Backend (if not already done)
- [ ] Deploy or re-deploy backend so **cart API** is live: `GET /cart`, `POST /cart/items`, `POST /cart/checkout` (see [deployment-guide.md](deployment-guide.md)).
- [ ] Ensure **transactions** Lambda has the new cart routes (Terraform has the routes; Lambda code must be packaged and updated).

### n8n
- [ ] Import **workflow**: in n8n, import `docs/workflow.json` (or copy/paste the JSON).
- [ ] In the **Extract & Filter** node, set your real `API_URL` and `SERVICE_API_KEY` (same as Terraform `service_api_key`).
- [ ] Set **META_ACCESS_TOKEN** in n8n (environment variable or credential) so Send 3 Buttons, Send Product Carousel, Send Added, etc. can call the WhatsApp Cloud API.
- [ ] Configure **WhatsApp** credential in n8n if the nodes use it (e.g. Send Products, Send Reply).

### Meta / WhatsApp
- [ ] In Meta App Dashboard → WhatsApp → Configuration: set **Webhook URL** to your n8n webhook (e.g. `https://<your-n8n>/webhook/whatsapp`).
- [ ] Subscribe to **messages** (and verify with GET challenge if needed).
- [ ] For each business number: note the **phone_number_id** (used for resolve-phone and sending).

### Tenant + phone mapping
- [ ] Create the tenant (sign up in the app or `POST /onboarding/tenant` then complete setup).
- [ ] **POST /onboarding/setup** with that tenant’s JWT: send `meta_phone_number_id` (and optionally `ai_system_prompt` for “Something else”). That links the number so n8n’s **Resolve Tenant** returns the right tenant.

### Test the flow
- [ ] Send a message to the business WhatsApp number → you should get the 3 buttons (Order | Products | Something else).
- [ ] Tap **Order** → product carousel (or text if 0–1 products); tap **Add to cart** on a product → “Added!” and View cart / Keep browsing.
- [ ] Tap **View cart** → cart summary and Checkout; tap **Checkout** → order created and confirmation message.
- [ ] Tap **Something else** → AI reply (store info).

### Optional
- [ ] Add **image_url** to products in inventory so the carousel shows real images (otherwise placeholder is used).
- [ ] Wire a **payment link** after checkout (e.g. Square) if you want to send a pay link in the “Order placed” message.
