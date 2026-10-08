"""Project performance reviews — the Impact Point evaluation format.

The criteria and sub-criteria are fixed (REVIEW_TEMPLATE, copied verbatim from
the firm's review workbook) and served to the frontend via
GET /performance-reviews/template, so the panel and the .xlsx export always
render the same rows. Scores are stored per sub-criterion key in
`PerformanceReview.scores`; averages are always derived, never stored:
  - criterion average = mean of its rated sub-criteria (unrated ones skipped)
  - overall average   = mean of the rated criterion averages
"""
from typing import Dict, List, Optional, Tuple
from datetime import date, datetime, timezone
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.performance_reviews import PerformanceReview
from models.employees import Employee
from models.projects import Project
from models.clients import Client
from models.time_entries import TimeEntry

SCORE_MIN = 1
SCORE_MAX = 5

# `label` heads the criterion's section; `short_label` is what the "Average
# Score" summary block shows. Sub-criterion keys are persisted in
# PerformanceReview.scores — never rename one, only append.
REVIEW_TEMPLATE: List[dict] = [
    {
        "key": "written",
        "label": "Written Communications",
        "short_label": "Written Communications",
        "sub_criteria": [
            ("written_1", "Strong grasp of story boarding and knowing your audience"),
            ("written_2", "Defines the client's overall problem; accurately and creatively frames the issues"),
            ("written_3", "Develops clear recommendations with an action bias"),
            ("written_4", "Concise and effective written communication"),
            ("written_5", "Provide meaningful coaching to junior personnel on how to improve"),
        ],
    },
    {
        "key": "verbal",
        "label": "Verbal Communications",
        "short_label": "Verbal Communications",
        "sub_criteria": [
            ("verbal_1", "Presentations and meetings with clients are crisp/ clear \nManages conversations effectively; influences others’ perspectives"),
            ("verbal_2", "Demonstrates an understanding the client business\nPersuades based on facts and reason"),
            ("verbal_3", 'Demonstrates credibility and self-assurance; displays "executive" presence; and engages audience'),
            ("verbal_4", "Provides feedback and training to staff relating to improving communications"),
            ("verbal_5", "Portrays clear recommendations with an action bias \nSteers client and project team interaction; takes it to the next level"),
        ],
    },
    {
        "key": "analysis",
        "label": "Quality of Analysis",
        "short_label": "Quality of Analysis",
        "sub_criteria": [
            ("analysis_1", "Identifies key issues and linkages; scopes module \nPrioritizes analyses through hypothesis-driven approach"),
            ("analysis_2", "Can handle complex problems; delivers integrated solutions \nGoes beyond the obvious"),
            ("analysis_3", "Provides good insight\nDistills insight from analyses; goes beyond the obvious and identifies second order implications\nTranslates the output of analyses into practical recommendations"),
            ("analysis_4", "Motivates team creativity and uses team insight effectively"),
            ("analysis_5", "Accurate analysis / Limited rework\nChecks accuracy of juniors / own-work"),
        ],
    },
    {
        "key": "client",
        "label": "Client Management",
        "short_label": "Client Management",
        "sub_criteria": [
            ("client_1", "Clarifies initial objectives and manages scope throughout the project; effectively structures work \nIs reliable and timely; manages client / team expectations"),
            ("client_2", "Builds strong client relationships at appropriate levels / rapport building"),
            ("client_3", "Builds trust with client\nUnderstands client’s organizational dynamics and adapts behavior accordingly"),
            ("client_4", "Can prioritize multiple workstreams or projects\nPrioritizes work effectively; demonstrates business sense and adaptability"),
            ("client_5", "Identifies opportunities for add-ons\nBudget and scoping management\nBilling and collections management"),
        ],
    },
    {
        "key": "professionalism",
        "label": "Overall Professionalism and Core Values",
        "short_label": "Professionalism / Values",
        "sub_criteria": [
            ("professionalism_1", "Time Management / Delivers to deadlines\nDisplays perseverance and tenacity in the face of obstacles; responds calmly to stressful situations"),
            ("professionalism_2", "Demonstrates DRIVE values\nContributes to positive working environment\nIs available and approachable; creates sufficient time to engage on content \nOverall attitude, work ethic and professionalism\nTreats all others with respect regardless of background, position or performance"),
            ("professionalism_3", "Provides coaching to junior personnel (where applicable)\nProvides frequent and timely feedback; coaches effectively"),
            ("professionalism_4", "Performs role with highest level of integrity, generating trust and protecting client interests"),
        ],
    },
]

SUB_CRITERION_KEYS = {sub_key for c in REVIEW_TEMPLATE for sub_key, _ in c["sub_criteria"]}

