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

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.main.name
}
