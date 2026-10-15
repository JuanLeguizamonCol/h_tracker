"""Notifications for the performance review lifecycle: email (utils/email.py)
plus an in-app bell notification (services/notifications.py) on assignment,
so the reviewee can jump straight to it instead of hunting for it under
/reviews. Both are best-effort — a failed/unconfigured send never blocks the
action that triggered it. Email copy is in English.
"""
import logging

from sqlalchemy.orm import Session

from utils.email import send_email
from utils.email_html import wrap_email, action_button
from services.notifications import create_notification

logger = logging.getLogger(__name__)


def _send(to: str | None, subject: str, heading: str, body: str, review_id: str) -> None:
    if not to:
        return
    try:
        send_email(to=to, subject=subject, html_body=wrap_email(heading, body))
    except Exception:
        logger.exception("Failed to send performance review email for review %s", review_id)


def _reviewer_names(review: dict) -> str:
    names = [r["reviewer_name"] for r in review.get("evaluations", {}).get("reviewers", []) if r.get("reviewer_name")]
    return ", ".join(names)


def notify_review_created(db: Session, review: dict, employee_email: str | None) -> None:
    """Ask the reviewee to complete the project details and self-assessment —
    both an email and an in-app notification linking straight to the review
    (open and ready to fill, not just a reference link). Mentions the
    deadline when one is set, since the self-assessment locks once it passes."""
    reviewer_names = _reviewer_names(review)
    due = review.get("self_due_date")
    body = f"""
    <p>A performance review was opened for your work on <strong>{review['project_name']}</strong>
    {f"(reviewer{'s' if ',' in reviewer_names else ''}: {reviewer_names})" if reviewer_names else ''}.</p>
    <p>Please complete the <strong>Project Details</strong> and your <strong>Self Assessment</strong>,
    then submit it to your reviewer{'s' if ',' in reviewer_names else ''}.</p>
    {f"<p><strong>Due by {due}</strong> — after that date you won't be able to edit or submit it yourself.</p>" if due else ''}
    {action_button('Open my self-assessment', f"/reviews/{review['id']}")}
    """
    _send(employee_email, f"Performance review: {review['project_name']}", "Self-assessment requested", body, review["id"])
    create_notification(
        db,
        user_id=review["employee_id"],
        type="performance_review_assigned",
        title=f"Performance review assigned — {review['project_name']}",
        message="Complete the project details and your self evaluation, then submit to your manager.",
        link=f"/reviews/{review['id']}",
    )


def notify_self_assessment_submitted(review: dict, reviewer_email: str | None) -> None:
    """Tell the reviewer the employee's part is done and scoring can start —
    reviewers can't begin until this fires."""
    body = f"""
    <p><strong>{review['employee_name']}</strong> submitted their self-assessment for
    <strong>{review['project_name']}</strong>. Please complete your evaluation — it's independent
    from any other reviewer's, and you'll see each other's once everyone has submitted.</p>
    {action_button('Review now', f"/reviews/{review['id']}")}
    """
    _send(reviewer_email, f"Self-assessment ready: {review['employee_name']} — {review['project_name']}", "Ready for your review", body, review["id"])


def notify_joint_review_ready(review: dict, employee_email: str | None, *reviewer_emails: str | None) -> None:
    """Everyone involved: the self-assessment and every reviewer's evaluation
    are in — time for the Final Submission."""
    body = f"""
    <p>The self-assessment and every reviewer evaluation for <strong>{review['employee_name']}</strong> on
    <strong>{review['project_name']}</strong> are done. Meet to agree on the <strong>Final Submission</strong> —
    it's the one that counts toward the annual performance score.</p>
    {action_button('Open the Final Submission', f"/reviews/{review['id']}")}
    """
    subject = f"Final Submission ready: {review['employee_name']} — {review['project_name']}"
    for to in {employee_email, *reviewer_emails} - {None}:
        _send(to, subject, "Ready for the Final Submission", body, review["id"])


def notify_review_completed(review: dict, employee_email: str | None) -> None:
    """Tell the reviewee their review is complete and visible."""
    reviewer_names = _reviewer_names(review)
    body = f"""
    <p>Your performance review for <strong>{review['project_name']}</strong> has been completed
    {f"by {reviewer_names}" if reviewer_names else ''}.</p>
    {action_button('View my review', f"/reviews/{review['id']}")}
    """
    _send(employee_email, f"Performance review completed: {review['project_name']}", "Review completed", body, review["id"])
