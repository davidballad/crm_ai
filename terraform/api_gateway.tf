# =============================================================================
# API Gateway HTTP API
# =============================================================================

resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  description   = "Clienta AI API Gateway"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Service-Key", "X-Tenant-Id"]
  }

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Cognito JWT Authorizer
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# -----------------------------------------------------------------------------
# Lambda Integrations
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "inventory" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["inventory"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "transactions" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["transactions"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "purchases" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["purchases"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "ai_insights" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["ai_insights"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "onboarding" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["onboarding"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "users" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["users"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "payments" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.payments.invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "contacts" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["contacts"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "messages" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["messages"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "contact" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["contact"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "shop" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["shop"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "campaigns" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["campaigns"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "agents" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.services["agents"].invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

# -----------------------------------------------------------------------------
# Routes (with JWT authorizer except onboarding/tenant)
# -----------------------------------------------------------------------------

# Inventory routes (no API Gateway JWT — Lambda validates JWT or service key)
resource "aws_apigatewayv2_route" "inventory_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /inventory"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /inventory"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /inventory/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_update" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PUT /inventory/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /inventory/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_import" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /inventory/import"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_import_template" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /inventory/import/template"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_export" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /inventory/export"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_upload_image_url" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /inventory/upload-image-url"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_upload_image_urls" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /inventory/upload-image-urls"
  target    = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

# Contacts routes (no API Gateway JWT — Lambda validates JWT or service key)
resource "aws_apigatewayv2_route" "contacts_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /contacts"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_update" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PUT /contacts/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /contacts/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_patch" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PATCH /contacts/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_export" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts/export"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_stats" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts/stats"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_bulk_tag" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /contacts/bulk-tag"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_notes_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts/{id}/notes"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_notes_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /contacts/{id}/notes"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

resource "aws_apigatewayv2_route" "contacts_notes_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /contacts/{id}/notes/{note_id}"
  target    = "integrations/${aws_apigatewayv2_integration.contacts.id}"
}

# Conversation history for a contact
resource "aws_apigatewayv2_route" "contacts_messages" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /contacts/{id}/messages"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

# Transactions routes (no API Gateway JWT — Lambda validates JWT or service key)
resource "aws_apigatewayv2_route" "transactions_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /transactions"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /transactions"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /transactions/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_patch" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PATCH /transactions/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /transactions/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_payment_proof" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /transactions/payment-proof"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_revenue" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /transactions/revenue"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_summary" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /transactions/summary"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

# Cart routes (WhatsApp order flow; same transactions Lambda)
resource "aws_apigatewayv2_route" "cart_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /cart"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "cart_add_item" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /cart/items"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "cart_checkout" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /cart/checkout"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "cart_clear" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /cart"
  target    = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

# Purchases routes
resource "aws_apigatewayv2_route" "purchases_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /purchases"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.purchases.id}"
}

resource "aws_apigatewayv2_route" "purchases_create" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /purchases"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.purchases.id}"
}

resource "aws_apigatewayv2_route" "purchases_get" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /purchases/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.purchases.id}"
}

resource "aws_apigatewayv2_route" "purchases_update" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /purchases/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.purchases.id}"
}

# AI Insights routes
resource "aws_apigatewayv2_route" "insights_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /insights"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.ai_insights.id}"
}

resource "aws_apigatewayv2_route" "insights_generate" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /insights/generate"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.ai_insights.id}"
}

# Users routes
resource "aws_apigatewayv2_route" "users_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /users"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
}

resource "aws_apigatewayv2_route" "users_invite" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /users"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
}

resource "aws_apigatewayv2_route" "users_get" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /users/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
}

resource "aws_apigatewayv2_route" "users_update" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /users/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
}

resource "aws_apigatewayv2_route" "users_delete" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "DELETE /users/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.users.id}"
}

# Payments routes (with auth)
resource "aws_apigatewayv2_route" "payments_create" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /payments"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

