#!/usr/bin/env bash
set -euo pipefail

# Build the React frontend and deploy to S3 + invalidate CloudFront.
# Usage: ./scripts/deploy-frontend.sh
#
# Prerequisites:
#   - AWS CLI configured
#   - Terraform outputs available (or set env vars manually)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
INFRA_DIR="$PROJECT_ROOT/infrastructure"

# Get bucket and distribution from Terraform outputs (or env vars)
if [ -z "${FRONTEND_BUCKET:-}" ]; then
    echo "Reading Terraform outputs..."
    FRONTEND_BUCKET=$(cd "$INFRA_DIR" && terraform output -raw frontend_bucket 2>/dev/null || echo "")
    CLOUDFRONT_ID=$(cd "$INFRA_DIR" && terraform output -raw cloudfront_domain 2>/dev/null || echo "")
fi

if [ -z "$FRONTEND_BUCKET" ]; then
    echo "ERROR: Could not determine FRONTEND_BUCKET."
    echo "Either run 'terraform apply' first or set FRONTEND_BUCKET env var."
    exit 1
fi

# Get API URL and Cognito config for the .env file
API_URL="${VITE_API_URL:-$(cd "$INFRA_DIR" && terraform output -raw api_endpoint 2>/dev/null || echo "")}"
COGNITO_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-$(cd "$INFRA_DIR" && terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")}"
COGNITO_CLIENT_ID="${VITE_COGNITO_CLIENT_ID:-$(cd "$INFRA_DIR" && terraform output -raw cognito_client_id 2>/dev/null || echo "")}"

echo "Building frontend..."
echo "  API URL:        $API_URL"
echo "  Cognito Pool:   $COGNITO_POOL_ID"
echo "  Cognito Client: $COGNITO_CLIENT_ID"
echo "  S3 Bucket:      $FRONTEND_BUCKET"
echo ""

# Write .env for the build
cat > "$FRONTEND_DIR/.env" <<EOF
VITE_API_URL=$API_URL
VITE_COGNITO_USER_POOL_ID=$COGNITO_POOL_ID
VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
EOF

# Build
(cd "$FRONTEND_DIR" && npm ci --silent && npm run build)

# Sync to S3
echo ""
echo "Uploading to S3..."
aws s3 sync "$FRONTEND_DIR/dist" "s3://$FRONTEND_BUCKET" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html" \
    --exclude "*.json"

# Upload index.html and manifests with short cache
aws s3 cp "$FRONTEND_DIR/dist/index.html" "s3://$FRONTEND_BUCKET/index.html" \
    --cache-control "public, max-age=60"

# Invalidate CloudFront (if distribution ID is available)
if [ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]; then
    echo "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --paths "/*" > /dev/null
    echo "CloudFront invalidation started."
else
    echo "NOTE: Set CLOUDFRONT_DISTRIBUTION_ID to invalidate the CDN cache."
fi

echo ""
echo "Frontend deployed to s3://$FRONTEND_BUCKET"
