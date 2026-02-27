# =============================================================================
# Input Variables
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "clienta-ai"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  type        = string
  default     = "clienta-ai-table"
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for AI insights Lambda"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

# -----------------------------------------------------------------------------
# Square Integration
# -----------------------------------------------------------------------------

variable "square_application_id" {
  description = "Square application ID"
  type        = string
  default     = ""
}

variable "square_environment" {
  description = "Square environment: sandbox or production"
  type        = string
  default     = "sandbox"
}

# -----------------------------------------------------------------------------
# WhatsApp Webhook (Meta Cloud API)
# -----------------------------------------------------------------------------

variable "webhook_secret" {
  description = "Meta app secret for X-Hub-Signature-256 validation (leave empty to skip)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "webhook_tenant_id" {
  description = "Fallback tenant_id when to_number is not in PHONE mapping (single-tenant)"
  type        = string
  default     = ""
}
