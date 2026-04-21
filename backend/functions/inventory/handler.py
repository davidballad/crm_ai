"""Inventory CRUD Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import unicodedata
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

# Add project root for local development; Lambda uses layer for shared
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import (
    batch_put_items,
    delete_item,
    get_item,
    get_table,
    put_item,
    query_items,
    update_item,
)
from shared.db import DynamoDBError
from shared.models import Product
from shared.response import (
    created,
    error,
    no_content,
    not_found,
    server_error,
    success,
)
from shared.utils import (
    build_pk,
    build_sk,
    generate_id,
    now_iso,
    parse_body,
)

PRODUCT_SK_PREFIX = "PRODUCT#"
GSI1_NAME = "GSI1"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100
SEARCH_SCAN_MAX = 500
AUTO_TAG_STOPWORDS = {
    "de",
    "del",
    "la",
    "las",
    "el",
    "los",
    "y",
    "con",
    "para",
    "por",
    "en",
    "a",
    "the",
    "and",
    "for",
    "with",
}


def _normalize_search_text(s: str) -> str:
    if not s:
        return ""
    raw = unicodedata.normalize("NFD", s)
    raw = "".join(c for c in raw if unicodedata.category(c) != "Mn")
    return raw.lower()


def _search_tokens(q: str) -> list[str]:
    raw = _normalize_search_text(q)
    return [t for t in re.split(r"[^\w]+", raw, flags=re.UNICODE) if len(t) >= 2]


def _sanitize_tag_list(values: Any) -> list[str]:
    """Normalize/dedupe tag arrays from UI/API/CSV."""
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        tag = _normalize_search_text(str(value or "")).strip()
        if len(tag) < 2:
            continue
        if tag in seen:
            continue
        seen.add(tag)
        out.append(tag)
    return out


def _auto_tags_from_fields(name: Any, category: Any, notes: Any) -> list[str]:
    """Create lightweight tags from product text fields."""
    text = " ".join([str(name or ""), str(category or ""), str(notes or "")]).strip()
    if not text:
        return []
    tokens = _search_tokens(text)
    out: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token in AUTO_TAG_STOPWORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= 12:
            break
    return out


def _build_product_tags(
    *,
    manual_tags: Any,
    name: Any,
    category: Any,
    notes: Any,
) -> list[str] | None:
    """Merge manual tags + auto-generated tags and return deduped list."""
    merged: list[str] = []
    seen: set[str] = set()
    for tag in _sanitize_tag_list(manual_tags) + _auto_tags_from_fields(name, category, notes):
        if tag in seen:
            continue
        seen.add(tag)
        merged.append(tag)
    return merged or None


def _score_product(query_tokens: list[str], product: dict[str, Any]) -> float:
    """Rank products by name/category/notes/tags match (tags weighted higher)."""
    if not query_tokens:
        return 0.0
    name = _normalize_search_text(str(product.get("name") or ""))
    cat = _normalize_search_text(str(product.get("category") or ""))
    notes = _normalize_search_text(str(product.get("notes") or ""))
    tags = product.get("tags")
    tag_strs: list[str] = []
    if isinstance(tags, list):
        tag_strs = [_normalize_search_text(str(t)) for t in tags if t]
    score = 0.0
    for tok in query_tokens:
        if tok in name:
            score += 3.0
        if tok in cat:
            score += 2.0
        if tok in notes:
            score += 1.5
        for tg in tag_strs:
            if not tg:
                continue
            if tok == tg or tok in tg or tg in tok:
                score += 6.0
    return score


def search_products(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """GET /inventory?search=...&limit=N — ranked product suggestions (tags + text)."""
    params = event.get("queryStringParameters") or {}
    q = (params.get("search") or "").strip()
    try:
        top = min(max(int(params.get("limit", 5)), 1), 25)
    except (TypeError, ValueError):
        top = 5
    if not q:
        return error("search query parameter is required", 400)
    pk = build_pk(tenant_id)
    all_items: list[dict[str, Any]] = []
    last_key: dict[str, Any] | None = None
    try:
        while len(all_items) < SEARCH_SCAN_MAX:
            batch, last_key = query_items(
                pk=pk, sk_prefix=PRODUCT_SK_PREFIX, limit=100, last_key=last_key
            )
            all_items.extend(batch)
            if not last_key:
                break
        query_tokens = _search_tokens(q)
        if not query_tokens:
            return success(body={"products": []})
        scored: list[tuple[float, dict[str, Any]]] = []
        for item in all_items:
            prod = Product.from_dynamo(item).to_dict()
            s = _score_product(query_tokens, prod)
            if s > 0:
                scored.append((s, prod))
        scored.sort(key=lambda x: -x[0])
        top_products = [p for _, p in scored[:top]]
        return success(body={"products": top_products})
    except DynamoDBError as e:
        return server_error(str(e))
INVENTORY_IMAGES_PREFIX = "inventory-images"
PRESIGNED_EXPIRY = 300  # 5 minutes
MAX_UPLOAD_IMAGE_URLS = 50


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    """Decode base64-encoded next_token to last_evaluated_key."""
    if not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded) if decoded else None
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    """Encode last_evaluated_key to base64 next_token."""
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _safe_extension(filename: str) -> str:
    """Return file extension (e.g. jpg) or 'jpg' if invalid."""
    if not filename or "." not in filename:
        return "jpg"
    ext = filename.rsplit(".", 1)[-1].lower().strip()
    if not re.match(r"^[a-z0-9]{2,5}$", ext):
        return "jpg"
    return ext


MAX_PRODUCT_IMAGES = 5


def get_upload_image_url(
    tenant_id: str,
    event: dict[str, Any],
) -> dict[str, Any]:
    """
    Return a presigned PUT URL and the final public image_url.
    Body: { "product_id": optional, "filename": str, "content_type": optional, "image_index": 0-4 }.
    image_index distinguishes multiple images per product (0 = primary/legacy image_url).
    """
    bucket = os.environ.get("DATA_BUCKET")
    region = os.environ.get("AWS_REGION", "us-east-1")
    if not bucket:
        return server_error("DATA_BUCKET not configured")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    if not body or not body.get("filename"):
        return error("filename is required", 400)

    filename = (body.get("filename") or "").strip()
    content_type = (body.get("content_type") or "").strip() or "image/jpeg"
    product_id = body.get("product_id")
    image_index = int(body.get("image_index") or 0)
    if not (0 <= image_index < MAX_PRODUCT_IMAGES):
        return error(f"image_index must be 0-{MAX_PRODUCT_IMAGES - 1}", 400)
    ext = _safe_extension(filename)

    if product_id:
        key = f"{INVENTORY_IMAGES_PREFIX}/{tenant_id}/{product_id}_{image_index}.{ext}"
    else:
        key = f"{INVENTORY_IMAGES_PREFIX}/{tenant_id}/temp/{generate_id()}.{ext}"

    try:
        s3 = boto3.client("s3", region_name=region)
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=PRESIGNED_EXPIRY,
        )
    except Exception as e:
        return server_error(f"Failed to generate upload URL: {e}")

    image_url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    return success(body={"upload_url": upload_url, "image_url": image_url})


def get_upload_image_urls_bulk(
    tenant_id: str,
    event: dict[str, Any],
) -> dict[str, Any]:
    """
    Return presigned PUT URLs for multiple products (e.g. after CSV import).
    Body: { "product_ids": [ "id1", "id2", ... ] }. Optional: "default_extension": "jpg".
    """
    bucket = os.environ.get("DATA_BUCKET")
    region = os.environ.get("AWS_REGION", "us-east-1")
    if not bucket:
        return server_error("DATA_BUCKET not configured")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    product_ids = body.get("product_ids")
    if not product_ids or not isinstance(product_ids, list):
        return error("product_ids array is required", 400)
    if len(product_ids) > MAX_UPLOAD_IMAGE_URLS:
        return error(f"At most {MAX_UPLOAD_IMAGE_URLS} product_ids allowed", 400)

    ext = (body.get("default_extension") or "jpg").strip().lower() or "jpg"
    if not re.match(r"^[a-z0-9]{2,5}$", ext):
        ext = "jpg"

    results: list[dict[str, Any]] = []
    try:
        s3 = boto3.client("s3", region_name=region)
        for pid in product_ids:
            if not pid:
                continue
            key = f"{INVENTORY_IMAGES_PREFIX}/{tenant_id}/{pid}.{ext}"
            upload_url = s3.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": bucket,
                    "Key": key,
                    "ContentType": "image/jpeg",
                },
                ExpiresIn=PRESIGNED_EXPIRY,
            )
            image_url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
            results.append({"product_id": pid, "upload_url": upload_url, "image_url": image_url})
    except Exception as e:
        return server_error(f"Failed to generate upload URLs: {e}")

    return success(body={"uploads": results})


def list_products(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List products with optional category filter and pagination."""
    params = event.get("queryStringParameters") or {}
    if (params.get("search") or "").strip():
        return search_products(tenant_id, event)
    next_token = params.get("next_token")
    category = params.get("category")
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        if category:
            # Use GSI1 for category filtering (gsi1pk, gsi1sk)
            table = get_table()
            key_condition = Key("gsi1pk").eq(pk) & Key("gsi1sk").eq(
                f"CATEGORY#{category}"
            )
            query_params: dict[str, Any] = {
                "IndexName": GSI1_NAME,
                "KeyConditionExpression": key_condition,
                "Limit": limit,
            }
            if last_key:
                query_params["ExclusiveStartKey"] = last_key

            response = table.query(**query_params)
            items = response.get("Items", [])
            last_eval = response.get("LastEvaluatedKey")
        else:
            items, last_eval = query_items(
                pk=pk,
                sk_prefix=PRODUCT_SK_PREFIX,
                limit=limit,
                last_key=last_key,
            )

        products = [Product.from_dynamo(item).to_dict() for item in items]
        next_token_out = _encode_next_token(last_eval)

        body: dict[str, Any] = {"products": products}
        if next_token_out:
            body["next_token"] = next_token_out

        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_product(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a new product."""
    try:
        body = parse_body(event)
        product_data = Product.from_dynamo(body)
    except Exception as e:
        return error(str(e), 400)

    product_id = generate_id()
    created_at = now_iso()
    updated_at = created_at

    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "id": product_id,
        "name": product_data.name,
        "quantity": product_data.quantity,
        "reorder_threshold": product_data.reorder_threshold,
        "unit": product_data.unit,
        "created_at": created_at,
        "updated_at": updated_at,
    }

    if product_data.category is not None:
        item["category"] = product_data.category
        item["gsi1pk"] = pk
        item["gsi1sk"] = f"CATEGORY#{product_data.category}"

    if product_data.unit_cost is not None:
        item["unit_cost"] = product_data.unit_cost
    if product_data.supplier_id is not None:
        item["supplier_id"] = product_data.supplier_id
    if product_data.sku is not None:
        item["sku"] = product_data.sku
    if product_data.image_url is not None:
        item["image_url"] = product_data.image_url
    if product_data.image_urls is not None:
        item["image_urls"] = product_data.image_urls
    if product_data.notes is not None:
        item["notes"] = product_data.notes
    if product_data.promo_price is not None:
        item["promo_price"] = product_data.promo_price
    if product_data.promo_end_at is not None:
        item["promo_end_at"] = product_data.promo_end_at
    tags = _build_product_tags(
        manual_tags=product_data.tags,
        name=product_data.name,
        category=product_data.category,
        notes=product_data.notes,
    )
    if tags:
        item["tags"] = tags

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    product_response = Product.from_dynamo(item).to_dict()
    return created(product_response)


def get_product(tenant_id: str, product_id: str) -> dict[str, Any]:
    """Get a single product by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("Product not found")

    product = Product.from_dynamo(item).to_dict()
    return success(body=product)


def update_product(
    tenant_id: str, product_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Update an existing product."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    # Check existence before update
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Product not found")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not body:
        return error("Request body is required", 400)

    # Build updates from allowed fields
    allowed = {
        "name", "category", "quantity", "unit_cost", "reorder_threshold",
        "supplier_id", "sku", "unit", "image_url", "image_urls", "notes", "tags",
        "promo_price", "promo_end_at",
    }
    # promo fields can be explicitly set to null (to clear a promo)
    nullable_allowed = {"promo_price", "promo_end_at"}
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed and (value is not None or key in nullable_allowed):
            updates[key] = value

    updates["updated_at"] = now_iso()

    # If category changed, update GSI keys
    if "category" in updates:
        category_val = updates["category"]
        updates["gsi1pk"] = pk
        updates["gsi1sk"] = f"CATEGORY#{category_val}"

    # Keep tags smart and self-healing on every edit.
    effective_name = updates.get("name", existing.get("name"))
    effective_category = updates.get("category", existing.get("category"))
    effective_notes = updates.get("notes", existing.get("notes"))
    effective_manual_tags = updates.get("tags", existing.get("tags"))
    computed_tags = _build_product_tags(
        manual_tags=effective_manual_tags,
        name=effective_name,
        category=effective_category,
        notes=effective_notes,
    )
    updates["tags"] = computed_tags or []

    try:
        updated_item = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    product = Product.from_dynamo(updated_item).to_dict()
    return success(body=product)


def delete_product(tenant_id: str, product_id: str) -> dict[str, Any]:
    """Delete a product."""
    pk = build_pk(tenant_id)
    sk = build_sk("PRODUCT", product_id)

    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    return no_content()


CSV_TEMPLATE = (
    "name,category,tags,quantity,unit_cost,reorder_threshold,unit,sku,image_url,notes\n"
)

REQUIRED_CSV_COLUMNS = {"name", "quantity"}
VALID_CSV_COLUMNS = {
    "name", "category", "tags", "quantity", "unit_cost",
    "reorder_threshold", "unit", "sku", "image_url", "notes",
}


def get_csv_template(tenant_id: str) -> dict[str, Any]:
    """Return a sample CSV template with example rows."""
    sample = (
        CSV_TEMPLATE
        + 'Chicken Breast,Food,"proteina,pollo",100,4.50,20,lb,,Fresh boneless\n'
        + 'Rice,Food,granos,200,1.20,30,lb,,Long grain\n'
        + 'Cooking Oil,Food,,50,3.00,10,bottle,,Vegetable oil\n'
    )
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="inventory_template.csv"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": sample,
    }


def export_inventory_csv(tenant_id: str) -> dict[str, Any]:
    """Return all inventory rows as CSV (Google Sheets-compatible)."""
    import csv
    import io

    pk = build_pk(tenant_id)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "name",
            "category",
            "tags",
            "quantity",
            "unit_cost",
            "reorder_threshold",
            "unit",
            "sku",
            "image_url",
            "notes",
        ]
    )

    last_key: dict[str, Any] | None = None
    try:
        while True:
            items, last_key = query_items(
                pk=pk,
                sk_prefix=PRODUCT_SK_PREFIX,
                limit=200,
                last_key=last_key,
            )
            for item in items:
                p = Product.from_dynamo(item).to_dict()
                tags = p.get("tags")
                tags_csv = ",".join(tags) if isinstance(tags, list) else ""
                writer.writerow(
                    [
                        p.get("name", ""),
                        p.get("category", ""),
                        tags_csv,
                        p.get("quantity", 0),
                        p.get("unit_cost", ""),
                        p.get("reorder_threshold", 10),
                        p.get("unit", "each"),
                        p.get("sku", ""),
                        p.get("image_url", ""),
                        p.get("notes", ""),
                    ]
                )
            if not last_key:
                break
    except DynamoDBError as e:
        return server_error(str(e))

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="inventory_export.csv"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": out.getvalue(),
    }


