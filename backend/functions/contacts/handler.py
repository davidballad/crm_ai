"""Contacts CRUD Lambda handler for multi-tenant SaaS CRM."""

from __future__ import annotations

import base64
import json
import os
import sys
from decimal import Decimal
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth, validate_service_key
from shared.db import delete_item, get_item, get_table, put_item, query_items, update_item
from shared.db import DynamoDBError
from shared.models import Contact
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

CONTACT_SK_PREFIX = "CONTACT#"
LIMIT_DEFAULT = 50
LIMIT_MAX = 100

VALID_LEAD_STATUSES = {"prospect", "interested", "closed_won", "abandoned"}
VALID_TIERS = {"bronze", "silver", "gold"}
VALID_CONVERSATION_MODES = {"bot", "human"}
TIER_BRONZE_MAX = Decimal("30")
TIER_SILVER_MAX = Decimal("100")

PRO_PLANS = frozenset({"pro"})


def _get_tenant_plan(tenant_id: str) -> str:
    """Read tenant plan from DynamoDB. Returns 'free' on any error."""
    try:
        item = get_item(pk=build_pk(tenant_id), sk=build_sk("TENANT", tenant_id))
        return (item or {}).get("plan", "free") or "free"
    except Exception:
        return "free"


def _to_decimal_amount(value: Any) -> Decimal | None:
    """Best-effort conversion for total_spent-like numeric values."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _tier_from_total_spent(total_spent: Decimal) -> str:
    """Auto-tier thresholds: bronze < 30, silver 30-99.99, gold >= 100."""
    if total_spent < TIER_BRONZE_MAX:
        return "bronze"
    if total_spent < TIER_SILVER_MAX:
        return "silver"
    return "gold"


def _normalize_phone_digits(value: str | None) -> str:
    """Digits only — matches WhatsApp `from_number` and avoids +/spaces mismatches."""
    if value is None:
        return ""
    return "".join(ch for ch in str(value) if ch.isdigit())


# When filtering by phone, paginate until match (contacts may not be on first page).
_PHONE_LOOKUP_MAX_PAGES = 40


def _find_contact_item_by_phone(tenant_id: str, phone_digits: str) -> dict[str, Any] | None:
    """Find first existing contact item by normalized phone for this tenant."""
    if not phone_digits:
        return None
    pk = build_pk(tenant_id)
    last_key: dict[str, Any] | None = None
    for _ in range(_PHONE_LOOKUP_MAX_PAGES):
        items, last_eval = query_items(
            pk=pk,
            sk_prefix=CONTACT_SK_PREFIX,
            limit=LIMIT_MAX,
            last_key=last_key,
        )
        for item in items:
            if _normalize_phone_digits(item.get("phone")) == phone_digits:
                return item
        if not last_eval:
            return None
        last_key = last_eval
    return None


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        decoded = base64.b64decode(token).decode("utf-8")
        return json.loads(decoded) if decoded else None
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _contact_matches_filters(
    c: dict[str, Any],
    *,
    tier: str | None,
    lead_status: str | None,
    min_spent: Decimal | None,
    max_spent: Decimal | None,
    cutoff_ts: str | None,
    tag: str | None,
) -> bool:
    """Return True if a contact dict matches all active segment filters."""
    if tier and c.get("tier") != tier:
        return False
    if lead_status and c.get("lead_status") != lead_status:
        return False
    spent = _to_decimal_amount(c.get("total_spent"))
    if min_spent is not None:
        if spent is None or spent < min_spent:
            return False
    if max_spent is not None:
        if spent is None or spent > max_spent:
            return False
    if cutoff_ts is not None:
        last_act = c.get("last_activity_ts") or c.get("created_ts") or ""
        if last_act >= cutoff_ts:  # active more recently than cutoff → skip
            return False
    if tag:
        tags = c.get("tags") or []
        if tag not in tags:
            return False
    return True


def list_contacts(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """List contacts with optional phone filter, segment filters, and pagination."""
    from datetime import datetime, timedelta, timezone

    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    phone_filter = params.get("phone")
    tier_filter = params.get("tier") or None
    status_filter = params.get("lead_status") or None
    tag_filter = params.get("tag") or None
    try:
        limit = min(int(params.get("limit", LIMIT_DEFAULT)), LIMIT_MAX)
    except (TypeError, ValueError):
        limit = LIMIT_DEFAULT

    # Spend range filters
    min_spent: Decimal | None = None
    max_spent: Decimal | None = None
    try:
        if params.get("min_spent"):
            min_spent = Decimal(params["min_spent"])
    except Exception:
        pass
    try:
        if params.get("max_spent"):
            max_spent = Decimal(params["max_spent"])
    except Exception:
        pass

    # Inactivity filter: contacts with no activity in the last N days
    cutoff_ts: str | None = None
    try:
        if params.get("days_inactive"):
            days = int(params["days_inactive"])
            cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
            cutoff_ts = cutoff_dt.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        pass

    has_segment_filters = any([
        tier_filter, status_filter, tag_filter,
        min_spent is not None, max_spent is not None, cutoff_ts is not None,
    ])

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        if phone_filter:
            # Paginate until we find a matching phone (or exhaust pages).
            want_digits = _normalize_phone_digits(phone_filter)
            if not want_digits:
                return success(body={"contacts": []})
            found: list[dict[str, Any]] = []
            last_key_loop = last_key
            for _ in range(_PHONE_LOOKUP_MAX_PAGES):
                items, last_eval = query_items(
                    pk=pk,
                    sk_prefix=CONTACT_SK_PREFIX,
                    limit=LIMIT_MAX,
                    last_key=last_key_loop,
                )
                for item in items:
                    c = Contact.from_dynamo(item).to_dict()
                    if _normalize_phone_digits(c.get("phone")) == want_digits:
                        found.append(c)
                        break
                if found:
                    break
                if not last_eval:
                    break
                last_key_loop = last_eval
            return success(body={"contacts": found})

        if has_segment_filters:
            # Client-side filtering: paginate until we collect `limit` matches or exhaust pages.
            matched: list[dict[str, Any]] = []
            last_key_loop = last_key
            max_pages = 100  # safety cap
            for _ in range(max_pages):
                items, last_eval = query_items(
                    pk=pk,
                    sk_prefix=CONTACT_SK_PREFIX,
                    limit=LIMIT_MAX,
                    last_key=last_key_loop,
                )
                for item in items:
                    c = Contact.from_dynamo(item).to_dict()
                    if _contact_matches_filters(
                        c,
                        tier=tier_filter,
                        lead_status=status_filter,
                        min_spent=min_spent,
                        max_spent=max_spent,
                        cutoff_ts=cutoff_ts,
                        tag=tag_filter,
                    ):
                        matched.append(c)
                        if len(matched) >= limit:
                            break
                if len(matched) >= limit:
                    # Return a pagination token so caller can get next page
                    next_token_out = _encode_next_token(last_eval) if last_eval else None
                    body: dict[str, Any] = {"contacts": matched}
                    if next_token_out:
                        body["next_token"] = next_token_out
                    return success(body=body)
                if not last_eval:
                    break
                last_key_loop = last_eval
            return success(body={"contacts": matched})

        items, last_eval = query_items(
            pk=pk,
            sk_prefix=CONTACT_SK_PREFIX,
            limit=limit,
            last_key=last_key,
        )
        contacts = [Contact.from_dynamo(item).to_dict() for item in items]
        next_token_out = _encode_next_token(last_eval)
        body = {"contacts": contacts}
        if next_token_out:
            body["next_token"] = next_token_out
        return success(body=body)
    except DynamoDBError as e:
        return server_error(str(e))


def export_contacts_csv(tenant_id: str) -> dict[str, Any]:
    """Return all contacts/leads as CSV (Google Sheets-compatible)."""
    import csv
    import io

    pk = build_pk(tenant_id)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "contact_id",
            "name",
            "phone",
            "email",
            "source_channel",
            "lead_status",
            "tier",
            "total_spent",
            "last_activity_ts",
            "created_ts",
            "conversation_mode",
            "tags",
        ]
    )

    last_key: dict[str, Any] | None = None
    try:
        while True:
            items, last_key = query_items(
                pk=pk,
                sk_prefix=CONTACT_SK_PREFIX,
                limit=200,
                last_key=last_key,
            )
            for item in items:
                c = Contact.from_dynamo(item).to_dict()
                tags = c.get("tags")
                tags_csv = ",".join(tags) if isinstance(tags, list) else ""
                writer.writerow(
                    [
                        c.get("contact_id", ""),
                        c.get("name", ""),
                        c.get("phone", ""),
                        c.get("email", ""),
                        c.get("source_channel", ""),
                        c.get("lead_status", "prospect"),
                        c.get("tier", "bronze"),
                        c.get("total_spent", ""),
                        c.get("last_activity_ts", ""),
                        c.get("created_ts", ""),
                        c.get("conversation_mode", "bot"),
                        tags_csv,
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
            "Content-Disposition": 'attachment; filename="leads_export.csv"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": out.getvalue(),
    }


def create_contact(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Create a new contact (defaults: lead_status=prospect, tier=bronze)."""
    try:
        body = parse_body(event)
        contact_data = Contact.from_dynamo(body)
    except Exception as e:
        return error(str(e), 400)

    if not contact_data.name:
        return error("name is required", 400)
    if contact_data.lead_status not in VALID_LEAD_STATUSES:
        return error(f"lead_status must be one of: {', '.join(sorted(VALID_LEAD_STATUSES))}", 400)
    if contact_data.tier not in VALID_TIERS:
        return error(f"tier must be one of: {', '.join(sorted(VALID_TIERS))}", 400)
    if contact_data.conversation_mode not in VALID_CONVERSATION_MODES:
        return error(
            f"conversation_mode must be one of: {', '.join(sorted(VALID_CONVERSATION_MODES))}",
            400,
        )
    if contact_data.total_spent is not None:
        # Keep tier consistent with spend when creating contact with historical spend.
        contact_data.tier = _tier_from_total_spent(contact_data.total_spent)

    phone_digits = _normalize_phone_digits(contact_data.phone)
    if phone_digits:
        # Idempotency guard: avoid duplicate leads for the same WhatsApp number.
        try:
            existing_item = _find_contact_item_by_phone(tenant_id, phone_digits)
        except DynamoDBError as e:
            return server_error(str(e))
        if existing_item:
            return success(body=Contact.from_dynamo(existing_item).to_dict())
        contact_data.phone = phone_digits

    contact_id = generate_id()
    created_ts = now_iso()

    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "tenant_id": tenant_id,
        "contact_id": contact_id,
        "name": contact_data.name,
        "lead_status": contact_data.lead_status,
        "tier": contact_data.tier,
        "created_ts": created_ts,
    }
    if contact_data.phone is not None:
        nd = _normalize_phone_digits(contact_data.phone)
        item["phone"] = nd if nd else str(contact_data.phone).strip()
    if contact_data.total_spent is not None:
        item["total_spent"] = contact_data.total_spent
    if contact_data.email is not None:
        item["email"] = contact_data.email
    if contact_data.source_channel is not None:
        item["source_channel"] = contact_data.source_channel
    if contact_data.last_activity_ts is not None:
        item["last_activity_ts"] = contact_data.last_activity_ts
    if contact_data.tags is not None:
        item["tags"] = contact_data.tags
    if contact_data.conversation_mode is not None:
        item["conversation_mode"] = contact_data.conversation_mode
    elif "conversation_mode" not in item:
        item["conversation_mode"] = "bot"

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(Contact.from_dynamo(item).to_dict())


