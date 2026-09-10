"""Email notifications for the PTO request lifecycle, reusing the same SMTP
system (utils/email.py) originally built for password-reset emails. Best-effort
only — a failed/unconfigured send never blocks the request that triggered it.
All copy is in English regardless of the requester's locale.
"""
import logging

from utils.email import send_email
from utils.email_html import wrap_email, action_button

logger = logging.getLogger(__name__)


def _category_label(category: str) -> str:
    return {"vacation": "Vacation", "sick": "Sick", "holiday": "Holiday", "other": "Other"}.get(category, category.title())


def notify_pto_request_created(request: dict, approver_email: str | None) -> None:
    """Tell the designated approver a new request is waiting on them."""
    if not approver_email:
        return
    try:
        body = f"""
        <p><strong>{request['employee_name']}</strong> requested time off:</p>
        <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Type</td><td>{_category_label(request['category'])}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Dates</td><td>{request['start_date']} → {request['end_date']}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Hours</td><td>{request['hours']}h</td></tr>
          {f"<tr><td style='padding:4px 12px 4px 0;color:#555;'>Notes</td><td>{request['notes']}</td></tr>" if request.get('notes') else ''}
        </table>
        {action_button('Review request', '/')}
        """
        send_email(
            to=approver_email,
            subject=f"Time off request from {request['employee_name']}",
            html_body=wrap_email("New time off request", body),
        )
    except Exception:
        logger.exception("Failed to send PTO-created email for request %s", request.get("id"))


def notify_pto_request_reviewed(request: dict, requester_email: str | None) -> None:
    """Tell the requester their request was approved or rejected."""
    if not requester_email:
        return
    decision = "Approved" if request["status"] == "approved" else "Rejected"
    try:
        body = f"""
        <p>Your time off request has been <strong>{decision.lower()}</strong>{f' by {request["reviewer_name"]}' if request.get('reviewer_name') else ''}.</p>
        <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Type</td><td>{_category_label(request['category'])}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Dates</td><td>{request['start_date']} → {request['end_date']}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Hours</td><td>{request['hours']}h</td></tr>
          {f"<tr><td style='padding:4px 12px 4px 0;color:#555;'>Reviewer note</td><td>{request['review_notes']}</td></tr>" if request.get('review_notes') else ''}
        </table>
        {action_button('View my time off', '/')}
        """
        send_email(
            to=requester_email,
            subject=f"Time off request {decision.lower()}",
            html_body=wrap_email(f"Time off request {decision.lower()}", body),
        )
    except Exception:
        logger.exception("Failed to send PTO-reviewed email for request %s", request.get("id"))
