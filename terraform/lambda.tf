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

# -----------------------------------------------------------------------------
# SES (contact form)
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_ses" {
  statement {
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "lambda_ses" {
  name   = "ses-send-email"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_ses.json
}

# =============================================================================
# Lambda Layer (shared dependencies — built by `make layer`)
# =============================================================================

resource "aws_lambda_layer_version" "deps" {
  layer_name          = "${local.name_prefix}-deps"
  filename            = "${local.packages_dir}/layer.zip"
  source_code_hash    = filebase64sha256("${local.packages_dir}/layer.zip")
  compatible_runtimes = ["python3.12"]
  description         = "Shared Python deps (pydantic, google-genai, ulid-py, etc.)"
}

# =============================================================================
# Lambda Packages (auto-zipped by Terraform — no `make package` needed)
# =============================================================================

data "archive_file" "lambda_packages" {
  for_each = local.lambda_functions

  type        = "zip"
  output_path = "${local.packages_dir}/${each.key}.zip"

  source {
    content  = file("${path.module}/../backend/functions/${each.key}/handler.py")
    filename = "handler.py"
  }

  dynamic "source" {
    for_each = fileset("${path.module}/../backend/shared", "*.py")
    content {
      content  = file("${path.module}/../backend/shared/${source.value}")
      filename = "shared/${source.value}"
    }
  }
}

data "archive_file" "payments_package" {
  type        = "zip"
  output_path = "${local.packages_dir}/payments.zip"

  source {
    content  = file("${path.module}/../backend/functions/payments/handler.py")
    filename = "handler.py"
  }

  dynamic "source" {
    for_each = fileset("${path.module}/../backend/shared", "*.py")
    content {
      content  = file("${path.module}/../backend/shared/${source.value}")
      filename = "shared/${source.value}"
    }
  }
}

# =============================================================================
# Lambda Functions
# =============================================================================

# Payments Lambda needs Square-specific env vars, defined separately
resource "aws_lambda_function" "payments" {
  function_name = "${local.name_prefix}-payments"
  role          = aws_iam_role.lambda.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.12"

  filename         = data.archive_file.payments_package.output_path
  source_code_hash = data.archive_file.payments_package.output_base64sha256
  layers           = [aws_lambda_layer_version.deps.arn]

  memory_size = 256
  timeout     = 30

  environment {
    variables = {
      TABLE_NAME            = aws_dynamodb_table.main.name
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.main.id
      DATA_BUCKET           = aws_s3_bucket.data.id
      SQUARE_APPLICATION_ID = var.square_application_id
      SQUARE_ENVIRONMENT    = var.square_environment
      # SQUARE_SECRET_ARN   = aws_secretsmanager_secret.square.arn  # enable if you uncomment secrets.tf
      SQUARE_WEBHOOK_URL = "${aws_apigatewayv2_api.main.api_endpoint}/payments/webhook"
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

  filename         = data.archive_file.lambda_packages[each.key].output_path
  source_code_hash = data.archive_file.lambda_packages[each.key].output_base64sha256
  layers           = [aws_lambda_layer_version.deps.arn]

  memory_size = each.value.memory_size
  timeout     = each.value.timeout

  environment {
    variables = {
      TABLE_NAME               = aws_dynamodb_table.main.name
      COGNITO_USER_POOL_ID     = aws_cognito_user_pool.main.id
      DATA_BUCKET              = aws_s3_bucket.data.id
      GEMINI_API_KEY              = var.gemini_api_key
      GEMINI_MODEL_ID             = var.gemini_model_id
      SERVICE_API_KEY             = var.service_api_key
      CONTACT_FROM_EMAIL          = var.contact_from_email
      CONTACT_RECIPIENT_EMAIL     = var.contact_recipient_email
      N8N_CAMPAIGN_WEBHOOK_URL    = var.n8n_campaign_webhook_url
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${each.key}"
  })
}
