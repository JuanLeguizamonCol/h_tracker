from config.database import Base
from sqlalchemy import Column, String, Date, DateTime, Numeric, ForeignKey, Text, JSON
from datetime import datetime, timezone
import uuid

# Lifecycle — three evaluations of the same criteria, one per stage:
#   self_assessment: the employee fills project details + self-assessment + SELF scores
#   in_review:       the reviewer (manager on the project) fills MANAGER scores + notes
#   joint_review:    employee + reviewer agree on the JOINT scores (official)
#   completed
# Self and manager scores are blind to each other until joint_review (see
# services/performance_reviews.py::visibility).
REVIEW_STATUSES = ("self_assessment", "in_review", "joint_review", "completed")


class PerformanceReview(Base):
    """One project performance review — employee × project × reviewer — in the
    Impact Point evaluation format (see services/performance_reviews.py::
    REVIEW_TEMPLATE for the fixed criteria/sub-criteria, and
    services/export_performance_review.py for the .xlsx it exports to)."""

    __tablename__ = "performance_reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(String, ForeignKey("employees.id"), nullable=True, index=True)
    created_by = Column(String, ForeignKey("employees.id"), nullable=True)

    review_date = Column(Date, nullable=False)
    # Optional window the review covers — only used to total the employee's
    # logged hours on the project into `duration_hours` (null = all time).
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    duration_hours = Column(Numeric(10, 2), nullable=True)

    # Project details (employee)
    project_description = Column(Text, nullable=True)
    employee_role = Column(Text, nullable=True)

    # Self-assessment (employee) + the reviewer's note on each row
    self_strengths = Column(Text, nullable=True)
    self_improvement = Column(Text, nullable=True)
    self_development = Column(Text, nullable=True)
    reviewer_strengths_notes = Column(Text, nullable=True)
    reviewer_improvement_notes = Column(Text, nullable=True)
    reviewer_development_notes = Column(Text, nullable=True)

    # One {sub_criterion_key: {"score": int|None, "notes": str|None}} per
    # evaluation. Only joint_scores feeds the official/annual averages.
    self_scores = Column(JSON, nullable=False, default=dict)
    manager_scores = Column(JSON, nullable=False, default=dict)
    joint_scores = Column(JSON, nullable=False, default=dict)
    joint_notes = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="self_assessment", index=True)
    self_submitted_at = Column(DateTime, nullable=True)
    manager_submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
