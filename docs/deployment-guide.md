# Clienta AI — Deployment Guide

## System Overview

- 10 Lambda functions: inventory, transactions, purchases, ai_insights, onboarding, users, contacts, messages, payments, campaigns
- React SPA (Vite) → S3 + CloudFront
- DynamoDB single-table, Cognito User Pool, API Gateway HTTP API
- n8n (self-hosted at n8n.clientaai.com) handles WhatsApp AI agent via Ollama
- AI Insights Lambda uses Google Gemini API

---

## Prerequisites

- AWS CLI configured (`aws configure` or `AWS_PROFILE`)
- Terraform 1.5+
- Docker (required for building the Lambda layer)
- Node.js 20+

---

## Building and Deploying

### Backend (Lambda layer + functions + Terraform)

The Lambda layer contains native Python packages (`PyJWT`, `cryptography`, etc.) compiled for `linux/amd64`. **Always build with Docker** — local pip on Mac (arm64) produces ARM binaries that fail on Lambda.

```bash
# Step 1: Build the layer (linux/amd64 binaries via Docker)
make layer-docker

# Step 2: Package all Lambda functions
make package

# Step 3: Apply Terraform (uploads layer + functions, updates all infra)
cd terraform
export AWS_PROFILE=prod
terraform apply -var-file=config/prod/variables.tfvars -var-file=config/prod/secrets.tfvars
```

Or run steps 2 and 3 together:

```bash
make package && cd terraform && terraform apply -var-file=config/prod/variables.tfvars -var-file=config/prod/secrets.tfvars
```

Only re-run `make layer-docker` when `backend/requirements-lambda.txt` changes. For code-only changes, `make package` + `terraform apply` is enough.

### Frontend

```bash
./scripts/deploy-frontend.sh
```

This builds the React app, syncs to S3, and invalidates CloudFront. It reads bucket name and distribution ID from Terraform outputs automatically.

To manually set values (skip Terraform output lookup):

```bash
FRONTEND_BUCKET=my-bucket CLOUDFRONT_DISTRIBUTION_ID=EXXX ./scripts/deploy-frontend.sh
```

---

## Terraform Config Files

| File | Purpose |
|------|---------|
| `terraform/config/prod/variables.tfvars` | Non-secret config (region, domain, etc.) |
| `terraform/config/prod/secrets.tfvars` | Secrets: `gemini_api_key`, `service_api_key`, etc. — never commit |

---

## Frontend Environment Variables

`frontend/.env` is committed with the current prod values. If infrastructure is re-created and outputs change, update it:

```bash
cd terraform
cat > ../frontend/.env <<EOF
VITE_API_URL=$(terraform output -raw api_endpoint)
VITE_COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
EOF
```

---

## Getting a JWT for API Testing

```bash
CLIENT_ID=$(cd terraform && terraform output -raw cognito_client_id)

TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=you@email.com,PASSWORD=YourPassword \
  --query 'AuthenticationResult.IdToken' --output text)

curl "$API_URL/inventory" -H "Authorization: Bearer $TOKEN"
```

---

## Fix: Signup fails — custom attributes not in schema

If signup returns `Attributes did not conform to the schema: custom:tenant_id / custom:role`, the Cognito pool was created before those attributes were added to Terraform. Fix without replacing the pool:

```bash
POOL_ID=$(cd terraform && terraform output -raw cognito_user_pool_id)

aws cognito-idp add-custom-attributes --user-pool-id "$POOL_ID" --region us-east-1 \
  --custom-attributes Name=tenant_id,AttributeDataType=String,Mutable=true,Required=false,StringAttributeConstraints="{MinLength=1,MaxLength=128}"

aws cognito-idp add-custom-attributes --user-pool-id "$POOL_ID" --region us-east-1 \
  --custom-attributes Name=role,AttributeDataType=String,Mutable=true,Required=false,StringAttributeConstraints="{MinLength=1,MaxLength=32}"
```

---

## Square Payment Processing

Square integration is optional. The system works without it (transactions recorded manually).

**Setup:**
1. Create app at [developer.squareup.com](https://developer.squareup.com)
2. Add `square_application_id` to `config/prod/variables.tfvars`
3. Store the app secret in Secrets Manager (never in Terraform or `.env`):

```bash
aws secretsmanager put-secret-value \
  --secret-id "clienta-ai-prod-square-credentials" \
  --secret-string '{"application_secret":"YOUR_SECRET","webhook_signature_key":"YOUR_KEY"}'
```

4. Register webhook in Square Dashboard → your app → Webhooks → URL: `<api_endpoint>/payments/webhook`
5. Each tenant connects their Square account via `GET /payments/square/connect` in the app

---

## SES Email Verification

See [ses-verification.md](ses-verification.md) for setting up transactional email if needed.
