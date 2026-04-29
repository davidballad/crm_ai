#!/usr/bin/env python3
"""
One-off migration: relink NUR Google user to original tenant.

What it does:
  1. Updates PHONE_NUMBER_ID DynamoDB mapping → original tenant
  2. Updates the Google Cognito user's custom:tenant_id → original tenant
  3. Marks the orphaned Google tenant as inactive in DynamoDB
"""
import os, sys
import boto3
from boto3.dynamodb.conditions import Key

ORIGINAL_TENANT_ID = "01KKN5SEMRW42M49FBP03TNPDZ"
GOOGLE_TENANT_ID   = "01KQ18DW7QG0R94FBPZSA1KYXN"
PHONE_NUMBER_ID_PK = "PHONE_NUMBER_ID"

TABLE_NAME   = os.environ["TABLE_NAME"]
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
GOOGLE_EMAIL = os.environ["GOOGLE_USER_EMAIL"]

dynamo  = boto3.resource("dynamodb").Table(TABLE_NAME)
cognito = boto3.client("cognito-idp")

# 1. Find Google Cognito user by email — pick the one whose tenant is the Google tenant
print(f"[1] Looking up Cognito users for: {GOOGLE_EMAIL}")
resp = cognito.list_users(UserPoolId=USER_POOL_ID, Filter=f'email = "{GOOGLE_EMAIL}"')
all_users = resp.get("Users", [])
print(f"    Found {len(all_users)} user(s): {[u['Username'] for u in all_users]}")

# list_users doesn't return custom attributes — use admin-get-user to verify
google_user = None
for u in all_users:
    detail = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=u["Username"])
    attrs = {a["Name"]: a["Value"] for a in detail.get("UserAttributes", [])}
    if attrs.get("custom:tenant_id") == GOOGLE_TENANT_ID:
        google_user = u
        break

if not google_user:
    sys.exit(f"ERROR: Could not find Cognito user with custom:tenant_id={GOOGLE_TENANT_ID}")

cognito_username = google_user["Username"]
print(f"    Target Cognito user: {cognito_username}")

# 2. Find the PHONE_NUMBER_ID mapping pointing to the Google tenant
print(f"[2] Scanning PHONE_NUMBER_ID mappings for Google tenant...")
result = dynamo.query(KeyConditionExpression=Key("pk").eq(PHONE_NUMBER_ID_PK))
phone_number_id = None
for item in result.get("Items", []):
    if item.get("tenant_id") == GOOGLE_TENANT_ID:
        phone_number_id = item["sk"]
        break

if not phone_number_id:
    sys.exit(f"ERROR: No PHONE_NUMBER_ID mapping found pointing to {GOOGLE_TENANT_ID}")
print(f"    phone_number_id: {phone_number_id}")

# 3. Repoint PHONE_NUMBER_ID mapping → original tenant
print(f"[3] Updating PHONE_NUMBER_ID mapping: {phone_number_id} → {ORIGINAL_TENANT_ID}")
dynamo.put_item(Item={
    "pk": PHONE_NUMBER_ID_PK,
    "sk": phone_number_id,
    "tenant_id": ORIGINAL_TENANT_ID,
})
print("    Done.")

# 4. Update Google Cognito user → original tenant
print(f"[4] Updating Cognito user {cognito_username} → tenant {ORIGINAL_TENANT_ID}")
cognito.admin_update_user_attributes(
    UserPoolId=USER_POOL_ID,
    Username=cognito_username,
    UserAttributes=[
        {"Name": "custom:tenant_id", "Value": ORIGINAL_TENANT_ID},
        {"Name": "custom:role",      "Value": "owner"},
    ],
)
print("    Done.")

# 5. Mark orphaned Google tenant as inactive
print(f"[5] Marking Google tenant {GOOGLE_TENANT_ID} as inactive...")
dynamo.update_item(
    Key={"pk": f"TENANT#{GOOGLE_TENANT_ID}", "sk": f"TENANT#{GOOGLE_TENANT_ID}"},
    UpdateExpression="SET #s = :s",
    ExpressionAttributeNames={"#s": "status"},
    ExpressionAttributeValues={":s": "inactive_merged"},
)
print("    Done.")

print()
print("Migration complete.")
print(f"  WhatsApp {phone_number_id} → {ORIGINAL_TENANT_ID}")
print(f"  Cognito {cognito_username}  → {ORIGINAL_TENANT_ID}")
