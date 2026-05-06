# Clienta AI

Multi-tenant SaaS CRM with AI-powered business insights, built for small businesses (restaurants, retail, bars).

## Architecture

- **Frontend**: React + Vite SPA deployed to S3 + CloudFront
- **Auth**: AWS Cognito (User Pools + JWT)
- **API**: API Gateway (HTTP API) + Lambda (Python 3.12)
- **Database**: DynamoDB (single-table design, on-demand capacity)
- **AI**: Google Gemini 2.5 Flash (AI Studio, free tier)
- **Payments**: Square (in-store card readers + online Web Payments SDK)
- **IaC**: Terraform
- **Storage**: S3 (receipts, exports, static assets)
- **Secrets**: AWS Secrets Manager (Square credentials)

See [docs/architecture.md](docs/architecture.md) for detailed diagrams (system overview, request lifecycle, DynamoDB design, auth flow, AI pipeline) and [docs/api-reference.md](docs/api-reference.md) for the full API reference.

## Project Structure

```
clienta-ai/
  terraform/               # Terraform (config in terraform/config/prod/)
  backend/
    functions/             # Lambda functions (Python)
      inventory/           # Inventory CRUD + CSV import/export
      transactions/        # Sale recording & summaries
      purchases/           # Purchase order management (draft → sent → received)
      suppliers/           # Supplier management
      profits/             # Profit analytics & margin reporting
      ai_insights/         # AI-powered business insights (Gemini)
      onboarding/          # Tenant & user provisioning
      users/               # Multi-user management (invite, roles)
      payments/            # Square payment processing + webhooks
      contacts/            # CRM Contacts & Leads management
      contact/             # Public landing page contact form (SES)
      agents/              # AI Social Media Campaign kit generation
      shop/                # Public WhatsApp-token storefront logic
      campaigns/           # Broadcast campaign management
      messages/            # WhatsApp chat history & thread management
    shared/                # Shared utilities (db, auth, responses, models)
    tests/                 # Backend tests
  frontend/
    src/
      components/          # Reusable React components
      pages/               # Route-level pages
      hooks/               # Custom React hooks
      api/                 # API client layer
  docs/                    # Architecture docs
```

## Getting Started

See [docs/deployment-guide.md](docs/deployment-guide.md) for prerequisites and full deployment walkthrough. Quick local dev:

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && pytest

# Frontend
cd frontend && npm install && npm run dev

# Infrastructure — see terraform/config/README.md for detailed commands
cd terraform && terraform init -reconfigure -backend-config=config/prod/backend.tfvars
```

## Deployment

```bash
# Build Lambda layer (must use Docker — local pip produces Mac binaries that crash on Lambda Linux)
make layer-docker

# Package all Lambda functions
make package

# Or do both in one command
make build

# Deploy infrastructure + Lambdas
cd terraform && terraform apply -var-file=config/prod/variables.tfvars -var-file=config/prod/secrets.tfvars

# Deploy frontend
./scripts/deploy-frontend.sh
```

## Data Model (DynamoDB Single-Table)

| Entity            | PK                | SK                          | GSI1PK                          |
| ----------------- | ----------------- | --------------------------- | ------------------------------- |
| Tenant            | `TENANT#<id>`     | `TENANT#<id>`               | --                              |
| Product           | `TENANT#<id>`     | `PRODUCT#<id>`              | `TENANT#<id>`                   |
| Supplier          | `TENANT#<id>`     | `SUPPLIER#<id>`             | --                              |
| Purchase Order    | `TENANT#<id>`     | `PO#<id>`                   | --                              |
| Transaction       | `TENANT#<id>`     | `TXN#<timestamp>#<id>`      | --                              |
| AI Insight        | `TENANT#<id>`     | `INSIGHT#<date>`            | --                              |
| User              | `TENANT#<id>`     | `USER#<id>`                 | --                              |
| Payment           | `TENANT#<id>`     | `PAYMENT#<id>`              | `SQUARE_PAYMENT#<sq_id>`        |
| Square Connection | `TENANT#<id>`     | `SQUARE#<id>`               | `SQUARE_MERCHANT#<merchant_id>` |
| Contact / Lead    | `TENANT#<id>`     | `CONTACT#<id>`              | --                              |
| WhatsApp Message  | `TENANT#<id>`     | `MESSAGE#<id>`              | --                              |
| Conv. Summary     | `TENANT#<id>`     | `CONVO#<phone>`             | --                              |
| AI Campaign       | `TENANT#<id>`     | `AI_CAMPAIGN#<id>`          | --                              |
| Shop Cart         | `TENANT#<id>`     | `CART#<phone>`              | --                              |

## License

Proprietary - All rights reserved.
