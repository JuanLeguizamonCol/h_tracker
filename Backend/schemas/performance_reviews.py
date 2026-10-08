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
    joint_notes: Optional[str] = None
    self_scores: Optional[Dict[str, ReviewScore]] = None
    manager_scores: Optional[Dict[str, ReviewScore]] = None
    joint_scores: Optional[Dict[str, ReviewScore]] = None


class PerformanceReviewTransition(BaseModel):
    # "submit_self" (employee: self_assessment → in_review)
    # "submit_manager" (reviewer: in_review → joint_review, joint pre-filled from manager scores)
    # "complete" (reviewer: joint_review → completed)
    # "reopen" (Admin/Manager: one stage back)
    action: str


class CriterionAverage(BaseModel):
    key: str
    label: str
    average: Optional[float] = None


class EvaluationOut(BaseModel):
    # False when the caller may not see this evaluation yet (self and manager
    # are blind to each other until joint_review) — scores come back empty.
    visible: bool
    scores: Dict[str, ReviewScore]
    criteria_averages: List[CriterionAverage]
    overall_average: Optional[float] = None


class EvaluationsOut(BaseModel):
    self: EvaluationOut
    manager: EvaluationOut
    joint: EvaluationOut


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
    joint_notes: Optional[str] = None
    evaluations: EvaluationsOut
    # Official score = the joint evaluation's overall average.
    overall_average: Optional[float] = None
    status: str
    self_submitted_at: Optional[datetime] = None
    manager_submitted_at: Optional[datetime] = None
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


# ---------- Projects panel ----------

class ReviewProjectOut(BaseModel):
    id: str
    name: str
    project_code: Optional[str] = None
    client_name: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    is_active: bool
    status: str
    performance_review_enabled: bool
    team_size: int
    reviews_total: int
    reviews_self_assessment: int
    reviews_in_review: int
    reviews_joint_review: int
    reviews_completed: int


class ProjectReviewToggle(BaseModel):
    enabled: bool


class ReviewSummaryOut(BaseModel):
    id: str
    status: str
    review_date: date
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    overall_average: Optional[float] = None


class ReviewTeamMemberOut(BaseModel):
    employee_id: str
    name: str
    title: Optional[str] = None
    role_name: Optional[str] = None
    is_assigned: bool       # currently staffed on the project (employee_projects)
    is_active: bool
    logged_hours: float
    reviews: List[ReviewSummaryOut]  # newest first


class BulkAssignIn(BaseModel):
    project_id: str
    employee_ids: List[str]
    review_date: date
    # Defaults to the project's manager (then owner) when omitted.
    reviewer_id: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class BulkAssignOut(BaseModel):
    created: List[PerformanceReviewOut]
    # Employees skipped because they already have an open (not completed)
    # review on this project.
    skipped_employee_ids: List[str]


# ---------- Analytics ----------

class EvaluationScoresOut(BaseModel):
    criteria: Dict[str, Optional[float]]   # criterion key -> average
    overall: Optional[float] = None
    items: Dict[str, int]                  # sub-criterion key -> score (rated only)


class AnalyticsReviewOut(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    project_id: str
    project_name: str
    client_name: Optional[str] = None
    reviewer_name: Optional[str] = None
    review_date: date
    duration_hours: Optional[float] = None
    self: EvaluationScoresOut
    manager: EvaluationScoresOut
    joint: EvaluationScoresOut


class ReviewAnalyticsOut(BaseModel):
    years: List[int]
    year: Optional[int] = None
    reviews: List[AnalyticsReviewOut]
