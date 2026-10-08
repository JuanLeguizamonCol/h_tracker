"""Project performance reviews — the Impact Point evaluation format.

The criteria and sub-criteria are fixed (REVIEW_TEMPLATE, copied verbatim from
the firm's review workbook) and served to the frontend via
GET /performance-reviews/template, so the panel and the .xlsx export always
render the same rows. Every review carries three evaluations of that template
(self, manager, joint - see SCORE_SETS); each stores scores per sub-criterion
key in its own JSON column, and averages are always derived, never stored:
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
# PerformanceReview.{self,manager,joint}_scores — never rename one, only append.
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

# The three evaluations every review carries, each scoring the same template.
# Only the joint one is official: it's what `overall_average` reports and what
# the annual measurement (analytics) averages across an employee's reviews.
SCORE_SETS = ("self", "manager", "joint")
SCORE_COLUMNS = {"self": "self_scores", "manager": "manager_scores", "joint": "joint_scores"}

# Lifecycle order — see models/performance_reviews.py::REVIEW_STATUSES.
_STAGE = {"self_assessment": 0, "in_review": 1, "joint_review": 2, "completed": 3}

# Who may change which fields, and when (see routers/performance_reviews.py):
#   - the reviewee: project details + self-assessment text + self scores, while `self_assessment`
#   - the reviewer: manager scores + reviewer notes until submitted (in parallel with the self);
#                   joint scores + joint notes while `joint_review`
#   - Admin/Manager (Reviews edit access): everything, any time
EMPLOYEE_FIELDS = {
    "project_description", "employee_role",
    "self_strengths", "self_improvement", "self_development", "self_scores",
}
REVIEWER_FIELDS = {
    "manager_scores", "reviewer_strengths_notes", "reviewer_improvement_notes", "reviewer_development_notes",
}
JOINT_FIELDS = {"joint_scores", "joint_notes"}
ADMIN_FIELDS = EMPLOYEE_FIELDS | REVIEWER_FIELDS | JOINT_FIELDS | {
    "reviewer_id", "review_date", "period_start", "period_end", "duration_hours",
}


def editable_fields(review: PerformanceReview, viewer_id: str, viewer_can_manage: bool) -> set:
    if viewer_can_manage:
        return set(ADMIN_FIELDS)
    allowed = set()
    if review.employee_id == viewer_id and review.status == "self_assessment":
        allowed |= EMPLOYEE_FIELDS
    if review.reviewer_id == viewer_id:
        # Blind to each other, so the manager can score in parallel with the
        # employee's self evaluation — only *submitting* it waits for the self.
        if review.status in ("self_assessment", "in_review"):
            allowed |= REVIEWER_FIELDS
        elif review.status == "joint_review":
            allowed |= JOINT_FIELDS
    return allowed


def visibility(review: PerformanceReview, viewer_id: str, viewer_can_manage: bool) -> Dict[str, bool]:
    """Self and manager evaluations are blind to each other until the joint
    stage, so neither anchors on the other's scores:
      - reviewee: own self always; manager + joint from `joint_review` on
      - reviewer: own manager always; self text once submitted; self scores +
        joint from `joint_review` on
      - Admin/Manager: everything
    """
    if viewer_can_manage:
        return {"self": True, "self_text": True, "manager": True, "joint": True}
    stage = _STAGE.get(review.status, 0)
    is_reviewee = review.employee_id == viewer_id
    is_reviewer = review.reviewer_id == viewer_id
    together = stage >= _STAGE["joint_review"]
    return {
        "self": is_reviewee or together,
        "self_text": is_reviewee or stage >= _STAGE["in_review"],
        "manager": is_reviewer or together,
        "joint": together,
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


def _set_out(scores: Optional[Dict[str, dict]], visible: bool) -> dict:
    scores = (scores or {}) if visible else {}
    criteria, overall = compute_averages(scores)
    return {"visible": visible, "scores": scores, "criteria_averages": criteria, "overall_average": overall}


def to_out_dict(review: PerformanceReview, name_by_id: dict, project_by_id: dict, visible: Optional[Dict[str, bool]] = None) -> dict:
    visible = visible or {"self": True, "self_text": True, "manager": True, "joint": True}
    project_name, client_name = project_by_id.get(review.project_id, ("Unknown", None))
    evaluations = {
        "self": _set_out(review.self_scores, visible["self"]),
        "manager": _set_out(review.manager_scores, visible["manager"]),
        "joint": _set_out(review.joint_scores, visible["joint"]),
    }
    self_text = visible["self_text"]
    manager = visible["manager"]
    return {
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
        "self_strengths": review.self_strengths if self_text else None,
        "self_improvement": review.self_improvement if self_text else None,
        "self_development": review.self_development if self_text else None,
        "reviewer_strengths_notes": review.reviewer_strengths_notes if manager else None,
        "reviewer_improvement_notes": review.reviewer_improvement_notes if manager else None,
        "reviewer_development_notes": review.reviewer_development_notes if manager else None,
        "joint_notes": review.joint_notes if visible["joint"] else None,
        "evaluations": evaluations,
        # The official score — joint only.
        "overall_average": evaluations["joint"]["overall_average"],
        "status": review.status,
        "self_submitted_at": review.self_submitted_at,
        "manager_submitted_at": review.manager_submitted_at,
        "completed_at": review.completed_at,
        "created_at": review.created_at,
        "updated_at": review.updated_at,
    }


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
        to_out_dict(r, name_by_id, project_by_id, visibility(r, viewer_id, viewer_can_manage))
        for r in reviews
    ]


def create_review(db: Session, data, created_by: str) -> PerformanceReview:
    project = db.query(Project).filter(Project.id == data.project_id).first()
    # First of: requested reviewer, project manager, project owner — skipping
    # the employee themselves (e.g. when the manager is the one being reviewed).
    candidates = [data.reviewer_id, project.manager_id if project else None, project.owner_id if project else None]
    reviewer_id = next((c for c in candidates if c and c != data.employee_id), None)
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
        self_scores={},
        manager_scores={},
        joint_scores={},
        status="self_assessment",
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def update_review(db: Session, review: PerformanceReview, changes: dict) -> PerformanceReview:
    for column in SCORE_COLUMNS.values():
        if column in changes:
            changes[column] = normalize_scores({k: dict(v) for k, v in (changes[column] or {}).items()})
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
    elif action == "submit_manager":
        review.status = "joint_review"
        review.manager_submitted_at = now
        # The joint session starts from the manager's scores and adjusts them.
        if not review.joint_scores:
            review.joint_scores = {
                k: {"score": v.get("score"), "notes": None}
                for k, v in (review.manager_scores or {}).items()
                if v.get("score") is not None
            }
    elif action == "complete":
        review.status = "completed"
        review.completed_at = now
    elif action == "reopen":
        if review.status == "completed":
            review.status = "joint_review"
            review.completed_at = None
        elif review.status == "joint_review":
            review.status = "in_review"
            review.manager_submitted_at = None
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
    """Everything the .xlsx export needs, with names resolved (unfiltered —
    callers check access first)."""
    name_by_id, project_by_id = _lookups(db, [review])
    data = to_out_dict(review, name_by_id, project_by_id)
    emp = db.query(Employee).filter(Employee.id == review.employee_id).first()
    if emp and emp.first_name and emp.last_name:
        data["employee_display_name"] = f"{emp.last_name.strip()}, {emp.first_name.strip()}"
    else:
        data["employee_display_name"] = data["employee_name"]
    return data


def analytics(db: Session, year: Optional[int] = None) -> dict:
    """Completed reviews (optionally of one review-date year) with every
    evaluation's criterion averages and item scores — the Analytics tab builds
    its employee / project / item matrices from this. The annual measurement
    per employee is the plain mean of their reviews' joint overall averages."""
    completed = db.query(PerformanceReview).filter(PerformanceReview.status == "completed")
    years = sorted({d.year for (d,) in completed.with_entities(PerformanceReview.review_date).all()}, reverse=True)
    reviews = completed.order_by(PerformanceReview.review_date).all()
    if year:
        reviews = [r for r in reviews if r.review_date.year == year]
    name_by_id, project_by_id = _lookups(db, reviews)

    def _set(scores):
        criteria, overall = compute_averages(scores or {})
        return {
            "criteria": {c["key"]: c["average"] for c in criteria},
            "overall": overall,
            "items": {k: v.get("score") for k, v in (scores or {}).items() if v.get("score") is not None},
        }

    rows = []
    for r in reviews:
        project_name, client_name = project_by_id.get(r.project_id, ("Unknown", None))
        rows.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": name_by_id.get(r.employee_id, "Unknown"),
            "project_id": r.project_id,
            "project_name": project_name,
            "client_name": client_name,
            "reviewer_name": name_by_id.get(r.reviewer_id) if r.reviewer_id else None,
            "review_date": r.review_date,
            "duration_hours": float(r.duration_hours) if r.duration_hours is not None else None,
            "self": _set(r.self_scores),
            "manager": _set(r.manager_scores),
            "joint": _set(r.joint_scores),
        })
    return {"years": years, "year": year, "reviews": rows}


