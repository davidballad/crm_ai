"""Contact form Lambda: POST /contact sends an email via SES (public route)."""

from __future__ import annotations

import os
import re
import sys
from typing import Any

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from shared.response import error, server_error, success
from shared.utils import parse_body

_ses = None

def _get_ses():
    global _ses
    if _ses is None:
        _ses = boto3.client("ses")
    return _ses


def _validate_email(value: str) -> bool:
    """Simple email format check."""
    if not value or len(value) > 254:
        return False
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value.strip()))


def _send_contact_email(name: str, email: str, message: str, subject: str) -> None:
    """Send one email via SES to the configured recipient."""
    from_addr = os.environ.get("CONTACT_FROM_EMAIL")
    to_addr = os.environ.get("CONTACT_RECIPIENT_EMAIL")
    if not from_addr or not to_addr:
        raise ValueError("CONTACT_FROM_EMAIL and CONTACT_RECIPIENT_EMAIL must be set")

    email_subject = f"[Clienta AI] {subject}"
    body_text = f"Subject: {subject}\n\nFrom: {name} <{email}>\n\n{message}"

    _get_ses().send_email(
        Source=from_addr,
        Destination={"ToAddresses": [to_addr]},
        Message={
            "Subject": {"Data": email_subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
        },
    )


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle POST /contact — validate body, send email via SES."""
    try:
        method = (event.get("requestContext") or {}).get("http", {}).get("method", "")
        if method != "POST":
            return error("Method not allowed", 405)

        body = parse_body(event)
        name = (body.get("name") or "").strip()
        email = (body.get("email") or "").strip()
        message = (body.get("message") or "").strip()
        subject = (body.get("subject") or "Collaboration").strip() or "Collaboration"

        if not name:
            return error("Name is required", 400)
        if not email:
            return error("Email is required", 400)
        if not _validate_email(email):
            return error("Invalid email address", 400)
        if not message:
            return error("Message is required", 400)
        if len(name) > 200:
            return error("Name is too long", 400)
        if len(message) > 5000:
            return error("Message is too long", 400)
        if len(subject) > 200:
            return error("Subject is too long", 400)

        _send_contact_email(name=name, email=email, message=message, subject=subject)
        return success(body={"ok": True, "message": "Message sent"})
    except ValueError as e:
        return error(str(e), 500)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "MessageRejected" or "sandbox" in str(e).lower():
            return error("Email service is not configured or sender is not verified. Please try again later.", 503)
        return server_error("Failed to send message")
    except Exception as e:
        return server_error(str(e))
