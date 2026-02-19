# =============================================================================
# Cognito User Pool
# =============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                 = false
    temporary_password_validity_days = 7
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                     = "custom:tenant_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false
  }

  schema {
    name                     = "custom:role"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-user-pool"
  })
}

# -----------------------------------------------------------------------------
# User Pool Client (SPA - React)
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${local.name_prefix}-spa-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  explicit_auth_flows                   = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  refresh_token_validity                = 30
  access_token_validity                = 60
  id_token_validity                    = 60

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}