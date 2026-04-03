import boto3
import os
import sys

def reset_database():
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        print("Error: TABLE_NAME environment variable not set.")
        sys.exit(1)

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    print(f"Scanning table {table_name} for reset...")
    
    items_to_delete = []
    preserved_count = 0
    
    # Selection criteria for preservation
    preserved_prefixes = {"TENANT#", "PRODUCT#"}

    last_evaluated_key = None
    while True:
        scan_params = {}
        if last_evaluated_key:
            scan_params["ExclusiveStartKey"] = last_evaluated_key
            
        response = table.scan(**scan_params)
        items = response.get("Items", [])
        
        for item in items:
            pk = item.get("pk", "")
            sk = item.get("sk", "")
            
            # Check if this item should be preserved
            should_preserve = any(sk.startswith(p) for p in preserved_prefixes)
            
            if should_preserve:
                preserved_count += 1
            else:
                items_to_delete.append({"pk": pk, "sk": sk})
        
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    print(f"Found {len(items_to_delete)} items to delete and {preserved_count} items to preserve.")
    
    if not items_to_delete:
        print("Nothing to delete. Reset complete.")
        return

    # Delete items in batches
    print("Starting deletion...")
    with table.batch_writer() as batch:
        for i, item in enumerate(items_to_delete):
            batch.delete_item(Key=item)
            if (i + 1) % 100 == 0:
                print(f"Deleted {i + 1}/{len(items_to_delete)} items...")

    print(f"Successfully deleted {len(items_to_delete)} items. Database reset complete.")

if __name__ == "__main__":
    reset_database()
