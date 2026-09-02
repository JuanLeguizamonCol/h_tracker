"""Sends an internal notification email whenever a new client is created —
lists every field the client form captures, both filled-in and still-missing,
so whoever reviews new clients can see the full picture without opening the
app. Recipient is env-configured (NEW_CLIENT_NOTIFY_EMAIL) — set to Gail
Fornell's address; the feature is a no-op until that's set.
"""
import os
import logging
from typing import List, Tuple

from models.clients import Client
from utils.email import send_email

logger = logging.getLogger(__name__)

NEW_CLIENT_NOTIFY_EMAIL = os.getenv("NEW_CLIENT_NOTIFY_EMAIL")

# (label, attribute) — every client-editable field from the New/Edit Client
# form. CRM-sync/system fields (id, created_at, freshsales_id, crm_*) are
# deliberately excluded — they're not something a person fills in, so
# flagging them "missing" would just be noise.
_FIELDS: List[Tuple[str, str]] = [
    ("Client Number", "client_number"),
    ("Client Code", "client_code"),
    ("Email", "email"),
    ("Phone", "phone"),
    ("Manager Name", "manager_name"),
    ("Manager Email", "manager_email"),
    ("Manager Phone", "manager_phone"),
    ("Salutation", "salutation"),
    ("First Name", "first_name"),
    ("Middle Initial", "middle_initial"),
    ("Last Name", "last_name"),
    ("Job Title", "job_title"),
    ("Main Phone", "main_phone"),
    ("Work Phone", "work_phone"),
    ("Mobile", "mobile"),
    ("Main Email", "main_email"),
    ("Street Address 1", "street_address_1"),
    ("Street Address 2", "street_address_2"),
    ("City", "city"),
    ("State", "state"),
    ("Zip", "zip"),
    ("Country", "country"),
    ("Rep", "rep"),
    ("Payment Terms", "payment_terms"),
    ("Team Member", "team_member"),
    ("Industry", "industry"),
    ("Website", "website"),
    ("Tax ID", "tax_id"),
    ("Referral Source", "referral_source"),
    ("Referred By", "referred_by"),
    ("Acquisition Date", "acquisition_date"),
    ("Contract Start Date", "contract_start_date"),
    ("Contract End Date", "contract_end_date"),
    ("Billing Rate", "billing_rate"),
    ("Billing Currency", "billing_currency"),
    ("Billing Email", "billing_email"),
    ("Notes", "notes"),
]


def _split_filled_vs_missing(client: Client) -> Tuple[List[Tuple[str, str]], List[str]]:
    filled: List[Tuple[str, str]] = []
    missing: List[str] = []
    for label, attr in _FIELDS:
        value = getattr(client, attr, None)
        if value is None or value == "":
            missing.append(label)
        else:
            filled.append((label, str(value)))
    return filled, missing


def _build_html(client: Client) -> str:
    filled, missing = _split_filled_vs_missing(client)
    status = "Active" if client.is_active else "Inactive"

    rows_html = "".join(
        f'<tr><td style="padding:4px 12px;color:#555;border-bottom:1px solid #eee;">{label}</td>'
        f'<td style="padding:4px 12px;border-bottom:1px solid #eee;">{value}</td></tr>'
        for label, value in filled
    )
    missing_html = "".join(f"<li>{label}</li>" for label in missing) or "<li>None — every field is filled in.</li>"

    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;">
      <h2 style="margin-bottom:4px;">New client created: {client.name}</h2>
      <p style="color:#555;margin-top:0;">Status: {status}</p>

      <h3 style="margin-top:24px;">Provided information</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:4px 12px;color:#555;font-weight:bold;">Name</td><td style="padding:4px 12px;font-weight:bold;">{client.name}</td></tr>
        {rows_html}
      </table>

      <h3 style="margin-top:24px;">Missing information</h3>
      <ul style="font-size:14px;">{missing_html}</ul>

      <p style="color:#999;font-size:12px;margin-top:32px;">Automated notification from Horas+ (Impact Point).</p>
    </div>
    """


def notify_new_client_created(client: Client) -> None:
    """Best-effort — never raises, so a notification issue can't affect
    client creation itself."""
    if not NEW_CLIENT_NOTIFY_EMAIL:
        logger.info("New-client notification skipped (NEW_CLIENT_NOTIFY_EMAIL not set) for client %s", client.id)
        return
    try:
        send_email(
            to=NEW_CLIENT_NOTIFY_EMAIL,
            subject=f"New client created: {client.name}",
            html_body=_build_html(client),
        )
    except Exception:
        logger.exception("Failed to build/send new-client notification for client %s", client.id)
