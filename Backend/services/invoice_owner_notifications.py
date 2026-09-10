"""Emails a project's owner (Project.owner_id — the only employee allowed to
invoice that project, see models/projects.py) whenever one of their invoices
is generated, manually or by the scheduled job. Reuses the same SMTP system
(utils/email.py) originally built for password-reset emails. Best-effort only.
"""
import logging

from utils.email import send_email
from utils.email_html import wrap_email, action_button

logger = logging.getLogger(__name__)


def notify_invoice_owner(owner_email: str | None, project_name: str, invoice_id: str, invoice_number: str, total: float) -> None:
    if not owner_email:
        return
    try:
        body = f"""
        <p>A draft invoice has been generated for <strong>{project_name}</strong>.</p>
        <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Invoice #</td><td>{invoice_number}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Total</td><td>${total:,.2f}</td></tr>
        </table>
        <p>Please review it before sending it to the client.</p>
        {action_button('Review invoice', f'/invoices/{invoice_id}/edit')}
        """
        send_email(
            to=owner_email,
            subject=f"Invoice ready for review — {project_name}",
            html_body=wrap_email("Invoice ready for review", body),
        )
    except Exception:
        logger.exception("Failed to send invoice-owner email for invoice %s", invoice_id)
