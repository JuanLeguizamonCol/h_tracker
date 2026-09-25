from datetime import date

import pytest

from services.fixed_fee_calc import compute_fixed_fee as f


def test_project_bills_once():
    assert f(9000, "project", None, None) == {"total": 9000.0, "units": 1.0}


def test_weekly_counts_every_week_touched_unprorated():
    # Wed 2 Sep .. Wed 16 Sep touches three Mon-Sun weeks
    assert f(2500, "week", date(2026, 9, 2), date(2026, 9, 16))["total"] == 7500.0


def test_monthly_is_prorated_by_days():
    assert f(3000, "month", date(2026, 9, 1), date(2026, 9, 20))["total"] == 2000.0
    assert f(3000, "month", date(2026, 9, 1), date(2026, 9, 30))["total"] == 3000.0


def test_split_monthly_invoices_add_up():
    a = f(3000, "month", date(2026, 9, 1), date(2026, 9, 12))["total"]
    b = f(3000, "month", date(2026, 9, 13), date(2026, 9, 30))["total"]
    assert abs(a + b - 3000) < 0.02


def test_weekly_or_monthly_needs_a_period():
    with pytest.raises(ValueError):
        f(1, "week", None, None)
    with pytest.raises(ValueError):
        f(1, "month", date(2026, 9, 5), date(2026, 9, 1))


def test_unknown_period_rejected():
    with pytest.raises(ValueError):
        f(1, "year", None, None)
