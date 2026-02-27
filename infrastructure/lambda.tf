# =============================================================================
# Lambda IAM Role & Policies
# =============================================================================

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-lambda-role"
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# -----------------------------------------------------------------------------
# DynamoDB Access
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:ConditionCheckItem"
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*"
    ]
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name   = "dynamodb-access"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_dynamodb.json
}

# -----------------------------------------------------------------------------
# Bedrock InvokeModel
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_bedrock" {
  statement {
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "lambda_bedrock" {
  name   = "bedrock-invoke"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_bedrock.json
}

# -----------------------------------------------------------------------------
# S3 Data Bucket
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_s3" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*"
    ]
  }
}

resource "aws_iam_role_policy" "lambda_s3" {
  name   = "s3-data-bucket"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_s3.json
}

# -----------------------------------------------------------------------------
# Cognito User Management
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_cognito" {
  statement {
    effect = "Allow"
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminUpdateUserAttributes"
    ]
    resources = [aws_cognito_user_pool.main.arn]
  }
}

resource "aws_iam_role_policy" "lambda_cognito" {
  name   = "cognito-admin"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_cognito.json
}

# =============================================================================
# Lambda Functions
# =============================================================================

# -----------------------------------------------------------------------------
# Placeholder Lambda Package (replace with actual deployment packages)
# -----------------------------------------------------------------------------

data "archive_file" "lambda_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_placeholder"
  output_path = "${path.module}/lambda_placeholder.zip"
}

locals {
  lambda_functions = {
    inventory = {
      memory_size = 256
      timeout    = 30
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
  }
}

# Payments Lambda needs Square-specific env vars, defined separately
resource "aws_lambda_function" "payments" {
  function_name = "${local.name_prefix}-payments"
  role          = aws_iam_role.lambda.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.12"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  memory_size = 256
  timeout     = 30

  environment {
    variables = {
      TABLE_NAME             = aws_dynamodb_table.main.name
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
      DATA_BUCKET            = aws_s3_bucket.data.id
      SQUARE_APPLICATION_ID  = var.square_application_id
      SQUARE_ENVIRONMENT     = var.square_environment
      SQUARE_SECRET_ARN      = aws_secretsmanager_secret.square.arn
      SQUARE_WEBHOOK_URL     = "${aws_apigatewayv2_api.main.api_endpoint}/payments/webhook"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-payments"
  })
}

resource "aws_lambda_function" "services" {
  for_each = local.lambda_functions

  function_name = "${local.name_prefix}-${each.key}"
  role          = aws_iam_role.lambda.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.12"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  memory_size = each.value.memory_size
  timeout     = each.value.timeout

  environment {
    variables = {
      TABLE_NAME           = aws_dynamodb_table.main.name
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      DATA_BUCKET          = aws_s3_bucket.data.id
      BEDROCK_MODEL_ID     = var.bedrock_model_id
      WEBHOOK_SECRET       = var.webhook_secret
      WEBHOOK_TENANT_ID    = var.webhook_tenant_id
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${each.key}"
  })
}
