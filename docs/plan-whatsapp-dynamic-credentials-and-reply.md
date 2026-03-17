# Plan: Dynamic WhatsApp Credentials + Reply from UI

**Goal:** Store Meta Access Token and Business Account ID per tenant in Connect WhatsApp, so (1) n8n uses them dynamically (no hardcoded credential per business) and (2) the same credentials power “reply from UI” (WhatsApp Web–style).

---

## 1. Current state

- **Connect WhatsApp** (Settings) collects: **Meta Phone Number ID**, **AI system prompt**. Stored in the **tenant record** in DynamoDB.
- **Where Meta Phone Number ID lives:**
  - **Tenant item:** `pk = TENANT#<tenant_id>`, `sk = TENANT#<tenant_id>`, attribute `meta_phone_number_id`. Updated via POST /onboarding/setup (`TENANT_CONFIG_FIELDS`).
  - **Phone mapping (for resolve-phone):** Same table, `pk = PHONE_NUMBER_ID` (constant), `sk = <meta_phone_number_id>`, attribute `tenant_id`. Lets n8n look up tenant_id from the webhook’s phone_number_id.
- **n8n** uses a **single hardcoded WhatsApp credential** (Access Token + Business Account ID) for all Graph API nodes. One workflow cannot serve multiple businesses with different tokens.
- **resolve-phone** returns tenant config (tenant_id, business_name, meta_phone_number_id, ai_system_prompt, etc.) to n8n but does not return credentials.
- **Reply from UI** does not exist yet; sending would require the backend to call the Graph API with the tenant’s token.

---

## 2. Target state

- **Connect WhatsApp** also collects: **Meta Access Token**, **WhatsApp Business Account ID** (WABA ID). **All stored in the same tenant record in DynamoDB** (no Secrets Manager).
- **resolve-phone** (service-key only) returns the full tenant config **including** `meta_access_token` and `meta_business_account_id` so n8n can use them in the same run.
- **GET /onboarding/config** (JWT) returns tenant config **with `meta_access_token` redacted** (so the SPA never sees the token). Returns `meta_business_account_id` and other fields for display.
- **n8n workflow** uses **dynamic** auth: every Graph API node gets `Authorization: Bearer {{ $('Resolve Tenant').item.json.meta_access_token }}` (no predefined WhatsApp credential). One workflow can serve many tenants.
- **Reply from UI**: Backend reads token from the tenant record and implements **POST /messages/send** (same credentials as n8n).

---

## 3. Data model and storage (all in DynamoDB)

| Data                         | Stored where        | Who can read it                                    |
|------------------------------|---------------------|----------------------------------------------------|
| Meta Phone Number ID         | Tenant item         | Frontend, n8n (via resolve-phone)                  |
| Meta Access Token            | Tenant item         | Backend only; redacted in GET /onboarding/config   |
| WhatsApp Business Account ID | Tenant item         | Frontend (display), n8n                            |
| AI system prompt             | Tenant item         | Frontend, n8n                                      |

- **Single tenant item** (same as today): `pk = TENANT#<tenant_id>`, `sk = TENANT#<tenant_id>`. Add attributes: `meta_access_token`, `meta_business_account_id`. All WhatsApp-related fields live here; no Secrets Manager.
- **Redaction:** When returning config to the **frontend** (GET /onboarding/config), strip or omit `meta_access_token` so the token is never sent to the browser. When returning config to **n8n** (resolve-phone), include the token.
- **Logging:** Do not log `meta_access_token` anywhere.

---

## 4. Backend changes

### 4.1 Onboarding Lambda

- **TENANT_CONFIG_FIELDS:** Add `meta_business_account_id` and `meta_access_token` so complete_setup can write them to the tenant item.
- **complete_setup (POST /onboarding/setup):**
  - Accept body fields: `meta_phone_number_id`, `meta_business_account_id`, `meta_access_token`, `ai_system_prompt` (all optional except as needed for “connect”).
  - Write all provided fields to the tenant record in DynamoDB via existing `update_item` (same as today for meta_phone_number_id and ai_system_prompt).
  - Keep existing behavior for `meta_phone_number_id` and phone mapping.
- **_load_tenant_config(tenant_id):**
  - Load tenant from DynamoDB (unchanged). Result includes `meta_access_token` and `meta_business_account_id` (both in the same item).
- **resolve_phone (GET /onboarding/resolve-phone):**
  - Return the full config from `_load_tenant_config` **including** `meta_access_token` and `meta_business_account_id` so n8n can use them. Caller is service-key only.
- **get_tenant_config (GET /onboarding/config):**
  - Load config with `_load_tenant_config`, then **redact** `meta_access_token` (e.g. pop the key or set to None) before returning. Return `meta_business_account_id` and other fields so the UI can show “Connected” and Business Account ID.

### 4.2 Models

