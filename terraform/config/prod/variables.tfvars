# =============================================================================
# Variable values for prod
# Run: terraform plan -var-file=config/prod/variables.tfvars
# =============================================================================

project_name = "clienta-ai"
environment  = "prod"
aws_region   = "us-east-1"

# Application DynamoDB table (used by Lambdas), not the state-lock table
dynamodb_table_name = "clienta-ai-prod-table"

# Square (override for production if needed)
square_environment = "production"

# service_api_key: pass via TF_VAR_service_api_key or -var (never commit)
