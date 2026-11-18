"""Project performance reviews — services/performance_reviews.py and the
.xlsx export. The sample numbers are the THERAPAK / Michael Franz 2025 review
workbook this format was copied from (category averages 3 / 3.25 / 2.8 / 3 /
2.75, overall 2.96)."""
import zipfile
from datetime import date, timedelta
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
from services.export_performance_review import generate_performance_review_xlsx, export_filename, export_reviews_zip

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
        Employee(id="mgr2", user_id="mgr2", name="Casey Diaz", email="c@x.com"),
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


def _reviewer_ids(review):
    return [r.reviewer_id for r in review.reviewers]


def _submit_self_and_score(db, review, scores=None):
    """Helper: self-assessment submitted, then the shared Manager Review scored."""
    svc.transition_review(db, review, "submit_self")
    return svc.update_review(db, review, {"manager_scores": _scores(scores or {"written_1": 3})})


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
    # A bare {score: None, notes: None} is kept, not dropped — it's an
    # explicit N/A (see ScorePicker/naSelected in PerformanceReviewPage.tsx),
    # distinguishable from a sub-criterion the user never touched at all
    # (which never appears in the payload in the first place).
    assert svc.normalize_scores({"written_1": {"score": None, "notes": "  "}}) == {"written_1": {"score": None, "notes": None}}
    assert svc.normalize_scores({"written_1": {"score": None, "notes": " ok "}}) == {"written_1": {"score": None, "notes": "ok"}}


def test_create_defaults_reviewer_hours_description_and_format(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    assert _reviewer_ids(review) == ["mgr"]  # falls back to the project manager
    assert float(review.duration_hours) == 296
    assert review.project_description == "Cash flow model"
    assert review.status == "self_assessment"
    assert review.evaluation_format == "standard"
    assert review.self_due_date is None

    scoped = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        period_start=date(2025, 6, 1), period_end=date(2025, 12, 31),
        self_due_date=date(2026, 1, 1),
    ), "mgr")
    assert float(scoped.duration_hours) == 96
    assert scoped.self_due_date == date(2026, 1, 1)


def test_create_with_multiple_reviewers(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        reviewer_ids=["mgr", "mgr2"],
    ), "mgr")
    assert set(_reviewer_ids(review)) == {"mgr", "mgr2"}
    # The employee themselves is silently dropped if somehow included.
    review2 = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        reviewer_ids=["mgr", "emp"],
    ), "mgr")
    assert _reviewer_ids(review2) == ["mgr"]


def test_evaluation_formats_registry():
    assert svc.EVALUATION_FORMATS == {
        "standard": "Impact Point Standard",
        "seniors_managers": "Seniors and Managers Review",
        "principals_directors": "Principals and Directors Review",
    }


def test_seniors_managers_template_matches_its_workbook():
    tpl = svc.get_template("seniors_managers")
    # Same criteria (keys) as the standard format, its own sub-criteria.
    assert [c["key"] for c in tpl] == [c["key"] for c in svc.REVIEW_TEMPLATE]
    assert [len(c["sub_criteria"]) for c in tpl] == [5, 3, 5, 4, 4]
    assert tpl[0]["sub_criteria"][0][1] == "Ability to build presentation decks, process flows, report writing, etc."
    assert not (svc.sub_criterion_keys("seniors_managers") & svc.SUB_CRITERION_KEYS)
    out = svc.template_out("seniors_managers")
    assert out["format"] == "seniors_managers" and out["format_label"] == "Seniors and Managers Review"
    assert svc.template_out("nope")["format"] == "standard"
    assert svc.template_out(None)["format_label"] == "Impact Point Standard"
    assert svc.get_template(None) is svc.REVIEW_TEMPLATE


def test_scores_are_validated_against_the_reviews_own_format(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        reviewer_ids=["mgr"], evaluation_format="seniors_managers",
    ), "mgr")
    svc.transition_review(db, review, "submit_self")
    with pytest.raises(ValueError):
        svc.update_review(db, review, {"manager_scores": _scores({"written_1": 3})})
    review = svc.update_review(db, review, {"manager_scores": _scores({"md_written_1": 4, "md_verbal_3": 2})})
    out = svc.serialize(db, [review], "mgr", False)[0]
    assert out["evaluation_format"] == "seniors_managers"
    assert out["overall_average"] == 3.0  # (4 + 2) / 2
    # The format is locked once scoring started.
    with pytest.raises(ValueError):
        svc.update_review(db, review, {"evaluation_format": "standard"})


