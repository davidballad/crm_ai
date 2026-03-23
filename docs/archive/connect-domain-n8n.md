# Connect Your Domain and n8n

Use this after Terraform is deployed to wire **clientaai.com**, your **API**, and **n8n** (with Meta WhatsApp) together.

---

## 1. Get Your API and Auth Values

From the repo (with AWS profile set):

```bash
cd terraform
terraform output api_endpoint
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cloudfront_domain
```

You need:

- **API base URL** — e.g. `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com` (no trailing slash).
- **Cognito User Pool ID** and **Cognito Client ID** — for the frontend login.
- **CloudFront domain** — e.g. `d1234abcd.cloudfront.net` (for DNS below).

---

## 2. Domain → Frontend (GoDaddy, no extra cost)

**Best option with $0 extra:** use **www.clientaai.com** (CNAME works at GoDaddy). Do **not** add a CNAME for the root (`@`) — GoDaddy does not allow it.

### Step A: CNAME for www (or app)

1. Get your CloudFront domain:
   ```bash
   cd terraform && terraform output -raw cloudfront_domain
   ```
   Example: `d1234abcd.cloudfront.net`

2. In **GoDaddy** → **My Products** → **DNS** (or **Manage DNS** for clientaai.com).

3. **Add** a record:
   - **Type:** CNAME
   - **Name:** `www` (you’ll use **https://www.clientaai.com**)  
     or `app` (you’ll use **https://app.clientaai.com**)
   - **Value:** paste the CloudFront domain (e.g. `d1234abcd.cloudfront.net`)
   - **TTL:** 600 or default → Save.

4. Wait 5–30 minutes for DNS to propagate. For **https://www.clientaai.com** to work without certificate errors, complete **Step B** (add the domain and free ACM cert to CloudFront).

### Step B: Custom domain + HTTPS in CloudFront (so www works with SSL)

So that **https://www.clientaai.com** loads with a valid certificate:

1. **Request a certificate (ACM, us-east-1)**  
   - AWS Console → **Certificate Manager** (region **N. Virginia / us-east-1**).  
   - **Request certificate** → **Public certificate** → add **www.clientaai.com** (and optionally **clientaai.com** if you forward it later).  
   - Validation: **DNS** → add the CNAME that ACM shows to GoDaddy DNS.  
   - Wait until status is **Issued**.

2. **Attach to CloudFront**  
   - **CloudFront** → your distribution (ID from `terraform output cloudfront_distribution_id`).  
   - **Edit** → **Alternate domain names (CNAMEs):** add `www.clientaai.com`.  
   - **Custom SSL certificate:** choose the ACM certificate.  
   - Save. Wait a few minutes.

After that, **https://www.clientaai.com** will serve your app with HTTPS (no extra cost; ACM and CloudFront custom domain are free).

### Step C (optional): Forward root to www

So that **clientaai.com** redirects to **www.clientaai.com**:

- In **GoDaddy** → **Forwarding** (or **Domain Forwarding**).  
- Add forwarding: **clientaai.com** → **https://www.clientaai.com**, type **Permanent (301)**.  
- No CNAME at root needed; this is a redirect only.

---

## 3. Frontend → API and Cognito

See [deployment-guide.md — Step 4](deployment-guide.md#step-4-configure-and-deploy-frontend) for frontend `.env` setup and deploy commands.

If you use a custom domain on CloudFront, invalidate the cache after each deploy:

```bash
aws cloudfront create-invalidation --distribution-id $(cd terraform && terraform output -raw cloudfront_distribution_id) --paths "/*"
```

---

## 4. n8n → API (Service Key and Base URL)

n8n calls your API with **service key auth** (no JWT). You already have:

- **Meta webhook URL:** `https://barnes-blvd-observed-overnight.trycloudflare.com/webhook/whatsapp` (receiving messages).

Configure n8n so every HTTP request to the Clienta API uses:

- **Base URL:** same as `VITE_API_URL` above (e.g. `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com`).
- **Headers:**
  - `X-Service-Key`: the same secret you set in Terraform as `service_api_key` (e.g. via `TF_VAR_service_api_key`).
  - `X-Tenant-Id`: set per request after resolving the tenant (see below).

Ways to set this in n8n:

- **Credentials:** create an HTTP Request credential or “Custom header” credential with `X-Service-Key: <your-secret>` and use it in all “HTTP Request” nodes that call the Clienta API.
- **Per workflow:** in the first node that calls the API (e.g. “Resolve tenant”), set the base URL and add header `X-Service-Key`; in later nodes add both `X-Service-Key` and `X-Tenant-Id` (from the resolve response).

---

## 5. n8n Workflow Details

See [n8n-flows/README.md](n8n-flows/README.md) for the full workflow architecture, Meta payload format, tenant resolution, and API endpoints used by the AI agent.

---

## 6. Map WhatsApp Number to a Tenant (Required for resolve-phone)

`GET /onboarding/resolve-phone?phone_number_id=...` only works if that `phone_number_id` is linked to a tenant.

1. **Create a tenant** (once):
   ```bash
   curl -X POST "https://YOUR_API_ENDPOINT/onboarding/tenant" \
     -H "Content-Type: application/json" \
     -d '{"business_name":"My Business","business_type":"restaurant","owner_email":"you@example.com","owner_password":"YourPassword123"}'
   ```

2. **Log in at the frontend**  
   - Open https://clientaai.com (or your CloudFront URL), sign in with that email/password.

3. **Complete setup with WhatsApp**  
   - In the dashboard, complete onboarding/setup and set **Meta phone number ID** (from [Meta Developer Console](https://developers.facebook.com/) → your WhatsApp app → Phone numbers).  
   - Or call the API after login (with JWT):
   ```bash
   POST /onboarding/setup
   Authorization: Bearer <your-jwt>
   Content-Type: application/json
   { "meta_phone_number_id": "YOUR_PHONE_NUMBER_ID_FROM_META" }
   ```

After this, when Meta sends a message to that number, n8n will receive it, call `resolve-phone` with that `phone_number_id`, and get your tenant and config.

---

## 7. Quick Checklist

| Step | What |
|------|------|
| 1 | Get `api_endpoint`, `cognito_user_pool_id`, `cognito_client_id`, `cloudfront_domain` from `terraform output`. |
| 2 | DNS: point clientaai.com (or www) to CloudFront domain; optionally add ACM + custom domain in CloudFront. |
| 3 | Frontend: create `frontend/.env` with `VITE_API_URL`, `VITE_COGNITO_*`, build and deploy to S3. |
| 4 | n8n: set API base URL and `X-Service-Key` (same as Terraform `service_api_key`) for all Clienta API calls. |
| 5 | n8n: webhook stays `https://barnes-blvd-observed-overnight.trycloudflare.com/webhook/whatsapp`; workflow parses Meta payload → resolve-phone → AI/tools with `X-Tenant-Id`. |
| 6 | Create a tenant, log in at clientaai.com, complete setup with `meta_phone_number_id` so resolve-phone works. |

---

## Summary

- **clientaai.com** → DNS CNAME to CloudFront (and optional custom domain + cert).
- **Frontend** → Built with `VITE_API_URL` + Cognito IDs, deployed to S3; uses API for all data.
- **n8n** → Receives Meta at `/webhook/whatsapp`; calls your API with `X-Service-Key` and (after resolve) `X-Tenant-Id`.
- **Tenant** → One-time: create tenant, log in, set `meta_phone_number_id` in setup so n8n can resolve and run the AI flow for that WhatsApp number.
