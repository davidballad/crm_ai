# CRM AI -- Deployment Guide & Next Steps

## Current State

The codebase is **complete for an MVP**. Everything is written, tested (46 passing tests), and ready to deploy:

- 5 Lambda functions (inventory, transactions, purchases, AI insights, onboarding)
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
5. **An AWS account** with permissions to create: DynamoDB, Cognito, API Gateway, Lambda, S3, CloudFront, IAM roles

---

## Step-by-Step Deployment

### Step 1: Request Bedrock Model Access

The AI insights feature uses Amazon Bedrock with Claude 3 Haiku. You need to request access first:

1. Go to the [AWS Console](https://console.aws.amazon.com/bedrock/)
2. Navigate to **Bedrock > Model access** (left sidebar)
3. Click **Manage model access**
4. Find **Anthropic > Claude 3 Haiku** and request access
5. Wait for approval (usually instant for Haiku)

Without this, everything else works -- only the `POST /insights/generate` endpoint will fail.

### Step 2: Deploy Infrastructure with Terraform

```bash
cd infrastructure
terraform init
terraform plan    # Review what will be created
terraform apply   # Type "yes" to confirm
```

This creates:
- DynamoDB table (single-table, on-demand billing)
- Cognito User Pool + SPA client
- API Gateway HTTP API with JWT authorizer
- 5 Lambda functions (with placeholder code)
- S3 buckets (frontend + data)
- CloudFront distribution

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

This zips each Lambda function with the `shared/` module and Python dependencies into `infrastructure/packages/`.

Then deploy the actual code to each Lambda:

```bash
# Get the name prefix from Terraform
cd infrastructure
NAME_PREFIX=$(terraform output -raw dynamodb_table_name | sed 's/-table$//')
cd ..

# Update each Lambda with real code
for func in inventory transactions purchases ai_insights onboarding; do
    aws lambda update-function-code \
        --function-name "${NAME_PREFIX}-${func}" \
        --zip-file "fileb://infrastructure/packages/${func}.zip"
done
```

Or use the full deploy script which does this automatically:

```bash
./scripts/deploy.sh apply
```

### Step 4: Configure and Deploy Frontend

Create the frontend `.env` file with values from Terraform outputs:

```bash
cd infrastructure
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
aws s3 sync dist/ s3://$(cd ../infrastructure && terraform output -raw frontend_bucket) --delete
```

Or use the script:

```bash
./scripts/deploy-frontend.sh
```

### Step 5: Test the Live System

**Create your first tenant:**

```bash
API_URL=$(cd infrastructure && terraform output -raw api_endpoint)

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
POOL_ID=$(cd infrastructure && terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(cd infrastructure && terraform output -raw cognito_client_id)

TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=you@email.com,PASSWORD=YourPassword123 \
  --query 'AuthenticationResult.IdToken' --output text)

# Now use the token
curl "$API_URL/inventory" -H "Authorization: Bearer $TOKEN"
```

Note: USER_PASSWORD_AUTH flow needs to be enabled in the Cognito client. The default config uses SRP auth which requires the frontend SDK. The easiest path is to just use the frontend.

---

## AI Service Decision: Why Bedrock InvokeModel (Not AgentCore)

### Current approach: Direct InvokeModel

The AI insights Lambda (`backend/functions/ai_insights/handler.py`) uses a simple pattern:

1. Gather business data from DynamoDB (products, transactions)
2. Build a structured prompt with the data
3. Call `bedrock.invoke_model()` with Claude Haiku
4. Parse the JSON response
5. Cache in DynamoDB with a 7-day TTL

This is the right choice for the MVP because:

- **Simple**: One API call, no orchestration framework needed
- **Cheap**: Claude Haiku is ~$0.25/M input tokens. Caching means one Bedrock call per tenant per day
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

| Customer Count | Monthly Cost | Notes |
| -------------- | ------------ | ----- |
| 0-50           | $5-25        | Mostly within free tier |
| 50-500         | $50-150      | DynamoDB + Lambda + Bedrock |
| 500+           | $200-500     | Still very manageable vs revenue |

**Free tier coverage (first 12 months):**
- Lambda: 1M requests/month
- API Gateway: 1M calls/month
- DynamoDB: 25GB storage + 25 RCU/WCU
- S3: 5GB storage
- Cognito: 50,000 MAU
- CloudFront: 1TB data transfer

**Biggest cost driver:** Bedrock calls. Mitigated by caching insights (one call per tenant per day).

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

### Future (Phase 2/3)

- **Stripe billing integration** -- Enforce free/starter/pro plan limits
- **Multi-user per tenant** -- Manager, cashier, viewer roles (Cognito groups)
- **Receipt generation** -- PDF via Lambda + S3
- **Mobile-responsive PWA** -- The React app is responsive but could be a PWA
- **n8n webhook integration** -- Webhook endpoints for automation workflows
- **Conversational AI** -- Chat interface where users ask questions about their business (AgentCore candidate)