def test_format_can_change_before_scoring_but_not_to_unknown(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "mgr")
    svc.update_review(db, review, {"evaluation_format": "seniors_managers"})
    assert review.evaluation_format == "seniors_managers"
    with pytest.raises(ValueError):
        svc.update_review(db, review, {"evaluation_format": "nope"})


def test_xlsx_export_uses_the_seniors_managers_items(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        reviewer_ids=["mgr"], evaluation_format="seniors_managers",
    ), "mgr")
    svc.update_review(db, review, {"manager_scores": _scores({"md_written_1": 5, "md_verbal_1": 3})})
    data = svc.review_export_data(db, review)
    ws = load_workbook(BytesIO(generate_performance_review_xlsx(data)))["Manager Review"]
    assert ws["A19"].value == "Written Communications" and ws["C19"].value == 5.0
    assert ws["B20"].value.startswith("Ability to build presentation decks") and ws["C20"].value == 5
    assert ws["A25"].value == "Verbal Communications" and ws["C26"].value == 3
    assert ws["A40"].value == "Overall Professionalism and Core Values"


def _visible(db, review, viewer, manage=False):
    out = svc.serialize(db, [review], viewer, manage)[0]
    vis = {
        "self": out["evaluations"]["self"]["visible"],
        "manager": out["evaluations"]["manager"]["visible"],
    }
    return vis, out


def test_self_opens_to_the_reviewer_as_soon_as_it_is_submitted(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"]), "x")
    svc.update_review(db, review, {"self_section_comments": {"written": "Did well here."}, "self_strengths": "Excel"})
    vis, out = _visible(db, review, "emp")
    assert vis == {"self": True, "manager": False}
    assert out["evaluations"]["self"]["section_comments"] == {"written": "Did well here."}
    vis, out = _visible(db, review, "mgr")
    assert vis == {"self": False, "manager": True}
    assert out["self_strengths"] is None  # not submitted yet

    _submit_self_and_score(db, review, {"written_1": 3, "verbal_1": 4})
    vis, out = _visible(db, review, "mgr")
    assert vis["self"] is True and out["self_strengths"] == "Excel"
    assert out["overall_average"] == 3.5
    # The reviewee doesn't see the Manager Review until it's completed.
    vis, out = _visible(db, review, "emp")
    assert vis["manager"] is False and out["overall_average"] is None

    review = svc.transition_review(db, review, "complete")
    vis, out = _visible(db, review, "emp")
    assert vis == {"self": True, "manager": True}
    assert out["overall_average"] == out["evaluations"]["manager"]["overall_average"] == 3.5


def test_every_reviewer_edits_the_same_manager_review(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr", "mgr2"],
    ), "x")
    # Nobody can start before the self-assessment is submitted.
    assert svc.editable_fields(review, "mgr", False) == set()
    svc.transition_review(db, review, "submit_self")
    assert svc.editable_fields(review, "mgr", False) == svc.MANAGER_FIELDS
    assert svc.editable_fields(review, "mgr2", False) == svc.MANAGER_FIELDS

    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 4}), "manager_strengths_notes": "From mgr"})
    # mgr2 picks up the same evaluation and keeps editing it.
    vis, out = _visible(db, review, "mgr2")
    assert vis["manager"] is True
    assert out["evaluations"]["manager"]["scores"] == _scores({"written_1": 4})
    assert out["evaluations"]["manager"]["strengths_notes"] == "From mgr"
    review = svc.update_review(db, review, {"manager_scores": _scores({"written_1": 2, "verbal_1": 4}), "manager_notes": "Agreed"})
    assert review.joint_scores == _scores({"written_1": 2, "verbal_1": 4})
    assert review.joint_notes == "Agreed"
    assert [r["reviewer_name"] for r in svc.serialize(db, [review], "mgr", False)[0]["reviewers"]] == ["Brandon Beal", "Casey Diaz"]


