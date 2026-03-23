# Debug: "Invalid service key" in n8n

The API returns this when **X-Service-Key** is sent but does **not** exactly match the **onboarding** Lambda’s `SERVICE_API_KEY` env var.

---

## 1. Test with curl (bypass n8n)

Use the **exact** value from `terraform/config/prod/secrets.tfvars` → `service_api_key`.

```bash
# Replace YOUR_API_BASE_URL and YOUR_SERVICE_KEY with real values
curl -s -o /dev/null -w "%{http_code}" \
  "https://YOUR_API_BASE_URL/onboarding/resolve-phone?phone_number_id=123" \
  -H "X-Service-Key: YOUR_SERVICE_KEY"
```

- **200** → Backend key is correct; the problem is what n8n sends (see step 2).
- **401 "Invalid service key"** → Backend key is wrong or empty; fix Lambda env (see step 3).
- **400** (e.g. phone_number_id) or **404** (no tenant) → Key is OK; fix phone/tenant instead.

---

## 2. Make n8n send the same key

The **Resolve Tenant** node uses `$json.service_api_key`, which comes from the **Extract & Filter** Code node.

- Open **Extract & Filter** and find:  
  `const SERVICE_API_KEY = ".....";`
- Set that string to the **exact same** value as in `secrets.tfvars` (copy/paste).
- No extra spaces, no extra quotes inside the string, no newline in the value.
- Save the workflow and activate it again.

If curl with that key returns 200 but n8n still gets 401, n8n is still sending something different (typo, different credential, or a different workflow/node).

---

## 3. Ensure the Lambda has the key

The **onboarding** Lambda must have `SERVICE_API_KEY` set.

- **Console:** AWS → Lambda → **onboarding** function → Configuration → Environment variables → **SERVICE_API_KEY**.  
  If it’s missing or wrong, Edit and set it to the same value as in `secrets.tfvars`, then Save.
- **Terraform:** From `terraform/` run:
  ```bash
  terraform apply -var-file=config/prod/variables.tfvars -var-file=config/prod/secrets.tfvars
  ```
  so the Lambda env is updated from `service_api_key`.

---

## 4. Typical causes

| Cause | What to do |
|--------|-------------|
| n8n still has old key | Update `SERVICE_API_KEY` in Extract & Filter and save. |
| Lambda env empty or old | Set in Console or run Terraform apply with secrets.tfvars. |
| Typo or extra space | Copy key from secrets.tfvars into n8n; no spaces before/after. |
| Wrong API URL | Resolve Tenant URL must be the same API as in curl (same env). |

Once the key in **secrets.tfvars**, **Lambda env**, and **Extract & Filter** are identical, the error should stop.
