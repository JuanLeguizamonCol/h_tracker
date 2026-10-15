"""Reports › Performance tab — services/employee_performance.py, on a
throwaway in-memory sqlite DB."""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.clients import Client
from models.employees import Employee
from models.performance_reviews import PerformanceReview, PerformanceReviewReviewer
from models.projects import Project
from models.pto_requests import PtoRequest
from models.time_entries import TimeEntry
from services.employee_performance import employee_performance, default_window, build_months

TODAY = date(2026, 10, 12)


def _scores(raw):
    return {k: {"score": v, "notes": None} for k, v in raw.items()}


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        Employee(id="ana", user_id="ana", name="Ana", email="a@x.com", max_weekly_hours=40),
        Employee(id="new", user_id="new", name="Newbie", email="n@x.com", start_date=date(2026, 9, 1)),
        Employee(id="gone", user_id="gone", name="Gone", email="g@x.com", is_active=False),
        Employee(id="old", user_id="old", name="Old", email="o@x.com", is_active=False),
        Client(id="c", name="Acme"),
    ])
    session.flush()
    session.add_all([Project(id="p1", client_id="c", name="Alpha"), Project(id="p2", client_id="c", name="Beta")])
    session.flush()
    session.add_all([
        TimeEntry(id="t1", user_id="ana", project_id="p1", date=date(2026, 8, 3), hours=100, billable=True),
        TimeEntry(id="t2", user_id="ana", project_id="p2", date=date(2026, 9, 7), hours=60, billable=False),
        TimeEntry(id="t3", user_id="ana", project_id="p1", date=date(2026, 10, 5), hours=8, billable=True),   # current month
        TimeEntry(id="t4", user_id="ana", project_id="p1", date=date(2025, 1, 5), hours=999, billable=True),  # outside window
        TimeEntry(id="t5", user_id="new", project_id="p1", date=date(2026, 9, 8), hours=120, billable=True),
        TimeEntry(id="t6", user_id="gone", project_id="p2", date=date(2026, 2, 2), hours=10, billable=True),
        PtoRequest(id="pto", user_id="ana", category="vacation", start_date=date(2026, 7, 6), end_date=date(2026, 7, 10), hours=40, status="approved"),
        PtoRequest(id="pto2", user_id="ana", category="vacation", start_date=date(2026, 7, 13), end_date=date(2026, 7, 13), hours=8, status="pending"),
        PerformanceReview(id="r1", project_id="p1", employee_id="ana", review_date=date(2026, 9, 30), status="completed",
                          self_scores=_scores({"written_1": 5}), joint_scores=_scores({"written_1": 4})),
        PerformanceReview(id="r2", project_id="p2", employee_id="ana", review_date=date(2026, 10, 1), status="completed",
                          self_scores={}, joint_scores=_scores({"written_1": 3})),
        PerformanceReview(id="r3", project_id="p2", employee_id="ana", review_date=date(2026, 10, 2), status="in_review",
                          self_scores={}, joint_scores={}),
    ])
    session.flush()
    session.add(PerformanceReviewReviewer(id="rr1", review_id="r1", reviewer_id="new", scores=_scores({"written_1": 3})))
    session.commit()
    yield session
    session.close()


def test_default_window_is_current_month_plus_previous_eleven():
    assert default_window(TODAY) == (date(2025, 11, 1), date(2026, 10, 31))
    months = build_months(*default_window(TODAY), TODAY)
    assert len(months) == 12 and months[0]["key"] == "2025-11" and months[-1]["key"] == "2026-10"
    assert [m["complete"] for m in months].count(False) == 1  # only the running month


def test_employee_rows(db):
    data = employee_performance(db, *default_window(TODAY), TODAY)
    rows = {r["employee_id"]: r for r in data["employees"]}
    # Active employees + inactive ones with activity in the window.
    assert set(rows) == {"ana", "new", "gone"}

    ana = rows["ana"]
    assert ana["total_hours"] == 168 and ana["billable_hours"] == 108
    assert ana["monthly"]["2026-10"] == {"total": 8, "billable": 8}
    # Average over the 11 complete months only (the running month is excluded).
    assert ana["avg_monthly_hours"] == round(160 / 11, 2)
    assert ana["billable_pct"] == round(108 / 168 * 100, 1)
    assert ana["projects_count"] == 2
    assert ana["pto_hours"] == 40  # approved only
    assert ana["reviews_count"] == 2 and ana["review_score"] == 3.5  # joint only
    assert ana["self_manager_gap"] == 2.0
    assert ana["open_reviews"] == 1

    # Started in September → averaged over Sep only (Oct is still running).
    assert rows["new"]["avg_monthly_hours"] == 120
    sep_capacity = 40 * 22 / 5
    assert rows["new"]["utilization_pct"] == round(120 / sep_capacity * 100, 1)


def test_project_rollup(db):
    data = employee_performance(db, *default_window(TODAY), TODAY)
    by_id = {p["project_id"]: p for p in data["projects"]}
    assert by_id["p1"]["joint_avg"] == 4.0 and by_id["p1"]["self_avg"] == 5.0 and by_id["p1"]["manager_avg"] == 3.0
    assert by_id["p1"]["hours_in_window"] == 108
    assert by_id["p2"]["joint_avg"] == 3.0 and by_id["p2"]["self_avg"] is None
    assert [p["project_id"] for p in data["projects"]] == ["p1", "p2"]  # best score first
