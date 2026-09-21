"""Managed Services breakdown for an invoice — the data behind the panel shown
in the invoice editor for projects marked Managed Services.

Per role: the minimum-hours package (min hours x the role's hourly rate), the
hours actually worked (from the invoice's lines), how many of those exceed the
minimum, and — for roles with "additional hours" enabled — what those extra
hours amount to at the separate additional-hours rate. Informational: it shows
how the package and the extra hours split; the invoice's billed total is still
the one on the invoice itself.
"""


def build_managed_services_breakdown(roles: list, lines: list[dict], fees: list) -> dict:
    """roles: ProjectRole rows; lines: edit-data lines (role_id, hours);
    fees: InvoiceFee rows already on the invoice."""
    worked_by_role: dict[str, float] = {}
    for ln in lines:
        rid = ln.get("role_id")
        if rid:
            worked_by_role[rid] = worked_by_role.get(rid, 0.0) + float(ln.get("hours") or 0)

    rows = []
    for r in roles:
        min_on = bool(r.min_hours_enabled) and r.min_hours is not None
        worked = worked_by_role.get(r.id, 0.0)
        if not min_on and worked <= 0:
            continue  # role plays no part in this invoice
        rate = float(r.hourly_rate_usd or 0)
        min_hours = float(r.min_hours) if min_on else None
        over = max(0.0, worked - min_hours) if min_on else 0.0
        add_on = bool(r.additional_hours_enabled) and r.additional_hours_rate is not None
        add_rate = float(r.additional_hours_rate) if add_on else None
        rows.append({
            "role_id": r.id,
            "role_name": r.name,
            "hourly_rate": rate,
            "min_hours": min_hours,
            "package_amount": (min_hours or 0.0) * rate,
            "worked_hours": worked,
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
        "additional_total": sum(x["additional_amount"] for x in rows),
        "additional_fees": additional_fees,
    }
