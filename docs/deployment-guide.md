# Clienta AI — Deployment Guide & Next Steps

## Current State

The codebase is **complete for an MVP**. Everything is written, tested (46 passing tests), and ready to deploy:

- 8 Lambda functions (inventory, transactions, purchases, AI insights, onboarding, users, payments)
- Shared backend utilities (DB access, auth middleware, Pydantic models)
- Terraform infrastructure (DynamoDB, Cognito, API Gateway, Lambda, S3, CloudFront)
- React frontend (auth, dashboard, inventory, transactions, AI insights)
- Deploy scripts (`scripts/deploy.sh`, `scripts/package-lambdas.sh`, `scripts/deploy-frontend.sh`)
- Architecture docs and API reference

**Nothing has been deployed to AWS yet.** The steps below walk through getting it live.

---

## Prerequisites

Before deploying, make sure you have:

1. **AWS CLI** installed and configured with credentials (`aws configure`)
2. **Terraform 1.5+** installed
3. **Python 3.12+** (for Lambda packaging -- the code targets Python 3.12 runtime)
4. **Node.js 20+** (for frontend build)
5. **An AWS account** with permissions to create: DynamoDB, Cognito, API Gateway, Lambda, S3, CloudFront, Secrets Manager, IAM roles
6. **Square Developer Account** (optional, for payment processing) -- sign up at [developer.squareup.com](https://developer.squareup.com)

---

## Step-by-Step Deployment

### Step 1: Get a Gemini API Key (for AI insights)

The AI insights feature uses **Google Gemini 2.5 Flash** (free tier in Google AI Studio):

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create or sign in with your Google account
3. Click **Create API key** and copy the key
4. Pass it to Terraform when applying (see [terraform/config/README.md](terraform/config/README.md)):  
   `TF_VAR_gemini_api_key=your-key` or set in Lambda environment after deploy

Without this, everything else works — only `POST /insights/generate` will return 503 until the key is set.

### Step 2: Deploy Infrastructure with Terraform

```bash
cd terraform
terraform init -reconfigure -backend-config=config/prod/backend.tfvars
terraform plan -var-file=config/prod/variables.tfvars    # Review what will be created
terraform apply -var-file=config/prod/variables.tfvars -var-file=config/prod/secrets.tfvars   # Type "yes" to confirm
```

This creates:
- DynamoDB table (single-table, on-demand billing)
- Cognito User Pool + SPA client
- API Gateway HTTP API with JWT authorizer
- 8 Lambda functions (with placeholder code)
- S3 buckets (frontend + data)
- CloudFront distribution
- Secrets Manager secret (Square credentials placeholder)

**Save the outputs** -- you'll need them:

```bash
terraform output
```

Key outputs: `api_endpoint`, `cognito_user_pool_id`, `cognito_client_id`, `frontend_bucket`, `cloudfront_url`

### Step 3: Package and Deploy Lambda Functions

```bash
cd ..
./scripts/package-lambdas.sh
```

This zips each Lambda function with the `shared/` module and Python dependencies into `terraform/packages/`.

Then deploy the actual code to each Lambda:

```bash
# Get the name prefix from Terraform
cd terraform
NAME_PREFIX=$(terraform output -raw dynamodb_table_name | sed 's/-table$//')
cd ..

# Update each Lambda with real code
for func in inventory transactions purchases ai_insights onboarding users payments; do
    aws lambda update-function-code \
        --function-name "${NAME_PREFIX}-${func}" \
        --zip-file "fileb://terraform/packages/${func}.zip"
done
```

Or use the full deploy script which does this automatically:

```bash
./scripts/deploy.sh apply
```

**Building the Lambda layer on Windows:** The layer includes `cryptography` (for JWT verification). That package has platform-specific binaries, so building with `make layer` on Windows produces a layer that fails on Lambda with `cannot import name 'exceptions' from 'cryptography.hazmat.bindings._rust'`. Build the layer inside Docker so it uses Linux binaries:

```bash
make layer-docker
```

Then run `terraform apply` (or your deploy script) as usual. Requires Docker to be installed and running.

### Step 4: Configure and Deploy Frontend

Create the frontend `.env` file with values from Terraform outputs:

```bash
cd terraform
cat > ../frontend/.env <<EOF
VITE_API_URL=$(terraform output -raw api_endpoint)
VITE_COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
EOF
cd ..
```

Build and deploy:

```bash
cd frontend
npm ci
npm run build
aws s3 sync dist/ s3://$(cd ../terraform && terraform output -raw frontend_bucket) --delete
```

Or use the script:

```bash
./scripts/deploy-frontend.sh
```

### Step 5: Test the Live System

**Create your first tenant:**

```bash
API_URL=$(cd terraform && terraform output -raw api_endpoint)

curl -X POST "$API_URL/onboarding/tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "My Restaurant",
    "business_type": "restaurant",
    "owner_email": "you@email.com",
    "owner_password": "YourPassword123"
  }'
```

**Sign in via the frontend:**

Open the CloudFront URL from `terraform output -raw cloudfront_url` in your browser and sign in with the email/password you just created.

**Or test the API directly:**

To get a JWT token for API testing, you can use the AWS CLI:

```bash
POOL_ID=$(cd terraform && terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(cd terraform && terraform output -raw cognito_client_id)

TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=you@email.com,PASSWORD=YourPassword123 \
  --query 'AuthenticationResult.IdToken' --output text)

# Now use the token
curl "$API_URL/inventory" -H "Authorization: Bearer $TOKEN"
```

Note: USER_PASSWORD_AUTH flow needs to be enabled in the Cognito client. The default config uses SRP auth which requires the frontend SDK. The easiest path is to just use the frontend.

### Fix: Signup fails — "custom:tenant_id / custom:role do not exist in the schema"

If signup returns **Attributes did not conform to the schema: custom:tenant_id / custom:role**, the Cognito user pool was created **before** those custom attributes were in Terraform. You can fix it **without replacing the pool** by adding the attributes via the AWS API:

```bash
# Get your user pool ID (from Terraform)
POOL_ID=$(cd terraform && terraform output -raw cognito_user_pool_id)

# Add the two custom attributes (run once; use your Terraform region if not us-east-1)
aws cognito-idp add-custom-attributes --user-pool-id "$POOL_ID" --region us-east-1 \
  --custom-attributes Name=tenant_id,AttributeDataType=String,Mutable=true,Required=false,StringAttributeConstraints="{MinLength=1,MaxLength=128}"

aws cognito-idp add-custom-attributes --user-pool-id "$POOL_ID" --region us-east-1 \
  --custom-attributes Name=role,AttributeDataType=String,Mutable=true,Required=false,StringAttributeConstraints="{MinLength=1,MaxLength=32}"
```

If you see "One or more attributes already exist", the pool already has them (e.g. after a replace). Otherwise, retry signup; no Terraform apply or frontend redeploy needed.

### Step 6: Set Up Square Payment Processing

Square integration is **optional** -- the system works without it (transactions are recorded manually). When you're ready to accept card payments:

**6a. Create a Square Developer Account**

1. Go to [developer.squareup.com](https://developer.squareup.com) and sign up
2. Create a new application (e.g., "Clienta AI Payments")
3. Note down your **Application ID** and **Application Secret**

**6b. Configure Terraform Variables**

Add your Square Application ID to Terraform:

```bash
cd terraform
terraform apply -var-file=config/prod/variables.tfvars -var="square_application_id=YOUR_APP_ID" -var="square_environment=sandbox"
```

Use `sandbox` for testing, switch to `production` when ready for real charges.

**6c. Store Secrets in AWS Secrets Manager**

After `terraform apply`, update the placeholder secret with your real credentials:

```bash
aws secretsmanager put-secret-value \
  --secret-id "clienta-ai-dev-square-credentials" \
  --secret-string '{
    "application_secret": "YOUR_SQUARE_APP_SECRET",
    "webhook_signature_key": "YOUR_WEBHOOK_SIGNATURE_KEY"
  }'
```

> **Important:** Never put the application secret in Terraform variables or `.env` files. It belongs in Secrets Manager only.

**6d. Register Square Webhook**

In the Square Developer Dashboard:

1. Go to your application > **Webhooks**
2. Add a new webhook subscription
3. Set the URL to: `<your_api_endpoint>/payments/webhook`
4. Subscribe to these events:
   - `payment.completed`
   - `payment.updated`
   - `refund.created`
   - `refund.updated`
5. Copy the **Signature Key** and update Secrets Manager (step 6c)

**6e. Connect a Tenant's Square Account**

Each tenant connects their own Square merchant account via OAuth:

1. Tenant owner calls `GET /payments/square/connect` (returns an OAuth URL)
2. Owner clicks the URL, authorizes your app in Square
3. Square redirects back to `/payments/square/callback`
4. Access token is stored in DynamoDB, linked to the tenant

**6f. Test with Square Sandbox**

Square's sandbox provides test card numbers and a simulated card reader:

```bash
# Check connection status
curl "$API_URL/payments/square/status" -H "Authorization: Bearer $TOKEN"

# Create a test card payment (sandbox nonce)
curl -X POST "$API_URL/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_id": "cnon:card-nonce-ok",
    "amount": "25.00",
    "currency": "USD",
    "items": [{"product_id":"PROD_ID","product_name":"Chicken Breast","quantity":2,"unit_price":"12.50"}]
  }'

# Record a cash payment (no Square API call)
curl -X POST "$API_URL/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": "cash",
    "amount": "15.00",
    "items": [{"product_id":"PROD_ID","product_name":"Rice","quantity":5,"unit_price":"3.00"}]
  }'
```

The sandbox nonce `cnon:card-nonce-ok` always succeeds. Use `cnon:card-nonce-declined` to test failures. See [Square Sandbox Testing](https://developer.squareup.com/docs/testing/sandbox) for all test values.

---

## AI Service Decision: Why Bedrock InvokeModel (Not AgentCore)

### Current approach: Direct InvokeModel

The AI insights Lambda (`backend/functions/ai_insights/handler.py`) uses a simple pattern:

1. Gather business data from DynamoDB (products, transactions)
2. Build a structured prompt with the data
3. Call the **Gemini API** (Google AI Studio) with Gemini 2.5 Flash
4. Parse the JSON response
5. Cache in DynamoDB with a 7-day TTL

This is the right choice for the MVP because:

- **Simple**: One API call, no orchestration framework needed
- **Cost-friendly**: Gemini 2.5 Flash has a free tier in AI Studio. Caching means one API call per tenant per day
- **Fast**: Single request/response, no multi-step agent reasoning
- **Predictable**: You control the exact prompt and output format

### Amazon Bedrock AgentCore

AgentCore is a newer platform for building **agentic AI** -- where the AI autonomously reasons, calls tools, browses the web, and maintains memory across sessions. It includes Runtime, Memory, Gateway (MCP), Identity, Code Interpreter, Browser, and Observability.

**Skip it for now.** Your use case is a single-turn structured query, not an autonomous agent. AgentCore adds complexity and cost for capabilities you don't need yet.

**Consider AgentCore later (Phase 2/3) for:**

- A conversational AI chat feature ("ask your business a question")
- An agent that autonomously browses supplier websites to compare prices
- Multi-step workflows ("analyze sales, check inventory, draft POs, email suppliers")
- Cross-session memory ("remember what I asked last week")

---

## Estimated AWS Costs

See [architecture.md — Cost Architecture](architecture.md#cost-architecture) for detailed breakdown and free tier diagram.

At 0–50 tenants with light use, expect ~$5–25/month (free tier covers most services). The biggest cost driver is AI calls, mitigated by caching insights per tenant per day.

### Avoid Extra Cost from Logs

Lambda creates log groups automatically and keeps logs indefinitely. Set a short retention to avoid CloudWatch Logs storage creep:

```hcl
resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = merge(local.lambda_functions, { payments = {} })
  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days  = 14
}
```

Alternatively, set retention in the AWS Console after first deploy.

---

## What's Left for Production

These are not blockers for deploying and testing, but should be addressed before real customers use it:

### High Priority

- **Structured logging** -- Add Python `logging` with JSON format to all Lambda handlers for CloudWatch
- **CloudWatch alarms** -- Alert on Lambda errors, API Gateway 5xx rates, DynamoDB throttling
- **CORS lockdown** -- Replace `allow_origins: ["*"]` with your actual CloudFront domain
- **Custom domain** -- Set up Route 53 + ACM certificate for a real domain (e.g., `app.yourproduct.com`)

### Medium Priority

- **Rate limiting per tenant** -- Prevent free tier abuse (API Gateway throttling + DynamoDB usage tracking)
- **Input sanitization** -- Add size limits on request bodies, sanitize string inputs
- **Backup strategy** -- Enable DynamoDB point-in-time recovery (already in Terraform) + periodic exports
- **CI/CD pipeline** -- GitHub Actions to run tests, package Lambdas, and deploy on merge to main

### Completed (since MVP)

- **Multi-user per tenant** -- Owner, manager, staff roles with invite flow, role hierarchy enforcement, and deactivation (Cognito + DynamoDB)
- **Square payment integration** -- OAuth connect, in-store card payments (Square Terminal/Reader), online card payments (Web Payments SDK), cash recording, webhook processing for payment status updates

### Future (Phase 2/3)

- **Subscription billing** -- Enforce free/starter/pro plan limits (Stripe or Square Subscriptions)
- **Custom domain** -- Route 53 + ACM certificate for `app.yourproduct.com`
- **Receipt generation** -- PDF via Lambda + S3
- **Mobile-responsive PWA** -- The React app is responsive but could be a PWA
- **n8n webhook integration** -- Webhook endpoints for automation workflows
- **Conversational AI** -- Chat interface where users ask questions about their business (AgentCore candidate)
