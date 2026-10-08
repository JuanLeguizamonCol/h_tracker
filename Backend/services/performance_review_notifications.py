"""Email notifications for the performance review lifecycle (utils/email.py).
Best-effort only — a failed/unconfigured send never blocks the action that
triggered it. All copy is in English.
"""
import logging

from utils.email import send_email
from utils.email_html import wrap_email, action_button

logger = logging.getLogger(__name__)


def _send(to: str | None, subject: str, heading: str, body: str, review_id: str) -> None:
    if not to:
        return
    try:
        send_email(to=to, subject=subject, html_body=wrap_email(heading, body))
    except Exception:
        logger.exception("Failed to send performance review email for review %s", review_id)


def notify_review_created(review: dict, employee_email: str | None) -> None:
    """Ask the reviewee to complete the project details and self-assessment."""
    body = f"""
    <p>A performance review was opened for your work on <strong>{review['project_name']}</strong>
    {f"(reviewer: {review['reviewer_name']})" if review.get('reviewer_name') else ''}.</p>
    <p>Please complete the <strong>Project Details</strong>, the <strong>Self Assessment</strong> and your
    <strong>self evaluation</strong> scores, then submit them to your manager.</p>
    {action_button('Open my review', f"/reviews/{review['id']}")}
    """
    _send(employee_email, f"Performance review: {review['project_name']}", "Self-assessment requested", body, review["id"])


def notify_self_assessment_submitted(review: dict, reviewer_email: str | None) -> None:
    """Tell the reviewer the employee's part is done and scoring can start."""
    body = f"""
    <p><strong>{review['employee_name']}</strong> submitted their self-assessment for
    <strong>{review['project_name']}</strong>. Please complete your <strong>manager evaluation</strong> —
    you'll see their self scores in the joint review.</p>
    {action_button('Review now', f"/reviews/{review['id']}")}
    """
    _send(reviewer_email, f"Self-assessment ready: {review['employee_name']} — {review['project_name']}", "Ready for your review", body, review["id"])


def notify_joint_review_ready(review: dict, employee_email: str | None, reviewer_email: str | None) -> None:
    """Both parties: self and manager evaluations are in — time for the joint one."""
    body = f"""
    <p>The self and manager evaluations for <strong>{review['employee_name']}</strong> on
    <strong>{review['project_name']}</strong> are done. Meet to agree on the <strong>joint evaluation</strong> —
    it's the one that counts toward the annual performance score.</p>
    {action_button('Open the joint review', f"/reviews/{review['id']}")}
    """
    subject = f"Joint review: {review['employee_name']} — {review['project_name']}"
    for to in {employee_email, reviewer_email} - {None}:
        _send(to, subject, "Ready for the joint review", body, review["id"])


def notify_review_completed(review: dict, employee_email: str | None) -> None:
    """Tell the reviewee their review is complete and visible."""
    body = f"""
    <p>Your performance review for <strong>{review['project_name']}</strong> has been completed
    {f"by {review['reviewer_name']}" if review.get('reviewer_name') else ''}.</p>
    {action_button('View my review', f"/reviews/{review['id']}")}
    """
    _send(employee_email, f"Performance review completed: {review['project_name']}", "Review completed", body, review["id"])
