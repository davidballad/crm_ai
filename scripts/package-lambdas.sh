#!/usr/bin/env bash
set -euo pipefail

# Package each Lambda function with the shared/ module into a deployment zip.
# Usage: ./scripts/package-lambdas.sh [output_dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
OUTPUT_DIR="${1:-$PROJECT_ROOT/infrastructure/packages}"

FUNCTIONS=("inventory" "transactions" "purchases" "ai_insights" "onboarding")

mkdir -p "$OUTPUT_DIR"

echo "Packaging Lambda functions..."
echo "  Backend dir: $BACKEND_DIR"
echo "  Output dir:  $OUTPUT_DIR"
echo ""

for func in "${FUNCTIONS[@]}"; do
    echo "  Packaging: $func"
    FUNC_DIR="$BACKEND_DIR/functions/$func"

    if [ ! -f "$FUNC_DIR/handler.py" ]; then
        echo "    WARNING: $FUNC_DIR/handler.py not found, skipping"
        continue
    fi

    WORK_DIR=$(mktemp -d)
    trap "rm -rf $WORK_DIR" EXIT

    # Copy function code
    cp "$FUNC_DIR/handler.py" "$WORK_DIR/"
    [ -f "$FUNC_DIR/__init__.py" ] && cp "$FUNC_DIR/__init__.py" "$WORK_DIR/"

    # Copy shared module
    mkdir -p "$WORK_DIR/shared"
    cp "$BACKEND_DIR/shared/"*.py "$WORK_DIR/shared/"

    # Install dependencies into the package (only non-boto3 deps since Lambda has boto3)
    if [ -f "$BACKEND_DIR/requirements-lambda.txt" ]; then
        pip install -r "$BACKEND_DIR/requirements-lambda.txt" -t "$WORK_DIR" --quiet --upgrade
    else
        pip install pydantic ulid-py python-dateutil -t "$WORK_DIR" --quiet --upgrade 2>/dev/null || true
    fi

    # Remove unnecessary files to reduce package size
    find "$WORK_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$WORK_DIR" -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$WORK_DIR" -name "*.egg-info" -type d -exec rm -rf {} + 2>/dev/null || true

    # Create zip
    ZIP_PATH="$OUTPUT_DIR/${func}.zip"
    (cd "$WORK_DIR" && zip -r "$ZIP_PATH" . -x "*.pyc" > /dev/null)

    SIZE=$(du -h "$ZIP_PATH" | cut -f1)
    echo "    -> $ZIP_PATH ($SIZE)"

    rm -rf "$WORK_DIR"
    trap - EXIT
done

echo ""
echo "All Lambda packages created in $OUTPUT_DIR"
echo "Update infrastructure/lambda.tf to reference these packages."