# ---------- Projects panel ----------

def list_review_projects(db: Session, include_inactive: bool = False) -> List[dict]:
    """Every client (non-internal) project with its review flag, team size and
    review counts by status — the Reviews panel's main table."""
    from models.employee_projects import EmployeeProject

    q = (
        db.query(Project, Client.name)
        .outerjoin(Client, Client.id == Project.client_id)
        .filter(Project.is_internal.is_(False))
    )
    if not include_inactive:
        # Projects already running reviews stay visible even once inactive.
        q = q.filter((Project.is_active.is_(True)) | (Project.performance_review_enabled.is_(True)))
    rows = q.all()
    if not rows:
        return []
    project_ids = [p.id for p, _ in rows]

    team_size = dict(
        db.query(EmployeeProject.project_id, func.count(func.distinct(EmployeeProject.user_id)))
        .filter(EmployeeProject.project_id.in_(project_ids))
        .group_by(EmployeeProject.project_id)
        .all()
    )
    counts: Dict[str, Dict[str, int]] = {}
    for pid, st, n in (
        db.query(PerformanceReview.project_id, PerformanceReview.status, func.count(PerformanceReview.id))
        .filter(PerformanceReview.project_id.in_(project_ids))
        .group_by(PerformanceReview.project_id, PerformanceReview.status)
        .all()
    ):
        counts.setdefault(pid, {})[st] = n
    manager_ids = {p.manager_id for p, _ in rows if p.manager_id}
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(manager_ids)).all()) if manager_ids else {}

    out = []
    for p, client_name in rows:
        c = counts.get(p.id, {})
        out.append({
            "id": p.id,
            "name": p.name,
            "project_code": p.project_code,
            "client_name": client_name,
            "manager_id": p.manager_id,
            "manager_name": name_by_id.get(p.manager_id) if p.manager_id else None,
            "is_active": bool(p.is_active),
            "status": p.status,
            "performance_review_enabled": bool(p.performance_review_enabled),
            "team_size": team_size.get(p.id, 0),
            "reviews_total": sum(c.values()),
            "reviews_self_assessment": c.get("self_assessment", 0),
            "reviews_in_review": c.get("in_review", 0),
            "reviews_joint_review": c.get("joint_review", 0),
            "reviews_completed": c.get("completed", 0),
        })
    out.sort(key=lambda r: (not r["performance_review_enabled"], (r["client_name"] or "").lower(), r["name"].lower()))
    return out