def test_admin_is_blind_to_the_manager_review_until_completed(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"],
    ), "x")
    svc.update_review(db, review, {"self_section_comments": {"written": "Did well here."}})
    _submit_self_and_score(db, review, {"written_1": 4})

    # Admin (viewer_can_manage=True, not a reviewer) reads self once it's
    # submitted, but not the in-progress Manager Review — and never edits content.
    vis, out = _visible(db, review, "admin", manage=True)
    assert vis == {"self": True, "manager": False}
    assert out["evaluations"]["manager"]["scores"] == {}
    assert svc.editable_fields(review, "admin", True) == svc.ADMIN_META_FIELDS

    review = svc.transition_review(db, review, "complete")
    vis, out = _visible(db, review, "admin", manage=True)
    assert vis == {"self": True, "manager": True}
    assert out["overall_average"] == 4.0


def test_self_assessment_deadline_locks_editing(db):
    yesterday = date.today() - timedelta(days=1)
    tomorrow = date.today() + timedelta(days=1)
    locked = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), self_due_date=yesterday,
    ), "x")
    assert svc.self_assessment_locked(locked) is True
    assert svc.editable_fields(locked, "emp", False) == set()
    # Admin/Manager can't edit the self content — but CAN always push the
    # deadline out (administrative metadata), which is how they un-stick it.
    assert svc.editable_fields(locked, "anyone", True) == svc.ADMIN_META_FIELDS
    assert "self_due_date" in svc.editable_fields(locked, "anyone", True)

    open_review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), self_due_date=tomorrow,
    ), "x")
    assert svc.self_assessment_locked(open_review) is False
    assert "self_section_comments" in svc.editable_fields(open_review, "emp", False)

    no_deadline = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15)), "x")
    assert svc.self_assessment_locked(no_deadline) is False


def test_complete_needs_a_rated_item(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"],
    ), "x")
    svc.transition_review(db, review, "submit_self")
    with pytest.raises(ValueError):
        svc.transition_review(db, review, "complete")
    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 3})})
    review = svc.transition_review(db, review, "complete")
    assert review.status == "completed" and review.completed_at is not None
    with pytest.raises(ValueError):
        svc.transition_review(db, review, "submit_manager")  # the old per-reviewer step is gone


def test_reopen_manager_from_completed_keeps_the_scores(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"],
    ), "x")
    _submit_self_and_score(db, review, {"written_1": 4})
    svc.transition_review(db, review, "complete")
    assert svc.editable_fields(review, "mgr", False) == set()

    review = svc.transition_review(db, review, "reopen_manager")
    assert review.status == "in_review" and review.completed_at is None
    assert review.joint_scores["written_1"]["score"] == 4
    assert review.self_submitted_at is not None  # untouched
    assert svc.editable_fields(review, "mgr", False) == svc.MANAGER_FIELDS


def test_reopen_self_keeps_the_manager_review(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"],
    ), "x")
    _submit_self_and_score(db, review, {"written_1": 4})
    review = svc.transition_review(db, review, "complete")

    review = svc.transition_review(db, review, "reopen_self")
    assert review.status == "self_assessment"
    assert review.self_submitted_at is None and review.completed_at is None
    assert review.joint_scores["written_1"]["score"] == 4
    # Resubmitting goes back to the Manager Review stage, scores intact.
    review = svc.transition_review(db, review, "submit_self")
    assert review.status == "in_review"
    assert review.joint_scores["written_1"]["score"] == 4


def test_editable_fields_follow_the_stage(db):
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"]), "x")
    assert "self_section_comments" in svc.editable_fields(review, "emp", False)
    assert svc.editable_fields(review, "mgr", False) == set()  # can't start until self is submitted
    svc.transition_review(db, review, "submit_self")
    assert svc.editable_fields(review, "emp", False) == set()
    assert svc.editable_fields(review, "mgr", False) == svc.MANAGER_FIELDS
    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 3})})
    svc.transition_review(db, review, "complete")
    assert svc.editable_fields(review, "mgr", False) == set()
    assert svc.editable_fields(review, "anyone", True) == svc.ADMIN_FIELDS


