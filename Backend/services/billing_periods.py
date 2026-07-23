"""
Billing-period math for scheduled invoice generation.

Given a project's billing configuration (billing_period, billing_day_of_period,
billing_anchor_date, custom_period_days), compute:
  - next_invoice_date(project)          → the next date an invoice should be cut
  - period_bounds_for_project(project)  → the (start, end) of the cycle to bill

Extracted from the old in-process scheduler so it can be reused by the
standalone invoice job (jobs/generate_invoices.py).
"""
import calendar
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def next_invoice_date(project, last_invoice_date: date | None = None) -> date | None:
    """
    Return the next invoice generation date for a project based on its
    billing_period, billing_day_of_period, and billing_anchor_date.
    Returns None if the project has no usable billing configuration.
    """
    period = getattr(project, "billing_period", None) or "monthly"
    day = getattr(project, "billing_day_of_period", None) or 3
    anchor = getattr(project, "billing_anchor_date", None)
    custom_days = getattr(project, "custom_period_days", None)

    today = date.today()

    if period == "monthly":
        try:
            candidate = today.replace(day=day)
        except ValueError:
            candidate = today.replace(day=days_in_month(today.year, today.month))
        if candidate < today:
            nxt = today + relativedelta(months=1)
            candidate = nxt.replace(day=min(day, days_in_month(nxt.year, nxt.month)))
        return candidate

    elif period == "bimonthly":
        base = today.replace(day=min(day, days_in_month(today.year, today.month)))
        if base < today:
            nxt = today + relativedelta(months=2)
            base = nxt.replace(day=min(day, days_in_month(nxt.year, nxt.month)))
        return base

    elif period == "quarterly":
        for m in (1, 4, 7, 10):
            candidate = date(today.year, m, min(day, days_in_month(today.year, m)))
            if candidate >= today:
                return candidate
        return date(today.year + 1, 1, min(day, days_in_month(today.year + 1, 1)))

    elif period == "weekly":
        ref = anchor or last_invoice_date or today
        nxt = ref + timedelta(days=7)
        while nxt < today:
            nxt += timedelta(days=7)
        return nxt

    elif period == "biweekly":
        ref = anchor or last_invoice_date or today
        nxt = ref + timedelta(days=14)
        while nxt < today:
            nxt += timedelta(days=14)
        return nxt

    elif period == "custom":
        if not custom_days or custom_days < 1:
            return None
        ref = anchor or last_invoice_date or today
        nxt = ref + timedelta(days=custom_days)
        while nxt < today:
            nxt += timedelta(days=custom_days)
        return nxt

    return None


def period_bounds_for_project(project, today: date) -> tuple[date, date]:
    """Calculate (period_start, period_end) for a project's current billing cycle."""
    period = getattr(project, "billing_period", None) or "monthly"
    day = getattr(project, "billing_day_of_period", None) or 3
    custom_days = getattr(project, "custom_period_days", None)

    if period == "monthly":
        prev = today - relativedelta(months=1)
        period_end = prev.replace(day=days_in_month(prev.year, prev.month))
        period_start = period_end.replace(day=1)
        return period_start, period_end

    elif period == "bimonthly":
        period_end = today - timedelta(days=1)
        period_start = (today - relativedelta(months=2)).replace(day=day)
        return period_start, period_end

    elif period == "quarterly":
        period_end = today - timedelta(days=1)
        period_start = today - relativedelta(months=3)
        return period_start, period_end

    elif period in ("weekly", "biweekly", "custom"):
        if period == "weekly":
            delta = timedelta(days=7)
        elif period == "biweekly":
            delta = timedelta(days=14)
        else:
            delta = timedelta(days=(custom_days or 30))
        period_end = today - timedelta(days=1)
        period_start = today - delta
        return period_start, period_end

    # fallback: last calendar month
    prev = today - relativedelta(months=1)
    period_end = prev.replace(day=days_in_month(prev.year, prev.month))
    return period_end.replace(day=1), period_end
