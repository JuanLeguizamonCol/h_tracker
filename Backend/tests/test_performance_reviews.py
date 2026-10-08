"""Project performance reviews — services/performance_reviews.py and the
.xlsx export. The sample numbers are the THERAPAK / Michael Franz 2025 review
workbook this format was copied from (category averages 3 / 3.25 / 2.8 / 3 /
2.75, overall 2.96)."""
from datetime import date
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.clients import Client
from models.employees import Employee
from models.projects import Project
from models.time_entries import TimeEntry
from schemas.performance_reviews import PerformanceReviewCreate
from services import performance_reviews as svc
from services.export_performance_review import generate_performance_review_xlsx, export_filename

SAMPLE_SCORES = {
    "written_2": 3, "written_3": 3, "written_4": 3,
    "verbal_1": 4, "verbal_2": 3, "verbal_3": 3, "verbal_5": 3,
    "analysis_1": 2, "analysis_2": 3, "analysis_3": 3, "analysis_4": 3, "analysis_5": 3,
    "client_1": 2, "client_2": 3, "client_3": 4, "client_4": 3,
    "professionalism_1": 2, "professionalism_2": 3, "professionalism_3": 3, "professionalism_4": 3,
}


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        Employee(id="emp", user_id="emp", name="Michael Franz", email="m@x.com", first_name="Michael", last_name="Franz"),
        Employee(id="mgr", user_id="mgr", name="Brandon Beal", email="b@x.com"),
        Client(id="cli", name="THERAPAK, LLC"),
    ])
    session.flush()
    session.add(Project(id="prj", client_id="cli", name="THERAPAK LLC", manager_id="mgr", description="Cash flow model"))
    session.flush()
    session.add_all([
        TimeEntry(id="t1", user_id="emp", project_id="prj", date=date(2025, 3, 1), hours=200),
        TimeEntry(id="t2", user_id="emp", project_id="prj", date=date(2025, 9, 1), hours=96),
        TimeEntry(id="t3", user_id="mgr", project_id="prj", date=date(2025, 9, 1), hours=50),
    ])
    session.commit()
    yield session
    session.close()


def _scores(raw):
    return {k: {"score": v, "notes": None} for k, v in raw.items()}


def test_averages_match_the_sample_workbook():
    criteria, overall = svc.compute_averages(_scores(SAMPLE_SCORES))
    assert [c["average"] for c in criteria] == [3.0, 3.25, 2.8, 3.0, 2.75]
    assert overall == 2.96


def test_unrated_criteria_are_skipped_not_zeroed():
    criteria, overall = svc.compute_averages(_scores({"written_1": 4, "verbal_1": 2}))
    assert [c["average"] for c in criteria] == [4.0, 2.0, None, None, None]
    assert overall == 3.0
    assert svc.compute_averages({}) == ([{**c, "average": None} for c in criteria], None)


def test_normalize_scores_validates():
    with pytest.raises(ValueError):
        svc.normalize_scores({"nope": {"score": 3}})
    with pytest.raises(ValueError):
        svc.normalize_scores({"written_1": {"score": 6}})
    assert svc.normalize_scores({"written_1": {"score": None, "notes": "  "}}) == {}
    assert svc.normalize_scores({"written_1": {"score": None, "notes": " ok "}}) == {"written_1": {"score": None, "notes": "ok"}}


def test_create_defaults_reviewer_hours_and_description(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    assert review.reviewer_id == "mgr"
    assert float(review.duration_hours) == 296
    assert review.project_description == "Cash flow model"
    assert review.status == "self_assessment"

    scoped = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        period_start=date(2025, 6, 1), period_end=date(2025, 12, 31),
    ), "mgr")
    assert float(scoped.duration_hours) == 96


def _visible(db, review, viewer, manage=False):
    out = svc.serialize(db, [review], viewer, manage)[0]
    return {k: v["visible"] for k, v in out["evaluations"].items()}, out


def test_self_and_manager_are_blind_until_joint(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "x")
    svc.update_review(db, review, {"self_scores": _scores({"written_1": 5}), "self_strengths": "Excel"})
    vis, out = _visible(db, review, "emp")
    assert vis == {"self": True, "manager": False, "joint": False}
    vis, out = _visible(db, review, "mgr")
    assert vis == {"self": False, "manager": True, "joint": False}
    assert out["self_strengths"] is None  # not submitted yet

    svc.transition_review(db, review, "submit_self")
    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 3, "verbal_1": 4})})
    vis, out = _visible(db, review, "mgr")
    assert vis["self"] is False and out["self_strengths"] == "Excel"
    vis, out = _visible(db, review, "emp")
    assert vis["manager"] is False and out["evaluations"]["manager"]["scores"] == {}
    assert out["overall_average"] is None

    svc.transition_review(db, review, "submit_manager")
    # Joint starts from the manager's scores.
    assert {k: v["score"] for k, v in review.joint_scores.items()} == {"written_1": 3, "verbal_1": 4}
    vis, out = _visible(db, review, "emp")
    assert vis == {"self": True, "manager": True, "joint": True}
    assert out["overall_average"] == 3.5  # joint only
    assert out["evaluations"]["self"]["overall_average"] == 5.0


