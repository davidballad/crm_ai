# =============================================================================
# API Gateway HTTP API
# =============================================================================

resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  description   = "CRM AI API Gateway"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
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

# -----------------------------------------------------------------------------
# Routes (with JWT authorizer except onboarding/tenant)
# -----------------------------------------------------------------------------

# Inventory routes
resource "aws_apigatewayv2_route" "inventory_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /inventory"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_create" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /inventory"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_get" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /inventory/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_update" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /inventory/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_delete" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "DELETE /inventory/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_import" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /inventory/import"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

resource "aws_apigatewayv2_route" "inventory_import_template" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /inventory/import/template"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.inventory.id}"
}

# Transactions routes
resource "aws_apigatewayv2_route" "transactions_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /transactions"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_create" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /transactions"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.transactions.id}"
}

resource "aws_apigatewayv2_route" "transactions_get" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /transactions/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.transactions.id}"
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

# Onboarding routes (POST /onboarding/tenant - no auth)
resource "aws_apigatewayv2_route" "onboarding_tenant" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /onboarding/tenant"
  target    = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
}

# Onboarding routes (POST /onboarding/setup - with auth)
resource "aws_apigatewayv2_route" "onboarding_setup" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /onboarding/setup"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.onboarding.id}"
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
  for_each = toset(["inventory", "transactions", "purchases", "ai_insights", "onboarding", "users"])

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
