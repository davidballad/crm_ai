# =============================================================================
# Outputs
# =============================================================================

output "api_endpoint" {
  description = "API Gateway HTTP API endpoint URL"
  value       = "${aws_apigatewayv2_api.main.api_endpoint}"
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID (for SPA)"
  value       = aws_cognito_user_pool_client.spa.id
}

output "frontend_bucket" {
  description = "S3 bucket name for frontend static hosting"
  value       = aws_s3_bucket.frontend.id
}

output "data_bucket" {
  description = "S3 bucket name for receipts and exports"
  value       = aws_s3_bucket.data.id
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_url" {
  description = "CloudFront distribution URL (https)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.main.name
}

output "cognito_hosted_ui_domain" {
  description = "Cognito hosted UI base URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "google_oauth_redirect_uri" {
  description = "Redirect URI to paste into Google Cloud Console OAuth credentials"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
}
