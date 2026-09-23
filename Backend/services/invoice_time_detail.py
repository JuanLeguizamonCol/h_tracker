"""Weekly time detail ("Attachment II — Time Detail") for an invoice.

One row per (professional, week): the hours billed to that professional that
week, priced at their invoice line's rate. Rendered — and directly editable —
in the invoice editor's "Time Detail" panel, and printed as its own page(s)
of the PDF, separate from the fees summary.
"""
from datetime import date, timedelta
from typing import Iterable, Optional


def week_start(d: date) -> date:
    """Monday of the week containing `d`."""
    return d - timedelta(days=d.weekday())


def _discount_dollars(subtotal: float, discount_type: str, discount_value: float) -> float:
    return subtotal * discount_value / 100 if discount_type == "percent" else discount_value


def build_time_detail(
    entries: Iterable[tuple],
    lines: list[dict],
    saved_weeks_by_line: Optional[dict[str, list[dict]]] = None,
    fallback_week: Optional[date] = None,
) -> list[dict]:
    """
    entries: (user_id, date, hours) of the time entries linked to the invoice
             — only used to derive a starting weekly split for a line that
             hasn't been edited yet (no rows in `saved_weeks_by_line`).
    lines:   edit-data lines (id, user_id, employee_name, title, hours,
             hourly_rate, discount_type, discount_value).
    saved_weeks_by_line: invoice_line_id -> [{week_start, hours,
             discount_type, discount_value}, ...] — rows already edited and
             saved via PATCH /invoices/{id} (`time_detail_weeks`). Once a
             line has any, they ARE its hours/discount, not just a display
             of them — see routers/invoice.py::patch_invoice.
    fallback_week: used as the single week for a line that has neither saved
             rows nor any linked time entries to split by (e.g. a manually
             raised line) — normally the invoice's own period.

    Every row carries its `line_id`, since edits are written back keyed by
    line, not by (user_id, week) — a professional could in principle have two
    lines on one invoice.
    """
    saved_weeks_by_line = saved_weeks_by_line or {}

    linked: dict[str, dict[date, float]] = {}
    for user_id, entry_date, hours in entries:
        weeks = linked.setdefault(user_id, {})
        ws = week_start(entry_date)
        weeks[ws] = weeks.get(ws, 0.0) + float(hours)

    rows: list[dict] = []
    for ln in lines:
        line_id = ln.get("id")
        uid = ln.get("user_id")
        rate = float(ln.get("hourly_rate") or 0)
        name = ln.get("employee_name") or "—"
        title = ln.get("title")

        saved = saved_weeks_by_line.get(line_id)
        if saved:
            for w in saved:
                hours = float(w["hours"])
                subtotal = hours * rate
                d_type = w.get("discount_type") or "amount"
                d_value = float(w.get("discount_value") or 0)
                discount = _discount_dollars(subtotal, d_type, d_value)
                rows.append({
                    "line_id": line_id, "week_start": w["week_start"], "user_id": uid,
                    "employee_name": name, "title": title, "hourly_rate": rate,
                    "hours": hours, "subtotal": subtotal,
                    "discount_type": d_type, "discount_value": d_value,
                    "discount": discount, "total": max(0.0, subtotal - discount),
                })
            continue

        # No saved weeks yet — derive a starting split from the linked time
        # entries, scaled so it always adds up to exactly what's billed on
        # the line (an admin can raise/lower a line's hours after the
        # entries were linked — e.g. holding some back, or billing more).
        weeks = linked.get(uid) or {}
        linked_total = sum(weeks.values())
        line_hours = float(ln.get("hours") or 0)
        line_discount_value = float(ln.get("discount_value") or 0)
        line_discount_type = ln.get("discount_type") or "amount"
        line_subtotal = line_hours * rate
        line_discount_dollars = _discount_dollars(line_subtotal, line_discount_type, line_discount_value)

        if linked_total <= 0:
            if line_hours <= 0:
                continue
            # Nothing dated to split by (e.g. an entirely manual line) — one
            # lump row on the fallback week, so it's still visible and
            # editable instead of silently missing from the panel/PDF.
            rows.append({
                "line_id": line_id, "week_start": fallback_week or week_start(date.today()), "user_id": uid,
                "employee_name": name, "title": title, "hourly_rate": rate,
                "hours": line_hours, "subtotal": line_subtotal,
                "discount_type": "amount", "discount_value": line_discount_dollars,
                "discount": line_discount_dollars, "total": max(0.0, line_subtotal - line_discount_dollars),
            })
            continue

        scale = line_hours / linked_total
        for ws, raw_hours in weeks.items():
            hours = raw_hours * scale
            subtotal = hours * rate
            discount = line_discount_dollars * hours / line_hours if line_hours > 0 else 0.0
            rows.append({
                "line_id": line_id, "week_start": ws, "user_id": uid,
                "employee_name": name, "title": title, "hourly_rate": rate,
                "hours": hours, "subtotal": subtotal,
                "discount_type": "amount", "discount_value": discount,
                "discount": discount, "total": max(0.0, subtotal - discount),
            })

    # Grouped by professional (A→Z), each one's weeks in chronological order.
    rows.sort(key=lambda r: (r["employee_name"].casefold(), r["user_id"] or "", r["week_start"]))
    return rows