def test_editable_fields_follow_the_stage(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "x")
    assert "self_scores" in svc.editable_fields(review, "emp", False)
    assert svc.editable_fields(review, "mgr", False) == svc.REVIEWER_FIELDS  # in parallel
    svc.transition_review(db, review, "submit_self")
    assert svc.editable_fields(review, "emp", False) == set()
    assert svc.editable_fields(review, "mgr", False) == svc.REVIEWER_FIELDS
    svc.transition_review(db, review, "submit_manager")
    assert svc.editable_fields(review, "mgr", False) == svc.JOINT_FIELDS
    svc.transition_review(db, review, "complete")
    assert svc.editable_fields(review, "mgr", False) == set()
    assert svc.editable_fields(review, "anyone", True) == svc.ADMIN_FIELDS


def test_analytics_uses_completed_reviews_only(db):
    done = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "x")
    svc.update_review(db, done, {
        "self_scores": _scores({"written_1": 5}),
        "manager_scores": _scores({"written_1": 3}),
        "joint_scores": _scores({"written_1": 4}),
    })
    done.status = "completed"
    db.commit()
    svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2026, 1, 15)), "x")

    data = svc.analytics(db, 2025)
    assert data["years"] == [2025]
    assert len(data["reviews"]) == 1
    row = data["reviews"][0]
    assert (row["self"]["overall"], row["manager"]["overall"], row["joint"]["overall"]) == (5.0, 3.0, 4.0)
    assert row["joint"]["items"] == {"written_1": 4}
    assert svc.analytics(db, 2026)["reviews"] == []


def test_xlsx_export_layout(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    svc.update_review(db, review, {
        "joint_scores": _scores(SAMPLE_SCORES),
        "manager_scores": _scores({"written_1": 2}),
        "self_strengths": "Excel skills",
        "reviewer_strengths_notes": "Technically sound",
        "joint_notes": "Agreed",
    })
    data = svc.review_export_data(db, review)
    wb = load_workbook(BytesIO(generate_performance_review_xlsx(data)))
    assert wb.sheetnames == ["Joint", "Manager", "Self"]
    ws = wb["Joint"]

    assert export_filename(data) == "THERAPAK, LLC - Michael Franz - 2025.xlsx"
    assert ws["B6"].value == "Franz, Michael"
    assert ws["B8"].value == "Brandon Beal"
    assert ws["B11"].value == "296 hours"
    assert ws["B12"].value == "12/15/2025"
    assert [ws[f"D{r}"].value for r in range(7, 13)] == [3.0, 3.25, 2.8, 3.0, 2.75, 2.96]
    assert ws["B14"].value == "Excel skills" and ws["D14"].value == "Technically sound"
    assert ws["B17"].value == "Agreed"
    assert ws["A19"].value == "Written Communications" and ws["C19"].value == 3.0
    assert ws["C20"].value is None and ws["C21"].value == 3
    assert ws["A43"].value == "Overall Professionalism and Core Values" and ws["C43"].value == 2.75
    assert ws["C44"].value == 2

    assert wb["Manager"]["C20"].value == 2 and wb["Manager"]["D12"].value == 2.0
    assert wb["Self"]["D12"].value is None and wb["Self"]["B17"].value is None


def test_reviewer_never_defaults_to_the_reviewee(db):
    # The project manager being reviewed falls through to the owner (none here).
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="mgr", review_date=date(2025, 12, 15)), "mgr")
    assert review.reviewer_id is None


def test_projects_panel_and_team(db):
    from models.employee_projects import EmployeeProject
    db.add(EmployeeProject(id="ep1", user_id="emp", project_id="prj"))
    db.add(Project(id="int", client_id="cli", name="Internal", is_internal=True))
    db.commit()

    panel = svc.list_review_projects(db)
    assert [p["id"] for p in panel] == ["prj"]  # internal projects excluded
    assert panel[0]["performance_review_enabled"] is False and panel[0]["team_size"] == 1

    svc.set_project_review_enabled(db, db.get(Project, "prj"), True)
    svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    panel = svc.list_review_projects(db)
    assert panel[0]["performance_review_enabled"] is True
    assert (panel[0]["reviews_total"], panel[0]["reviews_self_assessment"]) == (1, 1)

    team = {m["employee_id"]: m for m in svc.project_team(db, "prj")}
    # Assigned employee + someone who only logged time.
    assert set(team) == {"emp", "mgr"}
    assert team["emp"]["is_assigned"] and not team["mgr"]["is_assigned"]
    assert team["emp"]["logged_hours"] == 296 and team["mgr"]["logged_hours"] == 50
    assert len(team["emp"]["reviews"]) == 1 and team["mgr"]["reviews"] == []
    assert svc.has_open_review(db, "prj", "emp") and not svc.has_open_review(db, "prj", "mgr")