resource "aws_apigatewayv2_route" "payments_square_connect" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /payments/square/connect"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

resource "aws_apigatewayv2_route" "payments_square_status" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /payments/square/status"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

resource "aws_apigatewayv2_route" "payments_square_disconnect" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "DELETE /payments/square/disconnect"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

# Payments routes (no auth - called by Square)
resource "aws_apigatewayv2_route" "payments_square_callback" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /payments/square/callback"
  target    = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

resource "aws_apigatewayv2_route" "payments_webhook" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /payments/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.payments.id}"
}

# Messages routes (no API Gateway JWT — Lambda validates JWT or service key)
resource "aws_apigatewayv2_route" "messages_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /messages"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "conversations_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /conversations"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "conversations_messages" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /conversations/{phone}/messages"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "messages_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /messages"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "messages_send" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /messages/send"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "messages_mark_conversation" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /messages/mark-conversation"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "messages_mark_conversation_closed" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /messages/mark-conversation-closed"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

resource "aws_apigatewayv2_route" "messages_patch_flags" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PATCH /messages/{id}/flags"
  target    = "integrations/${aws_apigatewayv2_integration.messages.id}"
}

# Onboarding routes
resource "aws_apigatewayv2_route" "onboarding_tenant" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /onboarding/tenant"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_setup" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /onboarding/setup"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_config" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /onboarding/config"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_config_patch" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PATCH /onboarding/config"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_resolve_phone" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /onboarding/resolve-phone"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_resolve_ig" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /onboarding/resolve-ig"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_daily_summary" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /onboarding/daily-summary"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_tenant_ids" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /onboarding/tenant-ids"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

resource "aws_apigatewayv2_route" "onboarding_service_tenant" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /onboarding/service/tenant"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

# Campaigns routes
resource "aws_apigatewayv2_route" "campaigns_list" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /campaigns"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

resource "aws_apigatewayv2_route" "campaigns_create" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /campaigns"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

resource "aws_apigatewayv2_route" "campaigns_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /campaigns/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

resource "aws_apigatewayv2_route" "campaigns_patch" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PATCH /campaigns/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

resource "aws_apigatewayv2_route" "campaigns_delete" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /campaigns/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

resource "aws_apigatewayv2_route" "campaigns_send" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /campaigns/{id}/send"
  target    = "integrations/${aws_apigatewayv2_integration.campaigns.id}"
}

# AI Agents routes (JWT auth, Pro-gated inside Lambda)
resource "aws_apigatewayv2_route" "agents_run" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /agents/{agent_type}/run"
  target    = "integrations/${aws_apigatewayv2_integration.agents.id}"
}

resource "aws_apigatewayv2_route" "agents_history" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /agents/history"
  target    = "integrations/${aws_apigatewayv2_integration.agents.id}"
}

# Contact form (public, no auth)
resource "aws_apigatewayv2_route" "contact" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /contact"
  target    = "integrations/${aws_apigatewayv2_integration.contact.id}"
}

# Shop routes (public, token-verified inside Lambda)
resource "aws_apigatewayv2_route" "shop_token" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /shop/token"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_products" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /shop/products"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_cart_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /shop/cart"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_cart_post" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /shop/cart"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_checkout" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /shop/checkout"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_datafast_result" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /shop/datafast-result"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_meta" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /shop/meta"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

resource "aws_apigatewayv2_route" "shop_store_page" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /store/{tenant_id}"
  target    = "integrations/${aws_apigatewayv2_integration.shop.id}"
}

# -----------------------------------------------------------------------------
# API Gateway Stage (default)
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}

# -----------------------------------------------------------------------------
# Lambda Invoke Permissions
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "api_gateway" {
  for_each = toset(["inventory", "transactions", "purchases", "ai_insights", "onboarding", "users", "contacts", "messages", "contact", "shop", "campaigns", "agents"])

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.services[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "payments_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.payments.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