def get_contact(tenant_id: str, contact_id: str) -> dict[str, Any]:
    """Get a single contact by ID."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not item:
        return not_found("Contact not found")
    return success(body=Contact.from_dynamo(item).to_dict())


def patch_contact(
    tenant_id: str, contact_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Partial update (PATCH): only update provided fields."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Contact not found")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    if not body:
        return error("Request body is required", 400)

    allowed = {
        "name", "phone", "email", "source_channel", "lead_status",
        "tier", "total_spent", "last_activity_ts", "tags", "conversation_mode",
    }
    updates: dict[str, Any] = {}
    for key, value in body.items():
        if key in allowed:
            if key == "phone" and value is not None:
                nd = _normalize_phone_digits(str(value))
                updates[key] = nd if nd else str(value).strip()
            else:
                updates[key] = value

    if "lead_status" in updates and updates["lead_status"] not in VALID_LEAD_STATUSES:
        return error(f"lead_status must be one of: {', '.join(sorted(VALID_LEAD_STATUSES))}", 400)
    if "tier" in updates and updates["tier"] not in VALID_TIERS:
        return error(f"tier must be one of: {', '.join(sorted(VALID_TIERS))}", 400)
    if "conversation_mode" in updates and updates["conversation_mode"] not in VALID_CONVERSATION_MODES:
        return error(
            f"conversation_mode must be one of: {', '.join(sorted(VALID_CONVERSATION_MODES))}",
            400,
        )
    if "name" in updates and not updates["name"]:
        return error("name cannot be empty", 400)
    if "total_spent" in updates and "tier" not in updates:
        amount = _to_decimal_amount(updates.get("total_spent"))
        if amount is not None:
            updates["tier"] = _tier_from_total_spent(amount)

    try:
        updated_item = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(body=Contact.from_dynamo(updated_item).to_dict())


def update_contact(
    tenant_id: str, contact_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Full update (PUT) -- delegates to patch logic."""
    return patch_contact(tenant_id, contact_id, event)


