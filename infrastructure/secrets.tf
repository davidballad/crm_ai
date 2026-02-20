# =============================================================================
# Secrets Manager - Square Credentials
# =============================================================================

resource "aws_secretsmanager_secret" "square" {
  name        = "${local.name_prefix}-square-credentials"
  description = "Square API credentials (application secret + webhook signature key)"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-square-credentials"
  })
}

resource "aws_secretsmanager_secret_version" "square" {
  secret_id = aws_secretsmanager_secret.square.id
  secret_string = jsonencode({
    application_secret    = "REPLACE_WITH_SQUARE_APP_SECRET"
    webhook_signature_key = "REPLACE_WITH_SQUARE_WEBHOOK_KEY"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# IAM policy for Lambda to read Square secrets
data "aws_iam_policy_document" "lambda_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [aws_secretsmanager_secret.square.arn]
  }
}

resource "aws_iam_role_policy" "lambda_secrets" {
  name   = "secrets-read"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_secrets.json
}
