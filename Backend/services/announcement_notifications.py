"""Emails every employee who can see a newly-published announcement (same
audience rules as services/announcements.py::list_announcements — all /
locations / roles / pegasus_contractors). Reuses the same SMTP system
(utils/email.py) originally built for password-reset emails. Best-effort only:
one bad recipient/address never blocks the others or the announcement itself.
"""
import logging
from typing import List

from sqlalchemy.orm import Session

from models.employees import Employee
from utils.email import send_email
from utils.email_html import wrap_email, action_button
from utils.roles import get_role

logger = logging.getLogger(__name__)


def _is_pegasus_contractor(employee: Employee) -> bool:
    # Mirrors services/announcements.py::_is_pegasus_contractor — same fixed
    # audience rule, kept local since that one is module-private.
    return (
        (employee.business_unit or "").strip().lower() == "pegasus"
        and (employee.employment_type or "").strip().lower() == "contractor"
    )


def _recipients(db: Session, announcement: dict) -> List[Employee]:
    employees = db.query(Employee).filter(Employee.is_active == True).all()  # noqa: E712
    visibility = announcement["visibility"]
    locations = set(announcement.get("locations") or [])
    roles = set(announcement.get("roles") or [])

    matched = []
    for emp in employees:
        if emp.id == announcement["posted_by"]:
            continue
        if visibility == "all":
            matched.append(emp)
        elif visibility == "locations" and (emp.location or "").strip() in locations:
            matched.append(emp)
        elif visibility == "roles" and get_role(db, emp.id) in roles:
            matched.append(emp)
        elif visibility == "pegasus_contractors" and _is_pegasus_contractor(emp):
            matched.append(emp)
    return matched


def notify_announcement_published(db: Session, announcement: dict) -> None:
    try:
        recipients = _recipients(db, announcement)
    except Exception:
        logger.exception("Failed to resolve recipients for announcement %s", announcement.get("id"))
        return

    body = f"""
    <p>{announcement['title']}</p>
    <p style="white-space:pre-wrap;color:#333;">{announcement['body'] or ''}</p>
    {action_button('View announcement', '/')}
    """
    html = wrap_email(announcement["title"], body)
    for emp in recipients:
        if not emp.email:
            continue
        try:
            send_email(to=emp.email, subject=f"New announcement: {announcement['title']}", html_body=html)
        except Exception:
            logger.exception("Failed to send announcement email to %s", emp.email)
