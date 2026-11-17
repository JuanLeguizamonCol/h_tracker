"""Migration 069 — folds the old per-reviewer evaluations / Final Submission
into the single shared Manager Review."""
import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.clients import Client
from models.employees import Employee
from models.performance_reviews import PerformanceReview, PerformanceReviewReviewer
from models.projects import Project

MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "069_review_shared_manager_evaluation.py"
NEW_COLUMNS = ("manager_strengths_notes", "manager_improvement_notes", "manager_development_notes")


def _load_migration():
    spec = importlib.util.spec_from_file_location("m069", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _s(raw):
    return {k: {"score": v, "notes": None} for k, v in raw.items()}


def test_upgrade_folds_reviewer_evaluations_into_the_shared_manager_review():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        Employee(id="emp", user_id="emp", name="Emp", email="e@x.com"),
        Employee(id="a", user_id="a", name="Ann", email="a@x.com"),
        Employee(id="b", user_id="b", name="Bob", email="b@x.com"),
        Client(id="cli", name="Client"),
    ])
    session.flush()
    session.add(Project(id="prj", client_id="cli", name="P"))
    session.flush()
    from datetime import date
    common = dict(project_id="prj", employee_id="emp", review_date=date(2026, 1, 1), self_scores={})
    session.add_all([
        # Final Submission in progress, already has agreed joint scores.
        PerformanceReview(id="joint", status="joint_review", joint_scores=_s({"written_1": 4}), **common),
        # Reviewers mid-way, two independent evaluations, nothing agreed yet.
        PerformanceReview(id="inrev", status="in_review", joint_scores={}, evaluation_format="managers_directors", **common),
        # Completed — official scores never touched.
        PerformanceReview(id="done", status="completed", joint_scores=_s({"written_1": 2}), **common),
    ])
    session.flush()
    session.add_all([
        PerformanceReviewReviewer(id="r1", review_id="joint", reviewer_id="a", scores=_s({"written_1": 1}), strengths_notes="Solid"),
        PerformanceReviewReviewer(id="r2", review_id="inrev", reviewer_id="a",
                                  scores={"md_written_1": {"score": 4, "notes": "good"}}, strengths_notes="From Ann"),
        PerformanceReviewReviewer(id="r3", review_id="inrev", reviewer_id="b",
                                  scores={"md_written_1": {"score": 1, "notes": None}, "md_verbal_1": {"score": 3, "notes": None}},
                                  strengths_notes="From Bob"),
        PerformanceReviewReviewer(id="r4", review_id="done", reviewer_id="b", scores=_s({"written_1": 5})),
    ])
    session.commit()
    session.close()

    with engine.begin() as conn:
        # The pre-069 schema didn't have these columns yet.
        for column in NEW_COLUMNS:
            conn.execute(text(f"ALTER TABLE performance_reviews DROP COLUMN {column}"))
        migration = _load_migration()
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()

    session = sessionmaker(bind=engine)()
    joint = session.get(PerformanceReview, "joint")
    assert joint.status == "in_review"
    assert joint.joint_scores == _s({"written_1": 4})  # agreed scores kept, not re-seeded
    assert joint.manager_strengths_notes == "Solid"

    inrev = session.get(PerformanceReview, "inrev")
    assert inrev.status == "in_review"
    assert inrev.evaluation_format == "seniors_managers"
    # Per-item average, rounded to a whole score (4+1)/2 = 2.5 → 2 (banker's
    # rounding, same as the old joint seeding); item notes carried over.
    assert inrev.joint_scores["md_written_1"] == {"score": 2, "notes": "good"}
    assert inrev.joint_scores["md_verbal_1"] == {"score": 3, "notes": None}
    assert inrev.manager_strengths_notes == "Ann: From Ann\n\nBob: From Bob"

    done = session.get(PerformanceReview, "done")
    assert done.status == "completed"
    assert done.joint_scores == _s({"written_1": 2})
