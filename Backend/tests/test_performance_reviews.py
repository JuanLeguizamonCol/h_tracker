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


def test_reviewee_doesnt_see_scores_until_completed(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    svc.update_review(db, review, {"scores": _scores({"written_1": 4})})
    as_employee = svc.serialize(db, [review], "emp", False)[0]
    assert as_employee["scores"] == {} and as_employee["overall_average"] is None
    assert as_employee["reviewer_section_visible"] is False
    assert svc.serialize(db, [review], "mgr", False)[0]["overall_average"] == 4.0

    svc.transition_review(db, review, "complete")
    assert svc.serialize(db, [review], "emp", False)[0]["overall_average"] == 4.0


def test_xlsx_export_layout(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    svc.update_review(db, review, {
        "scores": _scores(SAMPLE_SCORES),
        "self_strengths": "Excel skills",
        "reviewer_strengths_notes": "Technically sound",
    })
    data = svc.review_export_data(db, review)
    ws = load_workbook(BytesIO(generate_performance_review_xlsx(data))).active

    assert export_filename(data) == "THERAPAK, LLC - Michael Franz - 2025.xlsx"
    assert ws["B6"].value == "Franz, Michael"
    assert ws["B8"].value == "Brandon Beal"
    assert ws["B11"].value == "296 hours"
    assert ws["B12"].value == "12/15/2025"
    assert [ws[f"D{r}"].value for r in range(7, 13)] == [3.0, 3.25, 2.8, 3.0, 2.75, 2.96]
    assert ws["B14"].value == "Excel skills" and ws["D14"].value == "Technically sound"
    assert ws["A19"].value == "Written Communications" and ws["C19"].value == 3.0
    assert ws["C20"].value is None and ws["C21"].value == 3
    assert ws["A43"].value == "Overall Professionalism and Core Values" and ws["C43"].value == 2.75
    assert ws["C44"].value == 2
