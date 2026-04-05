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

# Frontend URLs for Cognito (callback + sign-out). Include both www and root for clientaai.com; localhost for local testing.
variable "cognito_callback_urls" {
  description = "Allowed callback URLs for Cognito app client (redirect after sign-in, etc.)"
  type        = list(string)
  default = [
    "https://www.clientaai.com",
    "https://www.clientaai.com/",
    "https://clientaai.com",
    "https://clientaai.com/",
    "http://localhost:5173",
    "http://localhost:5173/",
    "https://br.clientaai.com",
    "https://br.clientaai.com/",
  ]
}

variable "cognito_logout_urls" {
  description = "Allowed sign-out URLs for Cognito app client"
  type        = list(string)
  default = [
    "https://www.clientaai.com",
    "https://www.clientaai.com/",
    "https://clientaai.com",
    "https://clientaai.com/",
    "http://localhost:5173",
    "http://localhost:5173/",
    "https://br.clientaai.com",
    "https://br.clientaai.com/",
  ]
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  type        = string
  default     = "clienta-ai-dev-table"
}

# -----------------------------------------------------------------------------
# Gemini (Google AI Studio) - AI Insights
# -----------------------------------------------------------------------------
# Passed as Lambda env var only (no Secrets Manager) to avoid cost.

variable "gemini_api_key" {
  description = "Google AI Studio API key for Gemini (AI insights). Get one at https://aistudio.google.com/app/apikey. Pass via TF_VAR_gemini_api_key (never commit)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_model_id" {
  description = "Gemini model ID for AI insights (e.g. gemini-2.5-flash)"
  type        = string
  default     = "gemini-2.5-flash"
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
# n8n Service Integration
# -----------------------------------------------------------------------------

variable "service_api_key" {
  description = "Shared secret for n8n service-to-service auth (X-Service-Key header)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "n8n_campaign_webhook_url" {
  description = "n8n webhook URL for the Broadcast Campaign Executor workflow"
  type        = string
  default     = "https://n8n.clientaai.com/webhook/campaign-executor"
}

# -----------------------------------------------------------------------------
# Custom Domain (CloudFront + ACM)
# -----------------------------------------------------------------------------

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for the custom domain (must be in us-east-1)"
  type        = string
  default     = "arn:aws:acm:us-east-1:533590176318:certificate/b5920cfd-7efb-43df-8567-85d9119e2aa5"
}

# -----------------------------------------------------------------------------
# Contact form (landing page → SES email)
# -----------------------------------------------------------------------------

variable "contact_from_email" {
  description = "SES-verified sender address for contact form emails"
  type        = string
  default     = "info@clientaai.com"
}

variable "contact_recipient_email" {
  description = "Email address that receives contact form submissions"
  type        = string
  default     = "info@clientaai.com"
}
