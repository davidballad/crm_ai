# =============================================================================
# Terraform remote backend (prod): state in S3, lock via S3 (use_lockfile)
# Run from terraform/: terraform init -reconfigure -backend-config=config/prod/backend.tfvars
# Requires Terraform 1.8+ (S3-native locking; no DynamoDB table needed).
# =============================================================================

bucket         = "clienta-terraform-state-prod"
key            = "clienta-ai/prod/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
use_lockfile   = true
