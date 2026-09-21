from datetime import date
from services.managed_services_calc import compute_role_billing as c


def test_weekly_floor_applies_per_week():
    # Mon 2026-08-03..Sun 2026-08-16 = 2 full weeks, min 10/wk; 15h in wk1, 2h in wk2
    e = [(date(2026, 8, 4), 15), (date(2026, 8, 12), 2)]
    r = c(e, date(2026, 8, 3), date(2026, 8, 16), 10, "week")
    assert r["billed_hours"] == 25 and r["worked_hours"] == 17 and r["minimum_total"] == 20


def test_period_is_single_floor():
    e = [(date(2026, 8, 4), 15), (date(2026, 8, 12), 2)]
    assert c(e, date(2026, 8, 3), date(2026, 8, 16), 10, "period")["billed_hours"] == 17
    assert c([], date(2026, 8, 3), date(2026, 8, 16), 10, "period")["billed_hours"] == 10


def test_partial_week_is_prorated():
    # Wed..Sun of one week = 5 days of 7
    r = c([], date(2026, 8, 5), date(2026, 8, 9), 14, "week")
    assert abs(r["billed_hours"] - 10) < 1e-9


def test_month_basis_full_month():
    r = c([(date(2026, 8, 10), 40)], date(2026, 8, 1), date(2026, 8, 31), 60, "month")
    assert r["billed_hours"] == 60


def test_no_minimum():
    assert c([(date(2026, 8, 10), 3)], None, None, None, "week")["billed_hours"] == 3


def test_split_invoices_add_up():
    a = c([], date(2026, 8, 3), date(2026, 8, 5), 14, "week")["billed_hours"]
    b = c([], date(2026, 8, 6), date(2026, 8, 9), 14, "week")["billed_hours"]
    assert abs(a + b - 14) < 1e-9


def test_breakdown_weekly_override():
    from types import SimpleNamespace as N
    from services.managed_services_breakdown import build_managed_services_breakdown, role_entries_by_role
    role = N(id="r1", name="Dir", hourly_rate_usd=100, min_hours_enabled=True, min_hours=10,
             min_hours_basis="period", additional_hours_enabled=False, additional_hours_rate=None)
    lines = [{"user_id": "u1", "role_id": "r1", "hours": 17, "original_hours": 17}]
    entries = [("u1", date(2026, 8, 4), 15), ("u1", date(2026, 8, 12), 2)]
    by_role = role_entries_by_role(entries, lines)
    args = ([role], lines, [], by_role, date(2026, 8, 3), date(2026, 8, 16))
    assert build_managed_services_breakdown(*args)["billed_total"] == 1700  # period floor 10 < 17
    ov = {"r1": N(min_hours=10, basis="week")}
    r = build_managed_services_breakdown(*args, overrides=ov)
    assert r["billed_total"] == 2500 and r["roles"][0]["hours_over_min"] == 5
