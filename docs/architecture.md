# CRM AI -- Architecture

## System Overview

```mermaid
graph TB
  subgraph client [Client]
    Browser["React SPA"]
  end

  subgraph cdn [CDN]
    CloudFront["CloudFront"]
  end

  subgraph auth [Authentication]
    Cognito["Cognito User Pool"]
  end

  subgraph api [API Layer]
    APIGW["API Gateway HTTP API"]
    JWTAuth["JWT Authorizer"]
  end

  subgraph compute [Compute -- Lambda Functions]
    Inventory["Inventory Service"]
    Transactions["Transaction Service"]
    Purchases["Purchases Service"]
    AIInsights["AI Insights Service"]
    Onboarding["Onboarding Service"]
  end

  subgraph data [Data Layer]
    DynamoDB["DynamoDB Single Table"]
    S3Data["S3 Data Bucket"]
  end

  subgraph ai [AI]
    Bedrock["Amazon Bedrock\nClaude Haiku"]
  end

  subgraph hosting [Static Hosting]
    S3Frontend["S3 Frontend Bucket"]
  end

  Browser -->|HTTPS| CloudFront
  CloudFront -->|Origin| S3Frontend
  Browser -->|"API calls + JWT"| APIGW
  APIGW --> JWTAuth
  JWTAuth -->|Validate| Cognito
  APIGW --> Inventory
  APIGW --> Transactions
  APIGW --> Purchases
  APIGW --> AIInsights
  APIGW --> Onboarding
  Inventory --> DynamoDB
  Transactions --> DynamoDB
  Purchases --> DynamoDB
  AIInsights --> DynamoDB
  AIInsights --> Bedrock
  Onboarding --> DynamoDB
  Onboarding --> Cognito
  Transactions --> S3Data
```

All services run as Lambda functions (Python 3.12) behind a single API Gateway HTTP API. Data is stored in a single DynamoDB table using a multi-tenant single-table design. The React SPA is served from S3 via CloudFront.

---

