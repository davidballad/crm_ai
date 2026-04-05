import boto3
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Helper to build PK
def build_pk(tenant_id: str) -> str:
    return f"TENANT#{tenant_id}"

def recalc_stats(tenant_id: str, days: int = 30):
    # Use environment variable if set, otherwise default
    table_name = os.environ.get("TABLE_NAME", "clienta-ai-prod-table")
    print(f"Using table: {table_name}")
    
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)
    
    pk = build_pk(tenant_id)
    
    # Range of dates to recalc
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=days)
    
    # Fetch all transactions for this tenant in the range
    # Since SK is TXN#YYYY-MM-DD#... we can query between
    sk_start = f"TXN#{start_date.isoformat()}"
    sk_end = f"TXN#{end_date.isoformat()}#ZZZ"
    
    print(f"Recalculating stats for {tenant_id} from {start_date} to {end_date}...")
    
    # Query transactions
    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("pk").eq(pk) & 
                               boto3.dynamodb.conditions.Key("sk").between(sk_start, sk_end)
    )
    transactions = response.get("Items", [])
    
    if not transactions:
        print("No transactions found in this range.")
        return

    # Group by date
    daily_stats = {}
    total_rev = Decimal("0")
    total_orders = 0
    total_items = 0
    
    for txn in transactions:
        created_at = txn.get("created_at")
        if not created_at:
            continue
        day = created_at[:10]
        
        rev = Decimal(str(txn.get("total", 0)))
        count = 1
        items_sold = 0
        items = txn.get("items", [])
        for item in items:
            q = item.get("quantity", 0)
            items_sold += int(q) if q is not None else 0
            
        if day not in daily_stats:
            daily_stats[day] = {"revenue": Decimal("0"), "order_count": 0, "items_sold": 0}
            
        daily_stats[day]["revenue"] += rev
        daily_stats[day]["order_count"] += count
        daily_stats[day]["items_sold"] += items_sold
        
        total_rev += rev
        total_orders += count
        total_items += items_sold

    # Update DynamoDB STATS items
    now = datetime.now(timezone.utc).isoformat()
    for day, stats in daily_stats.items():
        stats_sk = f"STATS#DAILY#{day}"
        print(f"Updating {stats_sk}: revenue={stats['revenue']}, orders={stats['order_count']}, items={stats['items_sold']}")
        table.update_item(
            Key={"pk": pk, "sk": stats_sk},
            UpdateExpression="SET revenue = :r, order_count = :o, items_sold = :i, updated_at = :now",
            ExpressionAttributeValues={
                ":r": stats["revenue"],
                ":o": stats["order_count"],
                ":i": stats["items_sold"],
                ":now": now
            }
        )
        
    # Update Totals item
    print(f"Updating STATS#TOTALS: total_revenue={total_rev}, orders={total_orders}")
    # Note: Using SET instead of ADD here because we calculated the ABSOLUTE total from the scan window.
    # In a real system you might want to be careful here if the window is not the full history.
    table.update_item(
        Key={"pk": pk, "sk": "STATS#TOTALS"},
        UpdateExpression="SET total_revenue = :r, order_count = :o, items_sold = :i, updated_at = :now",
        ExpressionAttributeValues={
            ":r": total_rev,
            ":o": total_orders,
            ":i": total_items,
            ":now": now
        }
    )
    
    print(f"Done! Successfully updated {len(daily_stats)} days of statistics.")

if __name__ == "__main__":
    # To run this, provide the tenant_id
    import sys
    if len(sys.argv) < 2:
        print("Usage: python recalc_stats.py <tenant_id>")
    else:
        recalc_stats(sys.argv[1])
