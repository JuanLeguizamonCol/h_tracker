"""Emails active employees who haven't logged any hours in the trailing 7
days. Run weekly by jobs/send_timesheet_reminders.py (Azure Container Apps
Job, same pattern as jobs/generate_invoices.py) — not on every backend
request. Reuses the same SMTP system (utils/email.py) originally built for
password-reset emails. Best-effort per employee: one bad address never blocks
the rest of the run.
"""
import logging
from datetime import date, timedelta
from typing import Dict

from sqlalchemy.orm import Session

from models.employees import Employee
from models.time_entries import TimeEntry
from utils.email import send_email
from utils.email_html import wrap_email, action_button

logger = logging.getLogger(__name__)


def send_timesheet_reminders(db: Session, today: date | None = None) -> Dict[str, int]:
    today = today or date.today()
    window_start = today - timedelta(days=7)

    recent_logger_ids = {
        row[0] for row in db.query(TimeEntry.user_id)
        .filter(TimeEntry.date >= window_start)
        .distinct()
        .all()
    }

    candidates = (
        db.query(Employee)
        .filter(Employee.is_active == True)  # noqa: E712
        # Skip anyone who joined within the window — they haven't had a full
        # week to log hours yet, so flagging them would be a false positive.
        .filter((Employee.start_date == None) | (Employee.start_date <= window_start))  # noqa: E711
        .all()
    )

    sent = 0
    skipped = 0
    for emp in candidates:
        if emp.id in recent_logger_ids:
            skipped += 1
            continue
        if not emp.email:
            skipped += 1
            continue
        try:
            body = f"""
            <p>Hi {emp.name.split(' ')[0]},</p>
            <p>It looks like you haven't logged any hours in the last 7 days
            (since {window_start.isoformat()}). Please update your timesheet
            so your time is tracked accurately.</p>
            {action_button('Log my hours', '/timesheet')}
            """
            if send_email(
                to=emp.email,
                subject="Reminder: log your hours",
                html_body=wrap_email("Timesheet reminder", body),
            ):
                sent += 1
            else:
                skipped += 1
        except Exception:
            logger.exception("Failed to send timesheet reminder to %s", emp.email)
            skipped += 1

    return {"sent": sent, "skipped": skipped, "candidates": len(candidates)}
