#!/usr/bin/env python3
"""
One-time bootstrap: read all tenant IDs from DynamoDB and write them to
s3://DATA_BUCKET/tenant-registry/tenant-ids.json so GET /onboarding/tenant-ids works.

Requires: pip install boto3 (or use backend venv: cd backend && pip install -r requirements.txt)

AWS credentials: use `aws configure` or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
(never commit credentials to the repo).

Usage (Git Bash from repo root):
  cd terraform
  export TABLE_NAME=$(terraform output -raw dynamodb_table_name)
  export DATA_BUCKET=$(terraform output -raw data_bucket)
  python ../scripts/bootstrap-tenant-registry-s3.py

Or with inline env:
  TABLE_NAME=YourTable DATA_BUCKET=YourBucket python scripts/bootstrap-tenant-registry-s3.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

S3_KEY = "tenant-registry/tenant-ids.json"


def main() -> None:
    table_name = os.environ.get("TABLE_NAME")
    bucket = os.environ.get("DATA_BUCKET")
    if not table_name or not bucket:
        print("Set TABLE_NAME and DATA_BUCKET (e.g. from terraform output)", file=sys.stderr)
        sys.exit(1)

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    tenant_ids: list[str] = []
    scan_kw: dict = {"FilterExpression": Attr("pk").begins_with("TENANT#") & Attr("pk").eq(Attr("sk"))}
    while True:
        resp = table.scan(**scan_kw)
        for item in resp.get("Items", []):
            pk = item.get("pk") or ""
            if pk.startswith("TENANT#") and pk == item.get("sk"):
                tid = pk.replace("TENANT#", "", 1)
                if tid and tid not in tenant_ids:
                    tenant_ids.append(tid)
        if "LastEvaluatedKey" not in resp:
            break
        scan_kw["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    body = {
        "tenant_ids": tenant_ids,
        "updated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key=S3_KEY,
        Body=json.dumps(body),
        ContentType="application/json",
    )
    print(f"Wrote {len(tenant_ids)} tenant(s) to s3://{bucket}/{S3_KEY}")
    for tid in tenant_ids:
        print(f"  - {tid}")


if __name__ == "__main__":
    main()
