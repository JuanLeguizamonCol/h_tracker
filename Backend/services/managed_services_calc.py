"""Minimum-hours math for Managed Services roles.

A role's minimum is measured per *bucket*: each Mon–Sun week ('week'), each
calendar month ('month') or the whole invoice period ('period'). A bucket bills
max(hours worked in it, its minimum). Buckets only partly inside the invoice
period get the minimum prorated by the days that fall inside it, so consecutive
invoices add up to the same floor as one long one.
"""
import calendar
from datetime import date, timedelta

BASES = ("week", "month", "period")


def _buckets(start: date, end: date, basis: str):
    """Yield (bucket_start, bucket_end, fraction_of_bucket_inside_period)."""
    if basis == "period":
        yield start, end, 1.0
        return
    cur = start
    while cur <= end:
        if basis == "week":
            b_start = cur - timedelta(days=cur.weekday())
            b_end = b_start + timedelta(days=6)
        else:
            b_start = cur.replace(day=1)
            b_end = cur.replace(day=calendar.monthrange(cur.year, cur.month)[1])
        inside_end = min(b_end, end)
        inside_days = (inside_end - cur).days + 1
        yield cur, inside_end, inside_days / ((b_end - b_start).days + 1)
        cur = inside_end + timedelta(days=1)


def compute_role_billing(entries, period_start, period_end, min_hours, basis) -> dict:
    """entries: iterable of (date, hours) for the role. Returns worked / billed
    hours plus the effective total minimum across the period's buckets."""
    entries = [(d, float(h or 0)) for d, h in entries if d is not None]
    worked = sum(h for _, h in entries)
    if min_hours is None:
        return {"worked_hours": worked, "billed_hours": worked, "minimum_total": 0.0}
    if basis not in BASES:
        basis = "period"
    if period_start is None or period_end is None:
        if not entries:
            basis = "period"
        else:
            period_start = min(d for d, _ in entries)
            period_end = max(d for d, _ in entries)
    if basis == "period":
        m = float(min_hours)
        return {"worked_hours": worked, "billed_hours": max(worked, m), "minimum_total": m}

    billed = minimum_total = 0.0
    for b_start, b_end, frac in _buckets(period_start, period_end, basis):
        w = sum(h for d, h in entries if b_start <= d <= b_end)
        m = float(min_hours) * frac
        billed += max(w, m)
        minimum_total += m
    return {"worked_hours": worked, "billed_hours": billed, "minimum_total": minimum_total}
