"""
Transactional email via the Microsoft Graph API (client-credentials flow).

Sends mail as a real M365 mailbox using an Entra app registration that has the
**application** permission `Mail.Send` (admin consent required). All configuration
comes from environment variables; if any are missing the module logs a warning and
becomes a no-op so local/dev environments (and CI) don't break.

Env vars:
    GRAPH_TENANT_ID      Entra tenant id (defaults to AZURE_TENANT_ID if set).
    GRAPH_CLIENT_ID      App registration (client) id.
    GRAPH_CLIENT_SECRET  App registration client secret.
    GRAPH_SENDER         From address — must be a real licensed/shared mailbox
                         (e.g. no-reply@impactpoint.com).

Public API:
    email_configured() -> bool
    send_email(to_email, subject, html_body, to_name=None) -> bool
"""
import logging
import os

import httpx

logger = logging.getLogger("graph_email")

_GRAPH_SCOPE = "https://graph.microsoft.com/.default"
_TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
_SENDMAIL_URL = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"


def _cfg() -> dict:
    return {
        "tenant": (os.getenv("GRAPH_TENANT_ID") or os.getenv("AZURE_TENANT_ID") or "").strip(),
        "client_id": (os.getenv("GRAPH_CLIENT_ID") or "").strip(),
        "client_secret": os.getenv("GRAPH_CLIENT_SECRET") or "",
        "sender": (os.getenv("GRAPH_SENDER") or "").strip(),
    }


def email_configured() -> bool:
    c = _cfg()
    return all([c["tenant"], c["client_id"], c["client_secret"], c["sender"]])


def _get_token(c: dict) -> str | None:
    try:
        resp = httpx.post(
            _TOKEN_URL.format(tenant=c["tenant"]),
            data={
                "client_id": c["client_id"],
                "client_secret": c["client_secret"],
                "scope": _GRAPH_SCOPE,
                "grant_type": "client_credentials",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json().get("access_token")
    except Exception as e:  # noqa: BLE001 — email must never crash the caller
        logger.error("Graph token request failed: %s", e)
        return None


def send_email(to_email: str, subject: str, html_body: str, to_name: str | None = None) -> bool:
    """Best-effort send. Returns True on success, False on any failure (never raises)."""
    c = _cfg()
    if not email_configured():
        logger.warning("Email not configured (GRAPH_* env vars missing) — skipping send to %s.", to_email)
        return False

    token = _get_token(c)
    if not token:
        return False

    message = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [
                {"emailAddress": {"address": to_email, **({"name": to_name} if to_name else {})}}
            ],
        },
        "saveToSentItems": False,
    }
    try:
        resp = httpx.post(
            _SENDMAIL_URL.format(sender=c["sender"]),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=message,
            timeout=20.0,
        )
        # Graph sendMail returns 202 Accepted on success.
        if resp.status_code == 202:
            logger.info("Invitation email sent to %s", to_email)
            return True
        logger.error("Graph sendMail failed (%s): %s", resp.status_code, resp.text[:500])
        return False
    except Exception as e:  # noqa: BLE001
        logger.error("Graph sendMail request failed: %s", e)
        return False
