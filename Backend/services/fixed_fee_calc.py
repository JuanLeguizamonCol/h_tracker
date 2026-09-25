"""Fixed-fee pricing for an invoice period.

'project' bills the amount once. 'week' bills it for every Mon-Sun week the
period touches (a week is never prorated — a weekly rate is a weekly rate).
'month' bills it per calendar month, prorated by the days of that month that
fall inside the period, so 1-20 Sep at $3,000/month bills 20/30 of it and
consecutive invoices add up to the same total as one long one. Same week/month
buckets as Managed Services minimums (services/managed_services_calc.py).
"""
from datetime import date
from typing import Optional

from services.managed_services_calc import _buckets

PERIODS = ("project", "week", "month")


def compute_fixed_fee(
    unit_amount: float, period: str, period_start: Optional[date], period_end: Optional[date]
) -> dict:
    """Returns {"total", "units"}: units is 1 for 'project', the number of weeks
    for 'week' and the (possibly fractional) number of months for 'month'.
    Raises ValueError when a week/month fee has no usable period."""
    if period not in PERIODS:
        raise ValueError(f"Fixed fee period must be one of: {', '.join(PERIODS)}")
    amount = float(unit_amount or 0)
    if period == "project":
        return {"total": round(amount, 2), "units": 1.0}
    if period_start is None or period_end is None:
        raise ValueError("Select the first and last day to bill for a weekly or monthly fixed fee.")
    if period_end < period_start:
        raise ValueError("The period's end date is before its start date.")
    buckets = list(_buckets(period_start, period_end, period))
    units = float(len(buckets)) if period == "week" else sum(fraction for _, _, fraction in buckets)
    return {"total": round(amount * units, 2), "units": round(units, 4)}