def test_analytics_uses_completed_reviews_only(db):
    done = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"]), "x")
    svc.update_review(db, done, {"manager_scores": _scores({"written_1": 4})})
    done.status = "completed"
    db.commit()
    svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2026, 1, 15)), "x")

    data = svc.analytics(db, 2025)
    assert data["years"] == [2025]
    assert len(data["reviews"]) == 1
    row = data["reviews"][0]
    # Self no longer scores anything — "self" overall is always None now.
    assert (row["self"]["overall"], row["manager"]["overall"]) == (None, 4.0)
    assert "joint" not in row
    assert row["manager"]["items"] == {"written_1": 4}
    assert row["reviewer_names"] == ["Brandon Beal"]
    assert svc.analytics(db, 2026)["reviews"] == []


def test_xlsx_export_layout(db):
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr", "mgr2"],
    ), "mgr")
    svc.update_review(db, review, {
        "manager_scores": _scores(SAMPLE_SCORES),
        "self_strengths": "Excel skills",
        "self_section_comments": {"written": "Clear writer."},
        "manager_notes": "Agreed",
        "manager_strengths_notes": "Technically sound",
    })
    data = svc.review_export_data(db, review)
    wb = load_workbook(BytesIO(generate_performance_review_xlsx(data)))
    assert wb.sheetnames == ["Manager Review", "Self"]
    ws = wb["Manager Review"]

    assert export_filename(data) == "THERAPAK, LLC - Michael Franz - 2025.xlsx"
    assert ws["B6"].value == "Franz, Michael"
    assert ws["A8"].value == "Reviewers" and ws["B8"].value == "Brandon Beal, Casey Diaz"
    assert ws["B11"].value == "296 hours"
    assert ws["B12"].value == "12/15/2025"
    assert [ws[f"D{r}"].value for r in range(7, 13)] == [3.0, 3.25, 2.8, 3.0, 2.75, 2.96]
    assert ws["B14"].value == "Excel skills" and ws["D14"].value == "Technically sound"
    assert ws["A17"].value == "Manager Review Notes" and ws["B17"].value == "Agreed"
    assert ws["A19"].value == "Written Communications" and ws["C19"].value == 3.0
    assert ws["C20"].value is None and ws["C21"].value == 3
    assert ws["A43"].value == "Overall Professionalism and Core Values" and ws["C43"].value == 2.75
    assert ws["C44"].value == 2

    self_ws = wb["Self"]
    # No per-item scores at all on the Self sheet — just the reference list…
    assert self_ws["A19"].value == "Written Communications" and self_ws["C19"].value is None
    assert self_ws["B20"].value and self_ws["C20"].value is None  # sub-criterion label, no score column
    assert self_ws["D14"].value is None  # no reviewer notes on the Self sheet
    # …and one comment per section, written in the criterion's own row.
    assert self_ws["D19"].value == "Clear writer."


def test_bulk_zip_bundles_one_workbook_per_review_and_dedupes_filenames(db):
    review1 = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 3, 1), reviewer_ids=["mgr"]), "mgr")
    review2 = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 9, 1), reviewer_ids=["mgr"]), "mgr")
    datas = [svc.review_export_data(db, review1), svc.review_export_data(db, review2)]
    # Same employee/project/year on both — export_filename collides for them,
    # so the zip must still keep both workbooks, disambiguated.
    assert export_filename(datas[0]) == export_filename(datas[1])

    zip_bytes = export_reviews_zip(datas)
    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        assert len(names) == 2
        assert names[0] == "THERAPAK, LLC - Michael Franz - 2025.xlsx"
        assert names[1] == "THERAPAK, LLC - Michael Franz - 2025 (2).xlsx"
        # Each entry is a real, independently-readable workbook.
        for name in names:
            wb = load_workbook(BytesIO(zf.read(name)))
            assert wb.sheetnames == ["Manager Review", "Self"]


def test_reviewer_never_defaults_to_the_reviewee(db):
    # The project manager being reviewed falls through to the owner (none here).
    review = svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="mgr", review_date=date(2025, 12, 15)), "mgr")
    assert review.reviewers == []


