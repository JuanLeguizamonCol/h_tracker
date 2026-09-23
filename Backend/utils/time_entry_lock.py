"""Monthly close for time entries.

Once a calendar month closes, its hours can never be logged, edited, or
deleted again, by anyone — no role is exempt (see routers/time_entries.py).
Default rule: a month closes on the 6th of the following month, giving a
5-day grace window to finish logging/correcting the prior month.

Does NOT affect invoice-side editing — an invoice line's weekly hours
(InvoiceLineWeek, Admin-only) are a separate table from time_entries and are
billing corrections (e.g. holding hours back), not a record of when work
happened, so they stay editable regardless of this lock.
"""
from datetime import date


def lock_date_for(entry_date: date) -> date:
    """The date entry_date's month closes on: the 6th of the following month."""
    if entry_date.month == 12:
        return date(entry_date.year + 1, 1, 6)
    return date(entry_date.year, entry_date.month + 1, 6)


def is_period_locked(entry_date: date, today: date | None = None) -> bool:
    today = today or date.today()
    return today >= lock_date_for(entry_date)
