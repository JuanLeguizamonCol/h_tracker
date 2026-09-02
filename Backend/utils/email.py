"""Outbound email via SMTP — used for internal notifications (e.g. "a new
client was created"). Configured entirely through env vars, same "optional
integration" pattern as Expensify/FreshSales elsewhere in this app: with no
SMTP_HOST set, send_email() just logs and returns False instead of raising,
so a notification failure/missing config never blocks the request that
triggered it.
"""
import os
import logging
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
# Most providers (incl. a Microsoft 365 mailbox via smtp.office365.com) want
# STARTTLS on port 587 — the default. Set SMTP_USE_TLS=false only for a
# provider/port that doesn't use it (e.g. an already-TLS port 465 setup).
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL") or SMTP_USERNAME
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Horas+ (Impact Point)")


def email_enabled() -> bool:
    return bool(SMTP_HOST and SMTP_FROM_EMAIL)


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Best-effort send. Returns True/False instead of raising — callers
    should never let an email failure block the action that triggered it."""
    if not email_enabled():
        logger.warning("Email not sent (SMTP_HOST/SMTP_FROM_EMAIL not configured): %s", subject)
        return False
    if not to:
        logger.warning("Email not sent (no recipient given): %s", subject)
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>" if SMTP_FROM_NAME else SMTP_FROM_EMAIL
        msg["To"] = to
        msg.set_content("This notification requires an HTML-capable email client to view.")
        msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            if SMTP_USE_TLS:
                server.starttls()
            if SMTP_USERNAME and SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Email sent: %s -> %s", subject, to)
        return True
    except Exception:
        logger.exception("Failed to send email: %s -> %s", subject, to)
        return False