def set_project_review_enabled(db: Session, project: Project, enabled: bool) -> None:
    project.performance_review_enabled = enabled
    db.commit()


def project_team(db: Session, project_id: str) -> List[dict]:
    """Everyone who's staffed on the project or has logged time on it, with
    their logged hours and reviews on this project (newest first)."""
    from models.employee_projects import EmployeeProject
    from models.project_roles import ProjectRole

    assignments = db.query(EmployeeProject).filter(EmployeeProject.project_id == project_id).all()
    role_ids = {a.role_id for a in assignments if a.role_id}
    role_name_by_id = dict(db.query(ProjectRole.id, ProjectRole.name).filter(ProjectRole.id.in_(role_ids)).all()) if role_ids else {}
    role_by_emp = {a.user_id: role_name_by_id.get(a.role_id) for a in assignments}

    hours_by_emp = dict(
        db.query(TimeEntry.user_id, func.sum(TimeEntry.hours))
        .filter(TimeEntry.project_id == project_id)
        .group_by(TimeEntry.user_id)
        .all()
    )
    reviews = list_reviews(db, project_id=project_id)
    emp_ids = set(role_by_emp) | set(hours_by_emp) | {r.employee_id for r in reviews}
    if not emp_ids:
        return []
    employees = db.query(Employee).filter(Employee.id.in_(emp_ids)).all()
    reviewer_ids = {r.reviewer_id for r in reviews if r.reviewer_id}
    reviewer_names = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(reviewer_ids)).all()) if reviewer_ids else {}

    reviews_by_emp: Dict[str, List[dict]] = {}
    for r in reviews:  # already newest first
        _, overall = compute_averages(r.joint_scores or {})
        reviews_by_emp.setdefault(r.employee_id, []).append({
            "id": r.id,
            "status": r.status,
            "review_date": r.review_date,
            "reviewer_id": r.reviewer_id,
            "reviewer_name": reviewer_names.get(r.reviewer_id) if r.reviewer_id else None,
            "overall_average": overall,
        })

    team = [
        {
            "employee_id": e.id,
            "name": e.name,
            "title": e.title,
            "role_name": role_by_emp.get(e.id),
            "is_assigned": e.id in role_by_emp,
            "is_active": bool(e.is_active),
            "logged_hours": float(hours_by_emp.get(e.id) or 0),
            "reviews": reviews_by_emp.get(e.id, []),
        }
        for e in employees
    ]
    team.sort(key=lambda m: (not m["is_assigned"], not m["is_active"], m["name"].lower()))
    return team


def has_open_review(db: Session, project_id: str, employee_id: str) -> bool:
    return db.query(PerformanceReview.id).filter(
        PerformanceReview.project_id == project_id,
        PerformanceReview.employee_id == employee_id,
        PerformanceReview.status != "completed",
    ).first() is not None