# Who may change which fields (see routers/performance_reviews.py):
#   - the reviewee: project details + self-assessment, only while `self_assessment`
#   - the reviewer: scores + reviewer notes, until `completed`
#   - Admin/Manager (Reviews edit access): everything, any time
EMPLOYEE_FIELDS = {
    "project_description", "employee_role",
    "self_strengths", "self_improvement", "self_development",
}
REVIEWER_FIELDS = {
    "scores", "reviewer_strengths_notes", "reviewer_improvement_notes", "reviewer_development_notes",
}
ADMIN_FIELDS = EMPLOYEE_FIELDS | REVIEWER_FIELDS | {
    "reviewer_id", "review_date", "period_start", "period_end", "duration_hours",
}


def template_out() -> dict:
    return {
        "score_min": SCORE_MIN,
        "score_max": SCORE_MAX,
        "criteria": [
            {
                "key": c["key"],
                "label": c["label"],
                "short_label": c["short_label"],
                "sub_criteria": [{"key": k, "label": label} for k, label in c["sub_criteria"]],
            }
            for c in REVIEW_TEMPLATE
        ],
    }


def _mean(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 2) if values else None


def compute_averages(scores: Dict[str, dict]) -> Tuple[List[dict], Optional[float]]:
    """Returns ([{key, label, average}] per criterion, overall average)."""
    criteria = []
    for c in REVIEW_TEMPLATE:
        rated = [
            float(scores[k]["score"])
            for k, _ in c["sub_criteria"]
            if k in scores and scores[k].get("score") is not None
        ]
        criteria.append({"key": c["key"], "label": c["short_label"], "average": _mean(rated)})
    overall = _mean([c["average"] for c in criteria if c["average"] is not None])
    return criteria, overall


def normalize_scores(raw: Dict[str, dict]) -> Dict[str, dict]:
    """Validates keys/ranges and drops empty entries. Raises ValueError."""
    clean: Dict[str, dict] = {}
    for key, entry in (raw or {}).items():
        if key not in SUB_CRITERION_KEYS:
            raise ValueError(f"Unknown sub-criterion: {key}")
        score = entry.get("score")
        notes = (entry.get("notes") or "").strip() or None
        if score is not None and not (SCORE_MIN <= int(score) <= SCORE_MAX):
            raise ValueError(f"Scores must be between {SCORE_MIN} and {SCORE_MAX}.")
        if score is None and notes is None:
            continue
        clean[key] = {"score": int(score) if score is not None else None, "notes": notes}
    return clean


def logged_hours(
    db: Session, employee_id: str, project_id: str,
    period_start: Optional[date] = None, period_end: Optional[date] = None,
) -> float:
    q = db.query(func.coalesce(func.sum(TimeEntry.hours), 0)).filter(
        TimeEntry.user_id == employee_id, TimeEntry.project_id == project_id,
    )
    if period_start:
        q = q.filter(TimeEntry.date >= period_start)
    if period_end:
        q = q.filter(TimeEntry.date <= period_end)
    return float(q.scalar() or 0)


def _lookups(db: Session, reviews: List[PerformanceReview]) -> Tuple[dict, dict]:
    emp_ids = {r.employee_id for r in reviews} | {r.reviewer_id for r in reviews if r.reviewer_id}
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(emp_ids)).all()) if emp_ids else {}
    project_ids = {r.project_id for r in reviews}
    project_by_id = {}
    if project_ids:
        rows = (
            db.query(Project.id, Project.name, Client.name)
            .outerjoin(Client, Client.id == Project.client_id)
            .filter(Project.id.in_(project_ids))
            .all()
        )
        project_by_id = {pid: (pname, cname) for pid, pname, cname in rows}
    return name_by_id, project_by_id


def to_out_dict(review: PerformanceReview, name_by_id: dict, project_by_id: dict, hide_reviewer_section: bool = False) -> dict:
    project_name, client_name = project_by_id.get(review.project_id, ("Unknown", None))
    scores = review.scores or {}
    criteria_averages, overall = compute_averages(scores)
    out = {
        "id": review.id,
        "project_id": review.project_id,
        "project_name": project_name,
        "client_name": client_name,
        "employee_id": review.employee_id,
        "employee_name": name_by_id.get(review.employee_id, "Unknown"),
        "reviewer_id": review.reviewer_id,
        "reviewer_name": name_by_id.get(review.reviewer_id) if review.reviewer_id else None,
        "review_date": review.review_date,
        "period_start": review.period_start,
        "period_end": review.period_end,
        "duration_hours": float(review.duration_hours) if review.duration_hours is not None else None,
        "project_description": review.project_description,
        "employee_role": review.employee_role,
        "self_strengths": review.self_strengths,
        "self_improvement": review.self_improvement,
        "self_development": review.self_development,
        "reviewer_strengths_notes": review.reviewer_strengths_notes,
        "reviewer_improvement_notes": review.reviewer_improvement_notes,
        "reviewer_development_notes": review.reviewer_development_notes,
        "scores": scores,
        "criteria_averages": criteria_averages,
        "overall_average": overall,
        "status": review.status,
        "reviewer_section_visible": not hide_reviewer_section,
        "self_submitted_at": review.self_submitted_at,
        "completed_at": review.completed_at,
        "created_at": review.created_at,
        "updated_at": review.updated_at,
    }
    if hide_reviewer_section:
        out.update({
            "reviewer_strengths_notes": None,
            "reviewer_improvement_notes": None,
            "reviewer_development_notes": None,
            "scores": {},
            "criteria_averages": [{**c, "average": None} for c in criteria_averages],
            "overall_average": None,
        })
    return out