def import_csv(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Bulk import products from CSV data.

    Accepts CSV content in the request body. Each row becomes a product.
    Skips rows with validation errors and reports them in the response.
    """
    import csv
    import io
    from decimal import Decimal, InvalidOperation

    body_raw = event.get("body", "")
    if not body_raw:
        return error("Request body is empty. Send CSV content in the body.", 400)

    if event.get("isBase64Encoded"):
        body_raw = base64.b64decode(body_raw).decode("utf-8")

    # Handle BOM from Excel
    if body_raw.startswith("\ufeff"):
        body_raw = body_raw[1:]

    reader = csv.DictReader(io.StringIO(body_raw))

    if not reader.fieldnames:
        return error("CSV has no header row. Expected columns: name, quantity, ...", 400)

    headers = {h.strip().lower() for h in reader.fieldnames}
    missing = REQUIRED_CSV_COLUMNS - headers
    if missing:
        return error(f"CSV missing required columns: {', '.join(sorted(missing))}", 400)

    pk = build_pk(tenant_id)
    now = now_iso()

    items_to_write: list[dict[str, Any]] = []
    imported: list[dict[str, Any]] = []
    errors_list: list[dict[str, Any]] = []

    for row_num, row in enumerate(reader, start=2):
        # Normalize keys
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}

        name = row.get("name", "").strip()
        if not name:
            errors_list.append({"row": row_num, "error": "name is required"})
            continue

        quantity_str = row.get("quantity", "0").strip()
        try:
            quantity = int(quantity_str)
            if quantity < 0:
                raise ValueError
        except (ValueError, TypeError):
            errors_list.append({"row": row_num, "name": name, "error": f"invalid quantity: '{quantity_str}'"})
            continue

        unit_cost = None
        unit_cost_str = row.get("unit_cost", "").strip()
        if unit_cost_str:
            try:
                unit_cost = Decimal(unit_cost_str)
            except InvalidOperation:
                errors_list.append({"row": row_num, "name": name, "error": f"invalid unit_cost: '{unit_cost_str}'"})
                continue

        reorder_threshold = 10
        threshold_str = row.get("reorder_threshold", "").strip()
        if threshold_str:
            try:
                reorder_threshold = int(threshold_str)
            except (ValueError, TypeError):
                errors_list.append({"row": row_num, "name": name, "error": f"invalid reorder_threshold: '{threshold_str}'"})
                continue

        category = row.get("category", "").strip() or None
        unit = row.get("unit", "").strip() or "each"
        sku = row.get("sku", "").strip() or None
        image_url = row.get("image_url", "").strip() or None
        notes = row.get("notes", "").strip() or None
        tags_raw = row.get("tags", "").strip()
        tags: list[str] | None = None
        if tags_raw:
            tags = [t.strip().lower() for t in tags_raw.split(",") if t.strip()]

        product_id = generate_id()
        sk = build_sk("PRODUCT", product_id)

        item: dict[str, Any] = {
            "pk": pk,
            "sk": sk,
            "id": product_id,
            "name": name,
            "quantity": quantity,
            "reorder_threshold": reorder_threshold,
            "unit": unit,
            "created_at": now,
            "updated_at": now,
        }

        if category:
            item["category"] = category
            item["gsi1pk"] = pk
            item["gsi1sk"] = f"CATEGORY#{category}"
        if unit_cost is not None:
            item["unit_cost"] = unit_cost
        if sku:
            item["sku"] = sku
        if image_url:
            item["image_url"] = image_url
        if notes:
            item["notes"] = notes
        computed_tags = _build_product_tags(
            manual_tags=tags,
            name=name,
            category=category,
            notes=notes,
        )
        if computed_tags:
            item["tags"] = computed_tags

        items_to_write.append(item)
        imported.append({"id": product_id, "name": name, "quantity": quantity})

    if not items_to_write and not errors_list:
        return error("CSV has no data rows", 400)

    if items_to_write:
        try:
            batch_put_items(items_to_write)
        except DynamoDBError as e:
            return server_error(f"Failed to write products: {e}")

    result: dict[str, Any] = {
        "imported_count": len(imported),
        "error_count": len(errors_list),
        "imported": imported[:50],
    }
    if errors_list:
        result["errors"] = errors_list[:50]

    status = 201 if imported else 400
    return success(result, status_code=status)


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route requests to the appropriate handler based on method and path."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        path_params = event.get("pathParameters") or {}
        product_id = path_params.get("id")
        tenant_id = event.get("tenant_id", "")

        # GET /inventory/import/template - download CSV template
        if method == "GET" and path.endswith("/inventory/import/template"):
            return get_csv_template(tenant_id)

        # GET /inventory/export - download CSV export
        if method == "GET" and path.endswith("/inventory/export"):
            return export_inventory_csv(tenant_id)

        # POST /inventory/import - bulk CSV import
        if method == "POST" and path.endswith("/inventory/import"):
            return import_csv(tenant_id, event)

        # POST /inventory/upload-image-url - presigned URL for one image (edit or create)
        if method == "POST" and path.endswith("/inventory/upload-image-url"):
            return get_upload_image_url(tenant_id, event)

        # POST /inventory/upload-image-urls - presigned URLs for many (e.g. after import)
        if method == "POST" and path.endswith("/inventory/upload-image-urls"):
            return get_upload_image_urls_bulk(tenant_id, event)

        # GET /inventory - list
        if method == "GET" and not product_id:
            return list_products(tenant_id, event)

        # POST /inventory - create
        if method == "POST" and not product_id:
            return create_product(tenant_id, event)

        # GET /inventory/{id} - get one
        if method == "GET" and product_id:
            return get_product(tenant_id, product_id)

        # PUT /inventory/{id} - update
        if method == "PUT" and product_id:
            return update_product(tenant_id, product_id, event)

        # DELETE /inventory/{id} - delete
        if method == "DELETE" and product_id:
            return delete_product(tenant_id, product_id)

        return error("Method not allowed", 405)

    except Exception as e:
        return server_error(str(e))
