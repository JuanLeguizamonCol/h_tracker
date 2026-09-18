"""Weekly time detail ("Attachment II — Time Detail") for an invoice.

One row per (professional, week): the hours that professional logged that
week on the time entries linked to the invoice, priced with the rate and
discount of their invoice line. Rendered in the invoice editor and as its own
page(s) of the PDF, separate from the fees summary.
"""
from datetime import date, timedelta
from typing import Iterable


def week_start(d: date) -> date:
    """Monday of the week containing `d`."""
    return d - timedelta(days=d.weekday())


def build_time_detail(entries: Iterable[tuple], lines: list[dict]) -> list[dict]:
    """
    entries: (user_id, date, hours) of the time entries linked to the invoice.
    lines:   the invoice lines as built by routers/invoice.py::_build_edit_data
             (user_id, employee_name, title, hours, hourly_rate,
             discount_type, discount_value).

    The line is the source of truth for what was billed — an admin can lower a
    line's hours (e.g. holding some back) after the entries were linked. Weekly
    hours are therefore scaled by billed/linked hours so the detail always adds
    up to the same hours, subtotal and discount as the fees summary. Entries of
    a professional with no line (their line was removed) aren't billed and
    don't appear.
    """
    linked: dict[str, dict[date, float]] = {}
    for user_id, entry_date, hours in entries:
        weeks = linked.setdefault(user_id, {})
        ws = week_start(entry_date)
        weeks[ws] = weeks.get(ws, 0.0) + float(hours)

    billed: dict[str, dict] = {}
    for ln in lines:
        uid = ln.get("user_id")
        if not uid:
            continue
        hours = float(ln.get("hours") or 0)
        rate = float(ln.get("hourly_rate") or 0)
        subtotal = hours * rate
        disc_val = float(ln.get("discount_value") or 0)
        discount = subtotal * disc_val / 100 if ln.get("discount_type") == "percent" else disc_val
        b = billed.setdefault(uid, {
            "name": ln.get("employee_name") or "—", "title": ln.get("title"),
            "hours": 0.0, "subtotal": 0.0, "discount": 0.0, "first_rate": rate,
        })
        b["hours"] += hours
        b["subtotal"] += subtotal
        b["discount"] += discount

    rows: list[dict] = []
    for uid, weeks in linked.items():
        b = billed.get(uid)
        if not b:
            continue
        linked_total = sum(weeks.values())
        if linked_total <= 0:
            continue
        scale = b["hours"] / linked_total
        rate = b["subtotal"] / b["hours"] if b["hours"] > 0 else b["first_rate"]
        for ws, raw_hours in weeks.items():
            hours = raw_hours * scale
            subtotal = hours * rate
            discount = b["discount"] * hours / b["hours"] if b["hours"] > 0 else 0.0
            rows.append({
                "week_start": ws,
                "user_id": uid,
                "employee_name": b["name"],
                "title": b["title"],
                "hourly_rate": rate,
                "hours": hours,
                "subtotal": subtotal,
                "discount": discount,
                "total": max(0.0, subtotal - discount),
            })

    # Grouped by professional (A→Z), each one's weeks in chronological order.
    rows.sort(key=lambda r: (r["employee_name"].casefold(), r["user_id"], r["week_start"]))
    return rows
