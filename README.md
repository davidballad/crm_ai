# CRM AI

Multi-tenant SaaS CRM with AI-powered business insights, built for small businesses (restaurants, retail, bars).

## Architecture

- **Frontend**: React + Vite SPA deployed to S3 + CloudFront
- **Auth**: AWS Cognito (User Pools + JWT)
- **API**: API Gateway (HTTP API) + Lambda (Python 3.12)
- **Database**: DynamoDB (single-table design, on-demand capacity)
- **AI**: Amazon Bedrock (Claude Haiku)
- **Payments**: Square (in-store card readers + online Web Payments SDK)
- **IaC**: Terraform
- **Storage**: S3 (receipts, exports, static assets)
- **Secrets**: AWS Secrets Manager (Square credentials)

See [docs/architecture.md](docs/architecture.md) for detailed diagrams (system overview, request lifecycle, DynamoDB design, auth flow, AI pipeline) and [docs/api-reference.md](docs/api-reference.md) for the full API reference.

## Project Structure

```
crm-ai/
  infrastructure/          # Terraform modules
  backend/
    functions/             # Lambda functions (Python)
      inventory/           # Inventory CRUD
      transactions/        # Sale recording & summaries
      purchases/           # Purchase order management
      ai_insights/         # AI-powered business insights
      onboarding/          # Tenant & user provisioning
      users/               # Multi-user management (invite, roles)
      payments/            # Square payment processing + webhooks
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

### Prerequisites

- Python 3.12+
- Node.js 20+
- Terraform 1.5+
- AWS CLI configured with credentials

### Backend (Local Development)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Infrastructure

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
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

## License

Proprietary - All rights reserved.
