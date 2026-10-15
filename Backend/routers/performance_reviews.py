from datetime import date
from urllib.parse import quote
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.projects import Project
from models.performance_reviews import PerformanceReview
from schemas.performance_reviews import (
    PerformanceReviewCreate, PerformanceReviewUpdate, PerformanceReviewTransition,
    PerformanceReviewOut, ReviewTemplateOut,
    ReviewProjectOut, ProjectReviewToggle, ReviewTeamMemberOut, BulkAssignIn, BulkAssignOut, ReviewAnalyticsOut,
)
from services import performance_reviews as svc
from services.export_performance_review import generate_performance_review_xlsx, export_filename
from services.performance_review_notifications import (
    notify_review_created, notify_self_assessment_submitted, notify_joint_review_ready, notify_review_completed,
)
from utils.auth_jwt import get_current_employee
from utils.section_access import get_section_access

performance_reviews_router = APIRouter(prefix="/performance-reviews", tags=["performance-reviews"])


def _can_manage(db: Session, employee: Employee) -> bool:
    """Edit access on the Reviews section (Admin/Manager by default) = create,
    delete, reopen, and edit any review. Everyone else only touches reviews
    where they're the reviewee or the reviewer."""
    return get_section_access(db, employee.id, "reviews")[1]


def _load_visible(db: Session, review_id: str, employee: Employee) -> tuple[PerformanceReview, bool]:
    review = svc.get_review(db, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    manage = _can_manage(db, employee)
    reviewer_ids = {r.reviewer_id for r in review.reviewers}
    if not (manage or employee.id == review.employee_id or employee.id in reviewer_ids):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this review.")
    return review, manage


def _out(db: Session, review: PerformanceReview, employee: Employee, manage: bool) -> dict:
    return svc.serialize(db, [review], employee.id, manage)[0]


def _email_of(db: Session, employee_id: Optional[str]) -> Optional[str]:
    if not employee_id:
        return None
    return db.query(Employee.email).filter(Employee.id == employee_id).scalar()


@performance_reviews_router.get("/template", response_model=ReviewTemplateOut)
def get_template():
    return svc.template_out()


@performance_reviews_router.get("/formats")
def get_evaluation_formats():
    """Which evaluation formats a review can be assigned under — only one
    today ("standard"); more are coming (see EVALUATION_FORMATS)."""
    return [{"key": k, "label": v} for k, v in svc.EVALUATION_FORMATS.items()]


@performance_reviews_router.get("/logged-hours")
def get_logged_hours(
    project_id: str,
    employee_id: str,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if not _can_manage(db, current_employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviews edit access required.")
    return {"hours": svc.logged_hours(db, employee_id, project_id, period_start, period_end)}


def _require_manage(db: Session, employee: Employee) -> None:
    if not _can_manage(db, employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviews edit access required.")


def _load_project(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@performance_reviews_router.get("/analytics", response_model=ReviewAnalyticsOut)
def get_analytics(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Completed reviews with all three evaluations, for the Analytics tab's
    employee / project / item matrices. Reviews edit access only."""
    _require_manage(db, current_employee)
    return svc.analytics(db, year)


# ---------- Projects panel (Reviews edit access) ----------

@performance_reviews_router.get("/projects", response_model=List[ReviewProjectOut])
def list_review_projects(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    _require_manage(db, current_employee)
    return svc.list_review_projects(db, include_inactive=include_inactive)


@performance_reviews_router.put("/projects/{project_id}", response_model=ReviewProjectOut)
def toggle_project_reviews(
    project_id: str,
    body: ProjectReviewToggle,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Turns performance reviews on/off for a project. Turning it off keeps
    existing reviews; it only blocks assigning new self-assessments."""
    _require_manage(db, current_employee)
    project = _load_project(db, project_id)
    svc.set_project_review_enabled(db, project, body.enabled)
    return next(p for p in svc.list_review_projects(db, include_inactive=True) if p["id"] == project_id)


@performance_reviews_router.get("/projects/{project_id}/team", response_model=List[ReviewTeamMemberOut])
def get_project_team(
    project_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    _require_manage(db, current_employee)
    _load_project(db, project_id)
    return svc.project_team(db, project_id)


@performance_reviews_router.post("/bulk", response_model=BulkAssignOut, status_code=status.HTTP_201_CREATED)
def bulk_assign_self_assessments(
    data: BulkAssignIn,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Assigns a self-assessment (= opens a review) to each selected employee on
    one project. Employees who already have an open review there are skipped."""
    _require_manage(db, current_employee)
    project = _load_project(db, data.project_id)
    if not project.performance_review_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Performance reviews are turned off for this project.")
    if not data.employee_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one employee.")
    if data.period_start and data.period_end and data.period_end < data.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Period end must be on or after the start.")
    reviewer_ids = list(dict.fromkeys(data.reviewer_ids or []))
    if reviewer_ids:
        found_reviewers = {i for (i,) in db.query(Employee.id).filter(Employee.id.in_(reviewer_ids)).all()}
        missing_reviewers = [i for i in reviewer_ids if i not in found_reviewers]
        if missing_reviewers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reviewer not found: {missing_reviewers[0]}")
    employee_ids = list(dict.fromkeys(data.employee_ids))
    found = {i for (i,) in db.query(Employee.id).filter(Employee.id.in_(employee_ids)).all()}
    missing = [i for i in employee_ids if i not in found]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Employee not found: {missing[0]}")

    created, skipped = [], []
    for employee_id in employee_ids:
        if svc.has_open_review(db, data.project_id, employee_id):
            skipped.append(employee_id)
            continue
        review = svc.create_review(db, PerformanceReviewCreate(
            project_id=data.project_id,
            employee_id=employee_id,
            reviewer_ids=reviewer_ids,
            review_date=data.review_date,
            self_due_date=data.self_due_date,
            evaluation_format=data.evaluation_format,
            period_start=data.period_start,
            period_end=data.period_end,
        ), current_employee.id)
        out = _out(db, review, current_employee, True)
        notify_review_created(db, out, _email_of(db, employee_id))
        created.append(out)
    db.commit()
    return {"created": created, "skipped_employee_ids": skipped}


@performance_reviews_router.get("/", response_model=List[PerformanceReviewOut])
def list_reviews(
    project_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    manage = _can_manage(db, current_employee)
    reviews = svc.list_reviews(
        db,
        visible_to=None if manage else current_employee.id,
        project_id=project_id,
        employee_id=employee_id,
        status=status_filter,
    )
    return svc.serialize(db, reviews, current_employee.id, manage)


@performance_reviews_router.post("/", response_model=PerformanceReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    data: PerformanceReviewCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if not _can_manage(db, current_employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviews edit access required.")
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project not found.")
    if not project.performance_review_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Performance reviews are turned off for this project.")
    if not db.query(Employee.id).filter(Employee.id == data.employee_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found.")
    reviewer_ids = list(dict.fromkeys(data.reviewer_ids or []))
    if reviewer_ids:
        found_reviewers = {i for (i,) in db.query(Employee.id).filter(Employee.id.in_(reviewer_ids)).all()}
        missing_reviewers = [i for i in reviewer_ids if i not in found_reviewers]
        if missing_reviewers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reviewer not found: {missing_reviewers[0]}")
        if data.employee_id in reviewer_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An employee can't review themselves.")
    if data.period_start and data.period_end and data.period_end < data.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Period end must be on or after the start.")
    review = svc.create_review(db, data, current_employee.id)
    out = _out(db, review, current_employee, True)
    notify_review_created(db, out, _email_of(db, review.employee_id))
    db.commit()
    return out


@performance_reviews_router.get("/{review_id}", response_model=PerformanceReviewOut)
def get_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    review, manage = _load_visible(db, review_id, current_employee)
    return _out(db, review, current_employee, manage)


@performance_reviews_router.patch("/{review_id}", response_model=PerformanceReviewOut)
def update_review(
    review_id: str,
    body: PerformanceReviewUpdate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    review, manage = _load_visible(db, review_id, current_employee)
    changes = body.model_dump(exclude_unset=True)
    allowed = svc.editable_fields(review, current_employee.id, manage)
    forbidden = set(changes) - allowed
    if forbidden:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You can't edit these fields at this stage: {', '.join(sorted(forbidden))}",
        )
    if changes.get("reviewer_ids") and review.employee_id in changes["reviewer_ids"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An employee can't review themselves.")
    if "review_date" in changes and changes["review_date"] is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review date is required.")

    reviewer_evaluation = changes.pop("reviewer_evaluation", None)
    if reviewer_evaluation is not None:
        target_reviewer_id = reviewer_evaluation.get("reviewer_id")
        if target_reviewer_id and not manage and target_reviewer_id != current_employee.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own evaluation.")
        if not target_reviewer_id:
            target_reviewer_id = current_employee.id

    try:
        review = svc.update_review(db, review, changes)
        if reviewer_evaluation is not None:
            svc.apply_reviewer_evaluation(db, review, target_reviewer_id, reviewer_evaluation)
            db.commit()
            db.refresh(review)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _out(db, review, current_employee, manage)


@performance_reviews_router.post("/{review_id}/transition", response_model=PerformanceReviewOut)
def transition_review(
    review_id: str,
    body: PerformanceReviewTransition,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    review, manage = _load_visible(db, review_id, current_employee)
    is_reviewee = review.employee_id == current_employee.id
    reviewer_ids = {r.reviewer_id for r in review.reviewers}
    is_reviewer = current_employee.id in reviewer_ids

    # Every review walks the same stages in order — Admin/Manager can act on
    # anyone's behalf at each stage, but can't skip one. With N reviewers,
    # "submit_manager" submits only the CALLING reviewer's own evaluation —
    # the stage only advances to joint_review once every assigned reviewer
    # has done this (see services/performance_reviews.py::transition_review).
    if body.action == "submit_self":
        if not (manage or is_reviewee):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the employee can submit their self-assessment.")
        if review.status != "self_assessment":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The self-assessment was already submitted.")
        if not manage and svc.self_assessment_locked(review):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The self-assessment deadline ({review.self_due_date.isoformat()}) has passed. Ask an Admin to extend it.",
            )
    elif body.action == "submit_manager":
        if not (manage or is_reviewer):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an assigned reviewer can submit a reviewer evaluation.")
        if review.status != "in_review":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A reviewer evaluation can only be submitted after the self-assessment and before the joint review.")
    elif body.action == "complete":
        if not (manage or is_reviewer):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an assigned reviewer can complete this review.")
        if review.status != "joint_review":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A review can only be completed from the joint review stage.")
        if svc.compute_averages(review.joint_scores or {})[1] is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Score the joint evaluation before completing.")
    elif body.action == "reopen":
        if not manage:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviews edit access required.")
        if review.status == "self_assessment":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This review is already open.")
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='action must be "submit_self", "submit_manager", "complete" or "reopen"')

    was_in_review = review.status == "in_review"
    try:
        review = svc.transition_review(db, review, body.action, actor_id=current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    out = _out(db, review, current_employee, manage)
    if body.action == "submit_self":
        for reviewer_id in reviewer_ids:
            notify_self_assessment_submitted(out, _email_of(db, reviewer_id))
    elif body.action == "submit_manager" and was_in_review and review.status == "joint_review":
        # Only fires once the LAST reviewer's submission actually opened the
        # joint stage — not on every individual reviewer's submission.
        reviewer_emails = [_email_of(db, rid) for rid in reviewer_ids]
        notify_joint_review_ready(out, _email_of(db, review.employee_id), *reviewer_emails)
    elif body.action == "complete":
        notify_review_completed(out, _email_of(db, review.employee_id))
    return out


@performance_reviews_router.get("/{review_id}/export/xlsx")
def export_review_xlsx(
    review_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    review, manage = _load_visible(db, review_id, current_employee)
    if not manage and review.status != "completed":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The review can be exported once it's completed.")
    data = svc.review_export_data(db, review)
    content = generate_performance_review_xlsx(data)
    filename = export_filename(data)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            # ASCII fallback + RFC 5987 UTF-8 name (client/employee names may have accents)
            "Content-Disposition": (
                f'attachment; filename="{filename.encode("ascii", "ignore").decode()}"; '
                f"filename*=UTF-8''{quote(filename)}"
            ),
            "Cache-Control": "no-store",
        },
    )


@performance_reviews_router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    review, manage = _load_visible(db, review_id, current_employee)
    if not manage:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviews edit access required.")
    svc.delete_review(db, review)