- **Tenant (shared/models.py):** Add `meta_business_account_id: str | None = None` and `meta_access_token: str | None = None`. Ensure `from_dynamo` / `to_dict` include them so config and resolve-phone can return them (and so redaction in get_tenant_config is explicit).

### 4.3 Terraform

- No Secrets Manager or new IAM for onboarding. DynamoDB table already exists and Lambda already has access. Optional: enable encryption at rest on the table if not already (AWS best practice); credentials are in the same table as other tenant data.

### 4.4 (Later) Reply from UI

- **POST /messages/send** (or equivalent): Auth = JWT (tenant from token). Body e.g. `{ "to_number": "+...", "text": "..." }`. Lambda loads tenant from DynamoDB (including `meta_access_token`), calls Graph API with that token, then stores outbound message. Same tenant item as n8n.

---

## 5. Frontend changes (Connect WhatsApp)

- **Form fields (add):**
  - **Meta Access Token** – password input, optional if already connected (allow update). Help text: “From Meta App → WhatsApp → API → Temporary or System User token.”
  - **WhatsApp Business Account ID** – text input, optional. Help text: “From Meta Business Suite → WhatsApp Manager → Phone numbers (Account ID).”
- **Submit:** POST /onboarding/setup with `meta_phone_number_id`, `meta_business_account_id`, `meta_access_token` (if filled), `ai_system_prompt`. Backend writes all to the tenant record in DynamoDB.
- **Connected state (when meta_phone_number_id is set):**
  - Show “Connected” and, if available, **Business Account ID** (from config). Do **not** show or echo the access token (show “Token configured” or leave blank); config API does not return the token.
  - **Edit:** Same form; user can change Phone Number ID, Business Account ID, token (re-enter to change), AI prompt. Backend updates tenant item.

---

## 6. n8n workflow changes

- **Resolve Tenant:** Already calls GET resolve-phone; response will now include `meta_access_token` and `meta_business_account_id` from the tenant record.
- **All nodes that call Graph API** (Send 3 Buttons, Send Products, Send Product Carousel, Send Order Text, Send Added, Send Cart Message, Send Order Placed, etc.):
  - **Remove** “Authentication → Predefined Credential Type → WhatsApp API” (no shared hardcoded credential).
  - **Add** header: `Authorization: Bearer {{ $('Resolve Tenant').item.json.meta_access_token }}`.
  - Ensure the node runs after **Resolve Tenant** and uses the same run’s output (so the token is per-tenant for that request).
- **URLs:** Current send-message URL uses `phone_number_id` from webhook metadata; no change. If any node needs the **Business Account ID** in the path (e.g. media or other APIs), use `$('Resolve Tenant').item.json.meta_business_account_id`.
- **Error handling:** If `meta_access_token` is missing (e.g. tenant never set token in Connect WhatsApp), Graph API calls will 401; optional: in n8n show a clear error or fallback message when token is missing.

---

## 7. Security summary

- **Token:** Stored in DynamoDB (tenant item). Returned only by resolve-phone (service-key only, server-side n8n). Never returned by GET /onboarding/config (redacted for frontend). Never logged.
- **Business Account ID:** Stored in DynamoDB; returned in config; can be shown in UI.
- **resolve-phone:** Service-key only; returns full config including token to n8n. Frontend uses JWT and only calls GET /onboarding/config, which does not include the token.

---

## 8. Implementation order

1. **Backend:** Tenant model – add `meta_business_account_id`, `meta_access_token`. Add both to `TENANT_CONFIG_FIELDS`.
2. **Backend:** complete_setup – accept and write `meta_access_token` and `meta_business_account_id` to the tenant item (no Secrets Manager).
3. **Backend:** resolve_phone – return full config from _load_tenant_config (includes token and business_account_id).
4. **Backend:** get_tenant_config – redact `meta_access_token` before returning (so frontend never sees it).
5. **Frontend:** Connect WhatsApp – add Access Token (password) and Business Account ID fields; Connected state shows business_account_id, not token.
6. **n8n:** Update workflow.json – all Graph API nodes use dynamic `Authorization: Bearer {{ $('Resolve Tenant').item.json.meta_access_token }}`, remove predefined WhatsApp credential.
7. **(Later)** Reply from UI: POST /messages/send + conversation view + reply box (token read from tenant item).

---

## 9. Docs to update

- **docs/n8n-flows/README.md** (or equivalent): State that each business must set Meta Access Token and Business Account ID in Connect WhatsApp; n8n no longer uses a single hardcoded credential.
- **Setup checklist** in workflow sticky note: Point to Connect WhatsApp for Phone Number ID, Access Token, and Business Account ID; note that credentials are per-tenant and supplied dynamically via resolve-phone.

---

*This plan keeps all WhatsApp credentials in the tenant record in DynamoDB (one place per business), avoids Secrets Manager, and reuses the same storage for n8n and future “reply from UI”.*
