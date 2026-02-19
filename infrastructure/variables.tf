# =============================================================================
# Input Variables
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "crm-ai"
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
  default     = "crm-ai-table"
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for AI insights Lambda"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}
