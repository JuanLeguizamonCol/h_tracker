"""Monthly close for time entries.

Once a calendar month closes, its hours can never be logged, edited, or
deleted again, by anyone — no role is exempt (see routers/time_entries.py).
Default rule: a month closes on the 6th of the following month, giving a
5-day grace window to finish logging/correcting the prior month.

Does NOT affect invoice-side editing — an invoice line's weekly hours
(InvoiceLineWeek, Admin-only) are a separate table from time_entries and are
billing corrections (e.g. holding hours back), not a record of when work
happened, so they stay editable regardless of this lock.

The one way around the lock: an Admin can grant a specific employee a 2-hour
override (TimeEntryLockOverride, routers/time_entry_lock_overrides.py). While
it's active, that employee — and only that employee — can log/edit/delete
entries in any closed period. Nobody else is affected, and it expires on its
own; there's no way to extend one, only grant a fresh one.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from models.time_entry_lock_overrides import TimeEntryLockOverride


def lock_date_for(entry_date: date) -> date:
    """The date entry_date's month closes on: the 6th of the following month."""
    if entry_date.month == 12:
        return date(entry_date.year + 1, 1, 6)
    return date(entry_date.year, entry_date.month + 1, 6)


def is_period_locked(entry_date: date, today: date | None = None) -> bool:
    today = today or date.today()
    return today >= lock_date_for(entry_date)


def has_active_lock_override(db: Session, employee_id: str) -> bool:
    now = datetime.now(timezone.utc)
    override = (
        db.query(TimeEntryLockOverride)
        .filter(
            TimeEntryLockOverride.employee_id == employee_id,
            TimeEntryLockOverride.revoked_at.is_(None),
            TimeEntryLockOverride.expires_at > now,
        )
        .first()
    )
    return override is not None