def get_contact_stats(tenant_id: str) -> dict[str, Any]:
    """GET /contacts/stats — aggregate totals by tier/status + avg LTV."""
    pk = build_pk(tenant_id)
    totals: dict[str, Any] = {
        "total": 0,
        "by_tier": {"bronze": 0, "silver": 0, "gold": 0},
        "by_status": {"prospect": 0, "interested": 0, "closed_won": 0, "abandoned": 0},
        "total_revenue": 0.0,
        "avg_ltv": 0.0,
        "customers_with_orders": 0,
    }
    last_key: dict[str, Any] | None = None
    try:
        while True:
            items, last_key = query_items(
                pk=pk, sk_prefix=CONTACT_SK_PREFIX, limit=200, last_key=last_key
            )
            for item in items:
                c = Contact.from_dynamo(item)
                totals["total"] += 1
                tier = c.tier or "bronze"
                status = c.lead_status or "prospect"
                if tier in totals["by_tier"]:
                    totals["by_tier"][tier] += 1
                if status in totals["by_status"]:
                    totals["by_status"][status] += 1
                if c.total_spent is not None:
                    spent = c.total_spent if isinstance(c.total_spent, Decimal) else Decimal(str(c.total_spent))
                    if spent > Decimal("0"):
                        totals["total_revenue"] += float(spent)
                        totals["customers_with_orders"] += 1
            if not last_key:
                break
        if totals["customers_with_orders"] > 0:
            totals["avg_ltv"] = round(totals["total_revenue"] / totals["customers_with_orders"], 2)
        totals["total_revenue"] = round(totals["total_revenue"], 2)
        return success(totals)
    except DynamoDBError as e:
        return server_error(str(e))