## Request Lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant CF as CloudFront
  participant AG as API Gateway
  participant C as Cognito
  participant L as Lambda
  participant DB as DynamoDB

  B->>CF: GET /index.html
  CF->>B: React SPA

  Note over B: User signs in
  B->>C: SRP Auth (email + password)
  C->>B: JWT (id_token, access_token, refresh_token)

  Note over B: API Request
  B->>AG: GET /inventory (Authorization: Bearer <JWT>)
  AG->>C: Validate JWT signature + expiry
  C-->>AG: Claims (sub, email, custom:tenant_id, custom:role)
  AG->>L: Invoke Lambda with event (claims injected)
  L->>L: @require_auth extracts tenant_id from claims
  L->>DB: Query(pk=TENANT#<tid>, sk begins_with PRODUCT#)
  DB-->>L: Items[]
  L-->>AG: 200 {products: [...]}
  AG-->>B: JSON response
```

Key points:
- API Gateway validates the JWT before the Lambda is even invoked
- The `@require_auth` decorator extracts `custom:tenant_id` from the JWT claims and injects it into the event
- All DynamoDB queries are scoped to the tenant's partition key, ensuring data isolation

---

## DynamoDB Single-Table Design

All entities share one table. The partition key (`pk`) is always `TENANT#<tenant_id>`, ensuring all of a tenant's data is co-located for efficient queries.

```mermaid
erDiagram
  TABLE {
    string pk "TENANT#<tenant_id>"
    string sk "Entity-specific sort key"
    string gsi1pk "Optional GSI1 partition"
    string gsi1sk "Optional GSI1 sort"
    number ttl "TTL epoch (optional)"
  }
```

### Access Patterns

| Access Pattern                  | PK                | SK / Key Condition              | Index    |
| ------------------------------- | ----------------- | ------------------------------- | -------- |
| Get tenant                      | `TENANT#<tid>`    | `TENANT#<tid>`                  | Table    |
| List all products               | `TENANT#<tid>`    | `begins_with(PRODUCT#)`         | Table    |
| Get one product                 | `TENANT#<tid>`    | `PRODUCT#<pid>`                 | Table    |
| Products by category            | `TENANT#<tid>`    | `CATEGORY#<cat>`                | GSI1     |
| List suppliers                  | `TENANT#<tid>`    | `begins_with(SUPPLIER#)`        | Table    |
| List purchase orders            | `TENANT#<tid>`    | `begins_with(PO#)`              | Table    |
| List transactions (newest first)| `TENANT#<tid>`    | `begins_with(TXN#)` desc       | Table    |
| Transactions by date range      | `TENANT#<tid>`    | `between(TXN#<start>, TXN#<end>)` | Table |
| Get daily AI insight            | `TENANT#<tid>`    | `INSIGHT#<YYYY-MM-DD>`          | Table    |
| Cross-entity query by SK        | --                | SK as partition key              | GSI2     |

### Entity Key Patterns

| Entity         | PK             | SK                          | GSI1PK         | GSI1SK              |
| -------------- | -------------- | --------------------------- | -------------- | ------------------- |
| Tenant         | `TENANT#<tid>` | `TENANT#<tid>`              | --             | --                  |
| Product        | `TENANT#<tid>` | `PRODUCT#<pid>`             | `TENANT#<tid>` | `CATEGORY#<cat>`    |
| Supplier       | `TENANT#<tid>` | `SUPPLIER#<sid>`            | --             | --                  |
| Purchase Order | `TENANT#<tid>` | `PO#<poid>`                 | --             | --                  |
| Transaction    | `TENANT#<tid>` | `TXN#<timestamp>#<txnid>`   | --             | --                  |
| AI Insight     | `TENANT#<tid>` | `INSIGHT#<YYYY-MM-DD>`      | --             | --                  |

Transactions use a composite SK with the ISO timestamp first, enabling efficient date-range queries and natural newest-first ordering with `ScanIndexForward=False`.

---

## Authentication Flow

### Signup (Tenant Onboarding)

```mermaid
sequenceDiagram
  participant B as Browser
  participant AG as API Gateway
  participant OB as Onboarding Lambda
  participant C as Cognito
  participant DB as DynamoDB

  B->>AG: POST /onboarding/tenant (no auth)
  AG->>OB: Invoke (no JWT required)
  OB->>C: AdminCreateUser(email, custom:tenant_id, custom:role=owner)
  C-->>OB: User created
  OB->>C: AdminSetUserPassword(permanent=true)
  C-->>OB: Password set
  OB->>DB: PutItem(TENANT#<tid>, TENANT#<tid>) -- tenant record
  DB-->>OB: OK
  OB-->>AG: 201 {tenant_id, message}
  AG-->>B: Tenant created

  Note over B: Auto sign-in after signup
  B->>C: InitiateAuth (SRP)
  C-->>B: JWT tokens

  B->>AG: POST /onboarding/setup (with JWT)
  AG->>OB: Invoke
  OB->>DB: Update tenant settings
  OB->>DB: PutItem x N (seed products by business type)
  OB-->>AG: 200 {message: "Setup complete"}
  AG-->>B: Workspace ready
```

### Sign In

```mermaid
sequenceDiagram
  participant B as Browser
  participant C as Cognito

  B->>C: InitiateAuth (USER_SRP_AUTH)
  C-->>B: Challenge
  B->>C: RespondToAuthChallenge (SRP proof)
  C-->>B: AuthResult (IdToken, AccessToken, RefreshToken)

  Note over B: IdToken contains custom:tenant_id and custom:role
  Note over B: Token stored in memory, attached to API requests
```

The frontend uses `amazon-cognito-identity-js` for SRP authentication. JWTs are stored in memory (not localStorage) and attached as `Authorization: Bearer <token>` on every API call.

---

## AI Insights Pipeline

```mermaid
sequenceDiagram
  participant B as Browser
  participant AG as API Gateway
  participant AI as AI Insights Lambda
  participant DB as DynamoDB
  participant BR as Bedrock (Claude Haiku)

  B->>AG: POST /insights/generate
  AG->>AI: Invoke

  Note over AI: Step 1 -- Gather data
  AI->>DB: Query all products (PRODUCT#)
  DB-->>AI: Products + inventory levels
  AI->>DB: Query transactions (TXN#, last 30 days)
  DB-->>AI: Transaction history

  Note over AI: Step 2 -- Build prompt
  AI->>AI: Calculate inventory value, low-stock count
  AI->>AI: Calculate revenue, top products, day-of-week trends
  AI->>AI: Construct structured prompt with business data

  Note over AI: Step 3 -- Call Bedrock
  AI->>BR: InvokeModel (Claude Haiku, max_tokens=2048)
  BR-->>AI: JSON response (summary, forecasts, reorder, trends, revenue)

  Note over AI: Step 4 -- Cache result
  AI->>DB: PutItem(INSIGHT#<today>, TTL=7 days)
  DB-->>AI: OK

  AI-->>AG: 201 {insight object}
  AG-->>B: AI insights

  Note over B: Subsequent GET /insights returns cached result
  B->>AG: GET /insights
  AG->>AI: Invoke
  AI->>DB: GetItem(INSIGHT#<today>)
  DB-->>AI: Cached insight
  AI-->>AG: 200 {insight}
  AG-->>B: Cached AI insights
```

Key design decisions:
- Insights are generated on-demand (not scheduled) to minimize Bedrock costs
- Results are cached in DynamoDB with a 7-day TTL for automatic cleanup
- The prompt includes structured business data (inventory stats, transaction summaries) for grounded analysis
- Claude Haiku is used for cost efficiency (~$0.25/M input tokens)

---

## Cost Architecture

```mermaid
graph LR
  subgraph free_tier [AWS Free Tier Coverage]
    Lambda["Lambda\n1M requests/mo"]
    APIGW["API Gateway\n1M calls/mo"]
    Dynamo["DynamoDB\n25GB + 25 RCU/WCU"]
    S3free["S3\n5GB storage"]
    CogFree["Cognito\n50K MAU"]
    CFfree["CloudFront\n1TB transfer"]
  end

  subgraph paid [Pay-per-use Only]
    BedrockCost["Bedrock\n~$0.003/1K tokens"]
  end

  free_tier --> paid
```

At 0-50 customers, estimated monthly cost is $5-25 (mostly Bedrock calls). Caching AI insights daily per tenant keeps Bedrock usage minimal.