def get_review(db: Session, review_id: str) -> Optional[PerformanceReview]:
    return db.query(PerformanceReview).filter(PerformanceReview.id == review_id).first()


def list_reviews(
    db: Session,
    visible_to: Optional[str] = None,
    project_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[PerformanceReview]:
    q = db.query(PerformanceReview)
    if visible_to:
        q = q.filter((PerformanceReview.employee_id == visible_to) | (PerformanceReview.reviewer_id == visible_to))
    if project_id:
        q = q.filter(PerformanceReview.project_id == project_id)
    if employee_id:
        q = q.filter(PerformanceReview.employee_id == employee_id)
    if status:
        q = q.filter(PerformanceReview.status == status)
    return q.order_by(PerformanceReview.review_date.desc(), PerformanceReview.created_at.desc()).all()


def serialize(db: Session, reviews: List[PerformanceReview], viewer_id: str, viewer_can_manage: bool) -> List[dict]:
    name_by_id, project_by_id = _lookups(db, reviews)
    return [
        to_out_dict(r, name_by_id, project_by_id, hide_reviewer_section=hides_reviewer_section(r, viewer_id, viewer_can_manage))
        for r in reviews
    ]


def hides_reviewer_section(review: PerformanceReview, viewer_id: str, viewer_can_manage: bool) -> bool:
    """The reviewee doesn't see the reviewer's scores/notes until completion."""
    return (
        not viewer_can_manage
        and review.reviewer_id != viewer_id
        and review.employee_id == viewer_id
        and review.status != "completed"
    )


def create_review(db: Session, data, created_by: str) -> PerformanceReview:
    project = db.query(Project).filter(Project.id == data.project_id).first()
    reviewer_id = data.reviewer_id or (project.manager_id if project else None) or (project.owner_id if project else None)
    duration = data.duration_hours
    if duration is None:
        duration = logged_hours(db, data.employee_id, data.project_id, data.period_start, data.period_end)
    review = PerformanceReview(
        id=str(uuid.uuid4()),
        project_id=data.project_id,
        employee_id=data.employee_id,
        reviewer_id=reviewer_id,
        created_by=created_by,
        review_date=data.review_date,
        period_start=data.period_start,
        period_end=data.period_end,
        duration_hours=duration,
        project_description=data.project_description or (project.description if project else None),
        scores={},
        status="self_assessment",
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def update_review(db: Session, review: PerformanceReview, changes: dict) -> PerformanceReview:
    if "scores" in changes:
        changes["scores"] = normalize_scores({k: dict(v) for k, v in (changes["scores"] or {}).items()})
    for field, value in changes.items():
        setattr(review, field, value)
    db.commit()
    db.refresh(review)
    return review


def transition_review(db: Session, review: PerformanceReview, action: str) -> PerformanceReview:
    now = datetime.now(timezone.utc)
    if action == "submit_self":
        review.status = "in_review"
        review.self_submitted_at = now
    elif action == "complete":
        review.status = "completed"
        review.completed_at = now
    elif action == "reopen":
        if review.status == "completed":
            review.status = "in_review"
            review.completed_at = None
        else:
            review.status = "self_assessment"
            review.self_submitted_at = None
    db.commit()
    db.refresh(review)
    return review


def delete_review(db: Session, review: PerformanceReview) -> None:
    db.delete(review)
    db.commit()


def review_export_data(db: Session, review: PerformanceReview) -> dict:
    """Everything the .xlsx export needs, with names resolved."""
    name_by_id, project_by_id = _lookups(db, [review])
    data = to_out_dict(review, name_by_id, project_by_id)
    emp = db.query(Employee).filter(Employee.id == review.employee_id).first()
    if emp and emp.first_name and emp.last_name:
        data["employee_display_name"] = f"{emp.last_name.strip()}, {emp.first_name.strip()}"
    else:
        data["employee_display_name"] = data["employee_name"]
    return data