def test_projects_panel_and_team(db):
    from models.employee_projects import EmployeeProject
    db.add(EmployeeProject(id="ep1", user_id="emp", project_id="prj"))
    db.add(Project(id="int", client_id="cli", name="Internal", is_internal=True))
    db.commit()

    panel = svc.list_review_projects(db)
    assert [p["id"] for p in panel] == ["prj"]  # internal projects excluded
    assert panel[0]["performance_review_enabled"] is False and panel[0]["team_size"] == 1

    svc.set_project_review_enabled(db, db.get(Project, "prj"), True)
    svc.create_review(db, PerformanceReviewCreate(project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr"]), "mgr")
    panel = svc.list_review_projects(db)
    assert panel[0]["performance_review_enabled"] is True
    assert (panel[0]["reviews_total"], panel[0]["reviews_self_assessment"]) == (1, 1)

    team = {m["employee_id"]: m for m in svc.project_team(db, "prj")}
    # Assigned employee + someone who only logged time — mgr is also the
    # reviewer, but that alone doesn't add them to the roster (they're
    # already here via logged hours).
    assert set(team) == {"emp", "mgr"}
    assert team["emp"]["is_assigned"] and not team["mgr"]["is_assigned"]
    assert team["emp"]["logged_hours"] == 296 and team["mgr"]["logged_hours"] == 50
    assert len(team["emp"]["reviews"]) == 1 and team["emp"]["reviews"][0]["reviewer_names"] == ["Brandon Beal"]
    assert team["mgr"]["reviews"] == []
    assert svc.has_open_review(db, "prj", "emp") and not svc.has_open_review(db, "prj", "mgr")


def test_manager_scores_patches_merge_item_by_item(db):
    """Two reviewers saving different items of the shared Manager Review
    don't overwrite each other — the panel only sends what changed."""
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr", "mgr2"],
    ), "x")
    svc.transition_review(db, review, "submit_self")
    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 4})})   # mgr
    svc.update_review(db, review, {"manager_scores": _scores({"verbal_1": 2})})    # mgr2
    review = svc.update_review(db, review, {"manager_scores": {"written_1": {"score": None, "notes": None}}})  # mgr marks N/A
    assert review.joint_scores == {"written_1": {"score": None, "notes": None}, "verbal_1": {"score": 2, "notes": None}}


def test_one_reviewer_alone_can_complete_when_there_are_several(db):
    """With several reviewers, any ONE of them can fill in and complete the
    Manager Review — the others don't have to touch it (e.g. only one of
    them was able to review this person)."""
    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15), reviewer_ids=["mgr", "mgr2"],
    ), "x")
    svc.transition_review(db, review, "submit_self")
    svc.update_review(db, review, {"manager_scores": _scores({"written_1": 2})})  # mgr only; mgr2 never touches it
    review = svc.transition_review(db, review, "complete")
    assert review.status == "completed"
    assert svc.serialize(db, [review], "emp", False)[0]["overall_average"] == 2.0


def test_principals_directors_is_its_own_format(db):
    tpl = svc.get_template("principals_directors")
    assert [c["key"] for c in tpl] == [c["key"] for c in svc.REVIEW_TEMPLATE]
    assert [len(c["sub_criteria"]) for c in tpl] == [5, 5, 5, 5, 4]
    assert tpl[0]["sub_criteria"][0] == ("pd_written_1", "Strong grasp of story boarding and knowing your audience")
    # Its own keys — never shared with another format's stored scores.
    keys = svc.sub_criterion_keys("principals_directors")
    assert not (keys & svc.SUB_CRITERION_KEYS) and not (keys & svc.sub_criterion_keys("seniors_managers"))
    assert svc.template_out("principals_directors")["format_label"] == "Principals and Directors Review"

    review = svc.create_review(db, PerformanceReviewCreate(
        project_id="prj", employee_id="emp", review_date=date(2025, 12, 15),
        reviewer_ids=["mgr"], evaluation_format="principals_directors",
    ), "x")
    svc.transition_review(db, review, "submit_self")
    with pytest.raises(ValueError):
        svc.update_review(db, review, {"manager_scores": _scores({"written_1": 3})})
    review = svc.update_review(db, review, {"manager_scores": _scores({"pd_written_1": 2, "pd_professionalism_4": 4})})
    assert svc.serialize(db, [review], "mgr", False)[0]["overall_average"] == 3.0
    ws = load_workbook(BytesIO(generate_performance_review_xlsx(svc.review_export_data(db, review))))["Manager Review"]
    assert ws["B20"].value == "Strong grasp of story boarding and knowing your audience" and ws["C20"].value == 2
