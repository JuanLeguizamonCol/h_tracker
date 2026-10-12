# schemas/employee_performance.py — Reports › Performance tab (services/employee_performance.py)
from datetime import date
from typing import Dict, List, Optional

from pydantic import BaseModel


class PerformanceMonthOut(BaseModel):
    key: str          # "YYYY-MM"
    label: str        # "Nov 2025"
    complete: bool    # finished month — only these count toward averages/capacity
    workdays: int


class MonthHoursOut(BaseModel):
    total: float
    billable: float


class EmployeeReviewScoreOut(BaseModel):
    id: str
    project_id: str
    project_name: str
    client_name: Optional[str] = None
    review_date: date
    hours_in_window: float
    self: Optional[float] = None
    manager: Optional[float] = None
    joint: Optional[float] = None


class EmployeePerformanceRowOut(BaseModel):
    employee_id: str
    name: str
    title: Optional[str] = None
    location: Optional[str] = None
    is_active: bool
    max_weekly_hours: float
    monthly: Dict[str, MonthHoursOut]
    total_hours: float
    billable_hours: float
    avg_monthly_hours: Optional[float] = None
    billable_pct: Optional[float] = None
    utilization_pct: Optional[float] = None
    projects_count: int
    pto_hours: float
    reviews: List[EmployeeReviewScoreOut]
    reviews_count: int
    review_score: Optional[float] = None      # mean of joint overall averages
    self_manager_gap: Optional[float] = None
    open_reviews: int


class ProjectReviewScoreOut(BaseModel):
    project_id: str
    name: str
    client_name: Optional[str] = None
    reviews_count: int
    employees_reviewed: int
    joint_avg: Optional[float] = None
    self_avg: Optional[float] = None
    manager_avg: Optional[float] = None
    hours_in_window: float


class EmployeePerformanceOut(BaseModel):
    start: date
    end: date
    months: List[PerformanceMonthOut]
    employees: List[EmployeePerformanceRowOut]
    projects: List[ProjectReviewScoreOut]
