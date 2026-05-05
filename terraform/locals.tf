# =============================================================================
# Locals
# =============================================================================

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  name_suffix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # Lambda functions deployed via for_each (all except payments)
  lambda_functions = {
    inventory = {
      memory_size = 256
      timeout     = 30
    }
    transactions = {
      memory_size = 256
      timeout     = 30
    }
    purchases = {
      memory_size = 256
      timeout     = 30
    }
    ai_insights = {
      memory_size = 256
      timeout     = 60
    }
    onboarding = {
      memory_size = 256
      timeout     = 30
    }
    users = {
      memory_size = 256
      timeout     = 30
    }
    contacts = {
      memory_size = 256
      timeout     = 30
    }
    messages = {
      memory_size = 256
      timeout     = 30
    }
    contact = {
      memory_size = 128
      timeout     = 10
    }
    shop = {
      memory_size = 256
      timeout     = 30
    }
    campaigns = {
      memory_size = 256
      timeout     = 30
    }
    agents = {
      memory_size = 512
      timeout     = 60
    }
    profits = {
      memory_size = 256
      timeout     = 30
    }
    suppliers = {
      memory_size = 256
      timeout     = 30
    }

  }

  packages_dir = "${path.module}/packages"
}
