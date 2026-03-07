#!/usr/bin/env bash
set -euo pipefail

# Full deployment: Terraform + Lambda packages + frontend.
# Usage: ./scripts/deploy.sh [plan|apply]
#
# Pass "plan" to only run terraform plan (dry run).
# Default is "apply" which deploys everything.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infrastructure"
ACTION="${1:-apply}"

echo "============================================"
echo "  Clienta AI Full Deployment"
echo "  Action: $ACTION"
echo "============================================"
echo ""

# Step 1: Package Lambda functions
echo "[1/3] Packaging Lambda functions..."
"$SCRIPT_DIR/package-lambdas.sh"
echo ""

# Step 2: Terraform
echo "[2/3] Running Terraform $ACTION..."
cd "$INFRA_DIR"

terraform init -input=false

if [ "$ACTION" = "plan" ]; then
    terraform plan -input=false
    echo ""
    echo "Dry run complete. Run './scripts/deploy.sh apply' to deploy."
    exit 0
fi

terraform apply -input=false -auto-approve
echo ""

# Print key outputs
echo "Infrastructure outputs:"
echo "  API Endpoint:    $(terraform output -raw api_endpoint)"
echo "  Cognito Pool ID: $(terraform output -raw cognito_user_pool_id)"
echo "  Cognito Client:  $(terraform output -raw cognito_client_id)"
echo "  Frontend Bucket: $(terraform output -raw frontend_bucket)"
echo "  CloudFront URL:  $(terraform output -raw cloudfront_url)"
echo ""

# Step 3: Update Lambda function code
echo "[2.5/3] Deploying Lambda function code..."
PACKAGE_DIR="$INFRA_DIR/packages"
FUNCTIONS=("inventory" "transactions" "purchases" "ai_insights" "onboarding")
NAME_PREFIX=$(terraform output -raw dynamodb_table_name | sed 's/-table$//')

for func in "${FUNCTIONS[@]}"; do
    ZIP_PATH="$PACKAGE_DIR/${func}.zip"
    if [ -f "$ZIP_PATH" ]; then
        FUNC_NAME="${NAME_PREFIX}-${func}"
        echo "  Updating: $FUNC_NAME"
        aws lambda update-function-code \
            --function-name "$FUNC_NAME" \
            --zip-file "fileb://$ZIP_PATH" \
            --no-cli-pager > /dev/null 2>&1 || echo "    WARNING: Could not update $FUNC_NAME"
    fi
done
echo ""

# Step 4: Deploy frontend
echo "[3/3] Deploying frontend..."
"$SCRIPT_DIR/deploy-frontend.sh"
echo ""

echo "============================================"
echo "  Deployment complete!"
echo "  URL: $(cd "$INFRA_DIR" && terraform output -raw cloudfront_url)"
echo "============================================"
