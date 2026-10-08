# schemas/performance_reviews.py
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import date, datetime


class ReviewScore(BaseModel):
    score: Optional[int] = None  # 1–5, None = not rated (excluded from averages)
    notes: Optional[str] = None


class PerformanceReviewCreate(BaseModel):
    project_id: str
    employee_id: str
    # Defaults to the project's manager (then owner) when omitted.
    reviewer_id: Optional[str] = None
    review_date: date
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    # Defaults to the employee's logged hours on the project (within the
    # period, if any) when omitted.
    duration_hours: Optional[float] = None
    project_description: Optional[str] = None


class PerformanceReviewUpdate(BaseModel):
    """Partial update — which fields a caller may actually change depends on
    who they are (see services/performance_reviews.py::EMPLOYEE_FIELDS /
    REVIEWER_FIELDS / ADMIN_FIELDS); disallowed fields are rejected."""
    reviewer_id: Optional[str] = None
    review_date: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    duration_hours: Optional[float] = None
    project_description: Optional[str] = None
    employee_role: Optional[str] = None
    self_strengths: Optional[str] = None
    self_improvement: Optional[str] = None
    self_development: Optional[str] = None
    reviewer_strengths_notes: Optional[str] = None
    reviewer_improvement_notes: Optional[str] = None
    reviewer_development_notes: Optional[str] = None
    scores: Optional[Dict[str, ReviewScore]] = None


class PerformanceReviewTransition(BaseModel):
    # "submit_self" (employee → in_review), "complete" (reviewer → completed),
    # "reopen" (manager/admin: completed → in_review, in_review → self_assessment)
    action: str


class CriterionAverage(BaseModel):
    key: str
    label: str
    average: Optional[float] = None


class PerformanceReviewOut(BaseModel):
    id: str
    project_id: str
    project_name: str
    client_name: Optional[str] = None
    employee_id: str
    employee_name: str
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    review_date: date
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    duration_hours: Optional[float] = None
    project_description: Optional[str] = None
    employee_role: Optional[str] = None
    self_strengths: Optional[str] = None
    self_improvement: Optional[str] = None
    self_development: Optional[str] = None
    reviewer_strengths_notes: Optional[str] = None
    reviewer_improvement_notes: Optional[str] = None
    reviewer_development_notes: Optional[str] = None
    scores: Dict[str, ReviewScore]
    criteria_averages: List[CriterionAverage]
    overall_average: Optional[float] = None
    status: str
    # False when the caller is the reviewee and the review isn't completed —
    # the reviewer's scores/notes are withheld until then.
    reviewer_section_visible: bool = True
    self_submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ReviewSubCriterionOut(BaseModel):
    key: str
    label: str


class ReviewCriterionOut(BaseModel):
    key: str
    label: str
    short_label: str
    sub_criteria: List[ReviewSubCriterionOut]


class ReviewTemplateOut(BaseModel):
    score_min: int
    score_max: int
    criteria: List[ReviewCriterionOut]
