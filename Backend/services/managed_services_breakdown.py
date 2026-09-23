"""Managed Services breakdown for an invoice â€” the data behind the panel shown
in the invoice editor for projects marked Managed Services.

Per role: the minimum-hours package (the minimum, measured weekly / monthly /
per period — see services/managed_services_calc — x the role's hourly rate), the
hours actually worked (from the invoice's lines), how many of those exceed the
minimum, and â€” for roles with "additional hours" enabled â€” what those extra
hours amount to at the separate additional-hours rate. Informational: it shows
how the package and the extra hours split; the invoice's billed total is still
the one on the invoice itself.
"""
from services.managed_services_calc import compute_role_billing


def role_entries_by_role(
    linked_entries, lines: list[dict], saved_weeks_by_line: dict | None = None,
) -> dict[str, list]:
    """Spread each employee's hours onto their line's role, as dated
    (date, hours) entries for services/managed_services_calc.py's weekly/
    monthly bucketing. A line with saved weekly edits (see
    services/invoice_time_detail.py) uses those directly — they're the exact
    billed split. Every other line falls back to spreading its linked time
    entries, scaled so the role's total matches the hours actually billed on
    the line (hours on hold are already out of the line's hours)."""
    saved_weeks_by_line = saved_weeks_by_line or {}
    out: dict[str, list] = {}

    lines_with_saved_weeks = {ln["id"] for ln in lines if saved_weeks_by_line.get(ln["id"])}
    for ln in lines:
        if ln["id"] in lines_with_saved_weeks and ln.get("role_id"):
            for w in saved_weeks_by_line[ln["id"]]:
                out.setdefault(ln["role_id"], []).append((w["week_start"], float(w["hours"])))

    users_covered = {ln["user_id"] for ln in lines if ln["id"] in lines_with_saved_weeks}
    line_by_user = {ln["user_id"]: ln for ln in lines if ln.get("user_id") and ln.get("role_id")}
    for user_id, d, h in linked_entries:
        if user_id in users_covered:
            continue  # already covered by that line's saved weeks, above
        ln = line_by_user.get(user_id)
        if not ln:
            continue
        orig = float(ln.get("original_hours") or 0)
        scale = float(ln.get("hours") or 0) / orig if orig else 1.0
        out.setdefault(ln["role_id"], []).append((d, float(h or 0) * scale))
    return out


def build_managed_services_breakdown(
    roles: list, lines: list[dict], fees: list,
    entries_by_role: dict | None = None, period_start=None, period_end=None,
    overrides: dict | None = None,
) -> dict:
    """roles: ProjectRole rows; lines: edit-data lines (role_id, hours);
    fees: InvoiceFee rows already on the invoice; overrides: role_id ->
    InvoiceRoleMinimum (per-invoice min/basis edits)."""
    entries_by_role = entries_by_role or {}
    overrides = overrides or {}
    worked_by_role: dict[str, float] = {}
    for ln in lines:
        rid = ln.get("role_id")
        if rid:
            worked_by_role[rid] = worked_by_role.get(rid, 0.0) + float(ln.get("hours") or 0)

    rows = []
    for r in roles:
        ov = overrides.get(r.id)
        if ov is not None:
            cfg_min = float(ov.min_hours) if ov.min_hours is not None else None
            basis = ov.basis
        else:
            cfg_min = float(r.min_hours) if r.min_hours_enabled and r.min_hours is not None else None
            basis = r.min_hours_basis or "period"
        worked_lines = worked_by_role.get(r.id, 0.0)
        if cfg_min is None and worked_lines <= 0:
            continue  # role plays no part in this invoice
        rate = float(r.hourly_rate_usd or 0)
        entries = entries_by_role.get(r.id)
        if entries is None or not entries:
            # No dated entries (manual lines / legacy): treat the lines' hours as one lump.
            entries = [(period_end, worked_lines)] if worked_lines and period_end else []
        calc = compute_role_billing(entries, period_start, period_end, cfg_min, basis)
        worked = calc["worked_hours"] if entries else worked_lines
        minimum_total = calc["minimum_total"]
        billed = calc["billed_hours"] if entries or cfg_min is not None else worked
        over = max(0.0, billed - minimum_total) if cfg_min is not None else 0.0
        add_on = bool(r.additional_hours_enabled) and r.additional_hours_rate is not None
        add_rate = float(r.additional_hours_rate) if add_on else None
        rows.append({
            "role_id": r.id,
            "role_name": r.name,
            "hourly_rate": rate,
            "min_hours": cfg_min,
            "min_hours_basis": basis,
            "minimum_total": minimum_total,
            "package_amount": minimum_total * rate,
            "worked_hours": worked,
            "billed_hours": billed,
            "billed_amount": billed * rate,
            "hours_over_min": over,
            "additional_rate": add_rate,
            "additional_amount": over * add_rate if add_on else 0.0,
        })
    rows.sort(key=lambda x: x["role_name"].casefold())

    additional_fees = [
        {
            "label": f.label,
            "quantity": float(f.quantity),
            "unit_price": float(f.unit_price_usd),
            "total": float(f.fee_total),
        }
        for f in fees if (f.label or "").startswith("Additional Hours")
    ]
    return {
        "roles": rows,
        "package_total": sum(x["package_amount"] for x in rows),
        "billed_total": sum(x["billed_amount"] for x in rows),
        "additional_total": sum(x["additional_amount"] for x in rows),
        "additional_fees": additional_fees,
    }