def bulk_tag_contacts(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /contacts/bulk-tag — add or remove tags from multiple contacts."""
    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error("Cuerpo JSON inválido", 400)

    contact_ids = body.get("contact_ids") or []
    tags = body.get("tags") or []
    action = body.get("action", "add")

    if not contact_ids:
        return error("contact_ids es requerido", 400)
    if not tags:
        return error("tags es requerido", 400)
    if action not in {"add", "remove"}:
        return error("action debe ser 'add' o 'remove'", 400)

    pk = build_pk(tenant_id)
    updated = 0
    failed = 0

    for contact_id in contact_ids:
        sk = build_sk("CONTACT", contact_id)
        try:
            item = get_item(pk=pk, sk=sk)
            if not item:
                failed += 1
                continue
            current_tags = list(item.get("tags") or [])
            if action == "add":
                for tag in tags:
                    if tag not in current_tags:
                        current_tags.append(tag)
            else:
                current_tags = [t for t in current_tags if t not in tags]
            update_item(pk=pk, sk=sk, updates={"tags": current_tags})
            updated += 1
        except DynamoDBError:
            failed += 1

    return success({"actualizado": updated, "fallido": failed})


def delete_contact(tenant_id: str, contact_id: str) -> dict[str, Any]:
    """Delete a contact."""
    pk = build_pk(tenant_id)
    sk = build_sk("CONTACT", contact_id)
    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    return no_content()


NOTE_SK_PREFIX = "NOTE#"


def list_notes(tenant_id: str, contact_id: str) -> dict[str, Any]:
    """GET /contacts/{id}/notes — list all notes for a contact."""
    pk = build_pk(tenant_id)
    items, _ = query_items(pk=pk, sk_prefix=f"NOTE#{contact_id}#")
    notes = [
        {
            "id": item.get("id"),
            "content": item.get("content", ""),
            "created_by": item.get("created_by", ""),
            "created_at": item.get("created_at", ""),
        }
        for item in items
    ]
    notes.sort(key=lambda n: n.get("created_at") or "", reverse=True)
    return success({"notes": notes})


def add_note(tenant_id: str, contact_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """POST /contacts/{id}/notes — add a note to a contact."""
    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON body", 400)

    content = (body.get("content") or "").strip()
    if not content:
        return error("content is required", 400)
    if len(content) > 2000:
        return error("content must be 2000 characters or less", 400)

    user_info = event.get("user_info") or {}
    created_by = user_info.get("email") or ""

    note_id = generate_id()
    pk = build_pk(tenant_id)
    sk = f"NOTE#{contact_id}#{note_id}"
    now = now_iso()
    item = {
        "pk": pk,
        "sk": sk,
        "entity_type": "NOTE",
        "id": note_id,
        "contact_id": contact_id,
        "content": content,
        "created_by": created_by,
        "created_at": now,
    }
    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created({"id": note_id, "content": content, "created_by": created_by, "created_at": now})


def delete_note(tenant_id: str, contact_id: str, note_id: str) -> dict[str, Any]:
    """DELETE /contacts/{id}/notes/{note_id} — delete a note."""
    pk = build_pk(tenant_id)
    sk = f"NOTE#{contact_id}#{note_id}"
    try:
        existing = get_item(pk=pk, sk=sk)
        if not existing:
            return not_found("Note not found")
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route requests by method and path."""
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        path = event.get("path", "") or event.get("rawPath", "")
        path_params = event.get("pathParameters") or {}
        contact_id = path_params.get("id")
        note_id = path_params.get("note_id")
        tenant_id = event.get("tenant_id", "")

        # UI (JWT): Pro plan required. n8n / service key may upsert contacts for any plan.
        if _get_tenant_plan(tenant_id) not in PRO_PLANS and not validate_service_key(event):
            return error("Leads & contacts require a Pro plan. Please upgrade your account.", 403)

        if method == "GET" and path.endswith("/contacts/export"):
            return export_contacts_csv(tenant_id)

        if method == "GET" and path.endswith("/contacts/stats"):
            return get_contact_stats(tenant_id)

        if method == "POST" and path.endswith("/contacts/bulk-tag"):
            return bulk_tag_contacts(tenant_id, event)

        # Notes sub-resource
        if "/notes" in path and contact_id:
            if method == "GET":
                return list_notes(tenant_id, contact_id)
            if method == "POST":
                return add_note(tenant_id, contact_id, event)
            if method == "DELETE" and note_id:
                return delete_note(tenant_id, contact_id, note_id)

        if method == "GET" and not contact_id:
            return list_contacts(tenant_id, event)
        if method == "POST" and not contact_id:
            return create_contact(tenant_id, event)
        if method == "GET" and contact_id:
            return get_contact(tenant_id, contact_id)
        if method == "PATCH" and contact_id:
            return patch_contact(tenant_id, contact_id, event)
        if method == "PUT" and contact_id:
            return update_contact(tenant_id, contact_id, event)
        if method == "DELETE" and contact_id:
            return delete_contact(tenant_id, contact_id)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
