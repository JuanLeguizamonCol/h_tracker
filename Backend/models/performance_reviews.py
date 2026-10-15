from config.database import Base
from sqlalchemy import Column, String, Date, DateTime, Numeric, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

# Lifecycle — three stages (status value "joint_review" is unchanged in the
# DB/API; the UI displays it as "Final Submission"):
#   self_assessment: the employee fills project details + a per-section self
#                     comment (no scores — see self_section_comments). Has a
#                     real deadline (self_due_date): once past it, the
#                     employee can no longer edit/submit it — only an Admin
#                     can un-stick it (by pushing the date out, or editing on
#                     the employee's behalf; Admin/Manager always bypass the
#                     deadline). Reviewers cannot start until this is submitted.
#   in_review:       each assigned reviewer fills their OWN scores + notes,
#                     independently, with no deadline of their own.
#   joint_review:    employee + reviewers agree on the JOINT scores (official,
#                     "Final Submission") — opens once EVERY assigned reviewer
#                     has submitted their own evaluation.
#   completed
# The self evaluation and every reviewer's row are blind to each other (and
# reviewers blind to each other) until joint_review. The reviewee never sees
# any individual reviewer's evaluation, even at joint_review — only the joint
# ("Final Submission") result. See services/performance_reviews.py::visibility.
REVIEW_STATUSES = ("self_assessment", "in_review", "joint_review", "completed")

# Registry of evaluation formats a review can use — today there's only one;
# more are coming later (see services/performance_reviews.py::EVALUATION_FORMATS).
# REVIEW_TEMPLATE doesn't branch on this yet, but the field exists on every
# review now so the selector works end-to-end once a second format is added.
DEFAULT_EVALUATION_FORMAT = "standard"


class PerformanceReview(Base):
    """One project performance review — employee × project × N reviewers — in
    the Impact Point evaluation format (see services/performance_reviews.py::
    REVIEW_TEMPLATE for the fixed criteria/sub-criteria, and
    services/export_performance_review.py for the .xlsx it exports to)."""

    __tablename__ = "performance_reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String, ForeignKey("employees.id"), nullable=True)

    review_date = Column(Date, nullable=False)
    # Hard deadline for the SELF stage only — null means no deadline. Past
    # this date the employee can no longer edit or submit their self
    # evaluation (see services/performance_reviews.py::self_assessment_locked);
    # reviewer/joint stages have no deadline of their own.
    self_due_date = Column(Date, nullable=True)
    # Optional window the review covers — only used to total the employee's
    # logged hours on the project into `duration_hours` (null = all time).
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    duration_hours = Column(Numeric(10, 2), nullable=True)

    # Which REVIEW_TEMPLATE-equivalent format this review uses — see
    # EVALUATION_FORMATS in services/performance_reviews.py. Set once at
    # creation/assignment; only "standard" exists today.
    evaluation_format = Column(String, nullable=False, default=DEFAULT_EVALUATION_FORMAT)

    # Project details (employee)
    project_description = Column(Text, nullable=True)
    employee_role = Column(Text, nullable=True)

    # Self-assessment (employee) — no numeric scores: the employee leaves one
    # free-text comment per criterion/section instead (self_section_comments),
    # with the sub-criteria shown read-only as a guide to what's being
    # evaluated. self_strengths/improvement/development stay as the existing
    # three free-text reflection fields.
    self_strengths = Column(Text, nullable=True)
    self_improvement = Column(Text, nullable=True)
    self_development = Column(Text, nullable=True)
    # {criterion_key: comment_text}
    self_section_comments = Column(JSON, nullable=False, default=dict)

    # One {sub_criterion_key: {"score": int|None, "notes": str|None}} per
    # evaluation. Only joint_scores feeds the official/annual averages. Each
    # reviewer's own scores/notes live on PerformanceReviewReviewer instead of
    # here — see that model for why (N independent reviewers, not one).
    # self_scores is kept only for backward-compat with reviews scored before
    # the self stage switched to comments-only; nothing writes to it anymore.
    self_scores = Column(JSON, nullable=False, default=dict)
    joint_scores = Column(JSON, nullable=False, default=dict)
    joint_notes = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="self_assessment", index=True)
    self_submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    reviewers = relationship(
        "PerformanceReviewReviewer", cascade="all, delete-orphan",
        order_by="PerformanceReviewReviewer.created_at",
    )


class PerformanceReviewReviewer(Base):
    """One assigned reviewer's independent evaluation of a PerformanceReview —
    their own scores, their own notes, their own submission timestamp. A
    review can have any number of these; reviewers are blind to each other's
    rows until the review reaches joint_review (every reviewer has submitted),
    exactly like self vs. reviewer was already blind before this table
    existed. See services/performance_reviews.py::visibility/transition_review."""

    __tablename__ = "performance_review_reviewers"
    __table_args__ = (UniqueConstraint("review_id", "reviewer_id", name="uq_review_reviewer"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    review_id = Column(String, ForeignKey("performance_reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(String, ForeignKey("employees.id"), nullable=False, index=True)

    scores = Column(JSON, nullable=False, default=dict)
    strengths_notes = Column(Text, nullable=True)
    improvement_notes = Column(Text, nullable=True)
    development_notes = Column(Text, nullable=True)

    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
