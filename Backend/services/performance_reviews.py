"""Project performance reviews — the Impact Point evaluation formats.

The criteria and sub-criteria are fixed per format (TEMPLATES, copied verbatim
from the firm's review workbooks) and served to the frontend via
GET /performance-reviews/template?format=…, so the panel and the .xlsx export
always render the same rows. Every review carries:
  - a self-assessment (employee: comments per section, no scores), and
  - ONE shared Manager Review — the official, definitive evaluation — that
    every assigned reviewer can edit (stored in the `joint_scores` /
    `joint_notes` / `manager_*_notes` columns; the column names predate the
    removal of the separate "Final Submission" stage).
Scores are stored per sub-criterion key in JSON, and averages are always
derived, never stored:
  - criterion average = mean of its rated sub-criteria (unrated ones skipped)
  - overall average   = mean of the rated criterion averages
"""
from typing import Dict, List, Optional, Tuple
from datetime import date, datetime, timezone
import uuid

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.performance_reviews import PerformanceReview, PerformanceReviewReviewer, DEFAULT_EVALUATION_FORMAT
from models.employees import Employee
from models.projects import Project
from models.clients import Client
from models.time_entries import TimeEntry

SCORE_MIN = 1
SCORE_MAX = 5

# `label` heads the criterion's section; `short_label` is what the "Average
# Score" summary block shows. Sub-criterion keys are persisted in the scores
# JSON columns — never rename one, only append.
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

# "Seniors and Managers Review" — copied verbatim from the firm's
# "Project Performance Review Template - Manager / SA" workbook. Same five
# criteria (same criterion keys, so per-criterion analytics, section comments
# and the summary block line up across formats) but its own sub-criteria,
# under their own `md_` keys (the format was first named "Managers and
# Directors") — never reuse another format's key for a different item, the
# scores JSON is keyed by them.
SENIORS_MANAGERS_TEMPLATE: List[dict] = [
    {
        "key": "written",
        "label": "Written Communications",
        "short_label": "Written Communications",
        "sub_criteria": [
            ("md_written_1", "Ability to build presentation decks, process flows, report writing, etc."),
            ("md_written_2", "Use graphical and charting techniques to improve the quality of deliverables"),
            ("md_written_3", "Accurate information presented"),
            ("md_written_4", "Strong grasp of story boarding and knowing your audience"),
            ("md_written_5", "Uses concise and effective written communication (slide design, memos, emails, etc.)"),
        ],
    },
    {
        "key": "verbal",
        "label": "Verbal Communications",
        "short_label": "Verbal Communications",
        "sub_criteria": [
            ("md_verbal_1", "Presentations and meetings with clients are clear \nManages conversations effectively; influences others'\nperspectives"),
            ("md_verbal_2", "Crisp presentations, and demonstrating of understanding the client business\nPersuades on the basis of facts and reason"),
            ("md_verbal_3", "Engages audience, projects self-assurance; displays strong presence"),
        ],
    },
    {
        "key": "analysis",
        "label": "Quality of Analysis",
        "short_label": "Quality of Analysis",
        "sub_criteria": [
            ("md_analysis_1", "Identifies key issues and linkages; scopes module and\nPrioritizes analyses through hypothesis-driven approach"),
            ("md_analysis_2", "Conducts complex qualitative and quantitative analysis independently and effectively"),
            ("md_analysis_3", "Provides good insight\nDistills insight from analyses; goes beyond the obvious and identifies second order implications\nTranslates the output of analyses into practical recommendations"),
            ("md_analysis_4", "Raises issues / questions to leaders when needed"),
            ("md_analysis_5", "Accurate analysis / Limited rework\nChecks accuracy of juniors / own-work"),
        ],
    },
    {
        "key": "client",
        "label": "Client Management",
        "short_label": "Client Management",
        "sub_criteria": [
            ("md_client_1", "Delivers to deadlines\nIs reliable and timely; manages team expectations"),
            ("md_client_2", "Rapport building\nBuilds strong client relationships at appropriate levels\nBuilds trust with client\nUnderstands client’s organizational dynamics and adapts behavior accordingly"),
            ("md_client_3", "Can prioritize multiple workstreams or projects\nPrioritizes work effectively; demonstrates business sense and adaptability"),
            ("md_client_4", "Demonstrates understanding of the client's overall problem and the analytic steps required to solve it"),
        ],
    },
    {
        "key": "professionalism",
        "label": "Overall Professionalism and Core Values",
        "short_label": "Professionalism / Values",
        "sub_criteria": [
            ("md_professionalism_1", "Time Management / Delivers to deadlines\nDisplays perseverance and tenacity in the face of obstacles; responds calmly to stressful situations"),
            ("md_professionalism_2", "Demonstrates DRIVE values\nContributes to positive working environment\nOverall attitude, work ethic and professionalism\nTreats all others with respect regardless of background, position or performance"),
            ("md_professionalism_3", "Provides coaching to junior personnel (where applicable)"),
            ("md_professionalism_4", "Performs role with highest level of integrity, generating trust and protecting client interests"),
        ],
    },
]

# Review formats — every review carries the chosen key (set at assignment
# time, see evaluation_format), and everything that walks the criteria
# (averages, score validation, the panel, the .xlsx export) resolves the
# template through get_template(review.evaluation_format).
EVALUATION_FORMATS = {
    "standard": "Principals and Directors Review",
    "seniors_managers": "Seniors and Managers Review",
}
TEMPLATES: Dict[str, List[dict]] = {
    # REVIEW_TEMPLATE is the "Project Performance Review Template - Prin / DIR"
    # workbook, item for item — kept under the original "standard" key so
    # every existing review keeps resolving to it.
    "standard": REVIEW_TEMPLATE,
    "seniors_managers": SENIORS_MANAGERS_TEMPLATE,
}


def get_template(fmt: Optional[str] = None) -> List[dict]:
    """The criteria for a format; unknown/empty falls back to the standard
    one (older rows predate the column default)."""
    return TEMPLATES.get(fmt or DEFAULT_EVALUATION_FORMAT, REVIEW_TEMPLATE)


def sub_criterion_keys(fmt: Optional[str] = None) -> set:
    return {sub_key for c in get_template(fmt) for sub_key, _ in c["sub_criteria"]}


# Standard-format keys — kept for backward compat (tests/imports).
SUB_CRITERION_KEYS = sub_criterion_keys("standard")


def has_any_scores(review: PerformanceReview) -> bool:
    """True once anyone has rated/annotated something — the format can't be
    switched after that (the stored keys belong to the old template)."""
    return bool(review.self_scores or review.joint_scores)


# Lifecycle order — see models/performance_reviews.py::REVIEW_STATUSES.
_STAGE = {"self_assessment": 0, "in_review": 1, "completed": 2}

# Who may change which top-level fields, and when (see
# routers/performance_reviews.py):
#   - the reviewee: project details + self-assessment text (incl. the
#     per-section comments), while `self_assessment` AND before self_due_date
#   - any assigned reviewer: the shared Manager Review (MANAGER_FIELDS) once
#     the self-assessment has been submitted (status == in_review), until the
#     review is completed — every reviewer edits the same evaluation
#   - Admin/Manager (Reviews edit access): purely administrative fields, any
#     time (create/assign/enable reviews, correct dates/roster/format) — NOT
#     evaluation content (self text, Manager Review scores/notes).
EMPLOYEE_FIELDS = {
    "project_description", "employee_role",
    "self_strengths", "self_improvement", "self_development", "self_section_comments",
}
# API field → model column for the shared Manager Review.
MANAGER_FIELD_COLUMNS = {
    "manager_scores": "joint_scores",
    "manager_notes": "joint_notes",
    "manager_strengths_notes": "manager_strengths_notes",
    "manager_improvement_notes": "manager_improvement_notes",
    "manager_development_notes": "manager_development_notes",
}
MANAGER_FIELDS = set(MANAGER_FIELD_COLUMNS)
ADMIN_META_FIELDS = {
    "reviewer_ids", "review_date", "self_due_date", "evaluation_format",
    "period_start", "period_end", "duration_hours",
}
# Kept for backward compat (tests, docs).
ADMIN_FIELDS = ADMIN_META_FIELDS


def is_reviewer(review: PerformanceReview, viewer_id: Optional[str]) -> bool:
    return bool(viewer_id) and any(r.reviewer_id == viewer_id for r in review.reviewers)


def self_assessment_locked(review: PerformanceReview, today: Optional[date] = None) -> bool:
    """True once the self-assessment deadline has passed and it still hasn't
    been submitted — the employee can no longer edit or submit it (an Admin
    can still extend self_due_date, which is administrative metadata, not
    evaluation content — see editable_fields)."""
    if review.status != "self_assessment" or review.self_due_date is None:
        return False
    return (today or date.today()) > review.self_due_date


def editable_fields(review: PerformanceReview, viewer_id: str, viewer_can_manage: bool) -> set:
    allowed = set()
    if viewer_can_manage:
        allowed |= ADMIN_META_FIELDS
    if review.employee_id == viewer_id and review.status == "self_assessment" and not self_assessment_locked(review):
        allowed |= EMPLOYEE_FIELDS
    # Reviewers can't start until the self-assessment has been submitted;
    # from then until completion, every assigned reviewer edits the same
    # shared Manager Review.
    if is_reviewer(review, viewer_id) and review.status == "in_review":
        allowed |= MANAGER_FIELDS
    return allowed


def visibility(review: PerformanceReview, viewer_id: str, viewer_can_manage: bool) -> Dict[str, bool]:
    """  - self: the reviewee always; anyone else who can access the review
               (an assigned reviewer, Admin/Manager) once it's submitted
      - manager (the shared Manager Review): every assigned reviewer, always
               (it's theirs to write together); the reviewee and
               Admin/Manager only once the review is completed — Admin's
               elevated access is for administrative actions, not for
               peeking at an evaluation still in progress.
    """
    completed = review.status == "completed"
    return {
        "self": review.employee_id == viewer_id or review.self_submitted_at is not None,
        "manager": is_reviewer(review, viewer_id) or completed,
    }


def template_out(fmt: Optional[str] = None) -> dict:
    fmt = fmt if fmt in TEMPLATES else DEFAULT_EVALUATION_FORMAT
    return {
        "format": fmt,
        "format_label": EVALUATION_FORMATS[fmt],
        "score_min": SCORE_MIN,
        "score_max": SCORE_MAX,
        "criteria": [
            {
                "key": c["key"],
                "label": c["label"],
                "short_label": c["short_label"],
                "sub_criteria": [{"key": k, "label": label} for k, label in c["sub_criteria"]],
            }
            for c in get_template(fmt)
        ],
    }


def _mean(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 2) if values else None


def compute_averages(scores: Dict[str, dict], fmt: Optional[str] = None) -> Tuple[List[dict], Optional[float]]:
    """Returns ([{key, label, average}] per criterion, overall average)."""
    criteria = []
    for c in get_template(fmt):
        rated = [
            float(scores[k]["score"])
            for k, _ in c["sub_criteria"]
            if k in scores and scores[k].get("score") is not None
        ]
        criteria.append({"key": c["key"], "label": c["short_label"], "average": _mean(rated)})
    overall = _mean([c["average"] for c in criteria if c["average"] is not None])
    return criteria, overall


def normalize_scores(raw: Dict[str, dict], fmt: Optional[str] = None) -> Dict[str, dict]:
    """Validates keys/ranges. Raises ValueError.

    Keeps every entry the caller sends, including a bare
    {"score": None, "notes": None} — that's an explicit "marked N/A, no
    notes" (see ScorePicker/naSelected in PerformanceReviewPage.tsx), not an
    empty/untouched item: the frontend only ever includes a sub-criterion key
    here once the user has actually interacted with it.
    """
    clean: Dict[str, dict] = {}
    valid_keys = sub_criterion_keys(fmt)
    for key, entry in (raw or {}).items():
        if key not in valid_keys:
            raise ValueError(f"Unknown sub-criterion: {key}")
        score = entry.get("score")
        notes = (entry.get("notes") or "").strip() or None
        if score is not None and not (SCORE_MIN <= int(score) <= SCORE_MAX):
            raise ValueError(f"Scores must be between {SCORE_MIN} and {SCORE_MAX}.")
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
    emp_ids = {r.employee_id for r in reviews}
    for r in reviews:
        emp_ids |= {rr.reviewer_id for rr in r.reviewers}
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


def _set_out(scores: Optional[Dict[str, dict]], visible: bool, section_comments: Optional[Dict[str, str]] = None, fmt: Optional[str] = None) -> dict:
    scores = (scores or {}) if visible else {}
    criteria, overall = compute_averages(scores, fmt)
    out = {"visible": visible, "scores": scores, "criteria_averages": criteria, "overall_average": overall}
    if section_comments is not None:
        out["section_comments"] = section_comments if visible else {}
    return out


def to_out_dict(
    review: PerformanceReview, name_by_id: dict, project_by_id: dict,
    viewer_id: Optional[str] = None, viewer_can_manage: bool = False, force_visible: bool = False,
) -> dict:
    """`force_visible` shows every evaluation regardless of stage — used only
    by review_export_data for the .xlsx export, which is an explicit,
    deliberate action to produce a full record, not passive browsing."""
    vis = {"self": True, "manager": True} if force_visible else visibility(review, viewer_id, viewer_can_manage)
    fmt = review.evaluation_format or DEFAULT_EVALUATION_FORMAT
    project_name, client_name = project_by_id.get(review.project_id, ("Unknown", None))
    show_manager = vis["manager"]

    manager = _set_out(review.joint_scores, show_manager, fmt=fmt)
    manager.update({
        "strengths_notes": review.manager_strengths_notes if show_manager else None,
        "improvement_notes": review.manager_improvement_notes if show_manager else None,
        "development_notes": review.manager_development_notes if show_manager else None,
        "notes": review.joint_notes if show_manager else None,
    })
    evaluations = {
        "self": _set_out(review.self_scores, vis["self"], review.self_section_comments, fmt),
        "manager": manager,
    }
    self_visible = vis["self"]
    return {
        "id": review.id,
        "project_id": review.project_id,
        "project_name": project_name,
        "client_name": client_name,
        "employee_id": review.employee_id,
        "employee_name": name_by_id.get(review.employee_id, "Unknown"),
        "reviewers": [
            {"reviewer_id": rr.reviewer_id, "reviewer_name": name_by_id.get(rr.reviewer_id)}
            for rr in review.reviewers
        ],
        "review_date": review.review_date,
        "self_due_date": review.self_due_date,
        "self_locked": self_assessment_locked(review),
        "evaluation_format": fmt,
        "evaluation_format_label": EVALUATION_FORMATS.get(fmt, fmt),
        "period_start": review.period_start,
        "period_end": review.period_end,
        "duration_hours": float(review.duration_hours) if review.duration_hours is not None else None,
        "project_description": review.project_description,
        "employee_role": review.employee_role,
        "self_strengths": review.self_strengths if self_visible else None,
        "self_improvement": review.self_improvement if self_visible else None,
        "self_development": review.self_development if self_visible else None,
        "evaluations": evaluations,
        # The official score — the Manager Review.
        "overall_average": manager["overall_average"],
        "status": review.status,
        "self_submitted_at": review.self_submitted_at,
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
        reviewer_subq = (
            db.query(PerformanceReviewReviewer.review_id)
            .filter(PerformanceReviewReviewer.reviewer_id == visible_to)
            .subquery()
        )
        q = q.filter(or_(PerformanceReview.employee_id == visible_to, PerformanceReview.id.in_(reviewer_subq)))
    if project_id:
        q = q.filter(PerformanceReview.project_id == project_id)
    if employee_id:
        q = q.filter(PerformanceReview.employee_id == employee_id)
    if status:
        q = q.filter(PerformanceReview.status == status)
    return q.order_by(PerformanceReview.review_date.desc(), PerformanceReview.created_at.desc()).all()


def serialize(db: Session, reviews: List[PerformanceReview], viewer_id: str, viewer_can_manage: bool) -> List[dict]:
    name_by_id, project_by_id = _lookups(db, reviews)
    return [to_out_dict(r, name_by_id, project_by_id, viewer_id, viewer_can_manage) for r in reviews]


def create_review(db: Session, data, created_by: str) -> PerformanceReview:
    project = db.query(Project).filter(Project.id == data.project_id).first()
    # Requested reviewers, deduped, never including the employee themselves.
    reviewer_ids = list(dict.fromkeys(
        rid for rid in (data.reviewer_ids or []) if rid and rid != data.employee_id
    ))
    if not reviewer_ids:
        # Default: project manager, then owner — same fallback as before N
        # reviewers existed, just yielding a list of (at most) one.
        candidates = [project.manager_id if project else None, project.owner_id if project else None]
        default_reviewer = next((c for c in candidates if c and c != data.employee_id), None)
        if default_reviewer:
            reviewer_ids = [default_reviewer]

    duration = data.duration_hours
    if duration is None:
        duration = logged_hours(db, data.employee_id, data.project_id, data.period_start, data.period_end)

    review = PerformanceReview(
        id=str(uuid.uuid4()),
        project_id=data.project_id,
        employee_id=data.employee_id,
        created_by=created_by,
        review_date=data.review_date,
        self_due_date=getattr(data, "self_due_date", None),
        evaluation_format=getattr(data, "evaluation_format", None) or DEFAULT_EVALUATION_FORMAT,
        period_start=data.period_start,
        period_end=data.period_end,
        duration_hours=duration,
        project_description=data.project_description or (project.description if project else None),
        self_scores={},
        self_section_comments={},
        joint_scores={},
        status="self_assessment",
    )
    db.add(review)
    db.flush()
    for reviewer_id in reviewer_ids:
        db.add(PerformanceReviewReviewer(review_id=review.id, reviewer_id=reviewer_id, scores={}))
    db.commit()
    db.refresh(review)
    return review


def update_review(db: Session, review: PerformanceReview, changes: dict) -> PerformanceReview:
    """Applies top-level field changes — including the reviewer roster and the
    shared Manager Review fields (mapped onto their columns, see
    MANAGER_FIELD_COLUMNS)."""
    if "reviewer_ids" in changes:
        new_ids = list(dict.fromkeys(
            rid for rid in (changes.pop("reviewer_ids") or []) if rid and rid != review.employee_id
        ))
        existing = {rr.reviewer_id: rr for rr in review.reviewers}
        for reviewer_id in new_ids:
            if reviewer_id not in existing:
                db.add(PerformanceReviewReviewer(review_id=review.id, reviewer_id=reviewer_id, scores={}))
        for reviewer_id, row in existing.items():
            if reviewer_id not in new_ids:
                db.delete(row)
    if "evaluation_format" in changes:
        new_fmt = changes["evaluation_format"] or DEFAULT_EVALUATION_FORMAT
        if new_fmt not in EVALUATION_FORMATS:
            raise ValueError(f"Unknown evaluation format: {new_fmt}")
        if new_fmt != (review.evaluation_format or DEFAULT_EVALUATION_FORMAT) and has_any_scores(review):
            raise ValueError("The evaluation format can't be changed once scoring has started.")
        changes["evaluation_format"] = new_fmt
    fmt = changes.get("evaluation_format") or review.evaluation_format
    for api_field, column in MANAGER_FIELD_COLUMNS.items():
        if api_field in changes:
            value = changes.pop(api_field)
            if api_field == "manager_scores":
                # Merged item by item, not replaced: several reviewers edit
                # this same evaluation, and the panel only sends the items the
                # caller actually changed — so two reviewers saving different
                # items don't overwrite each other.
                value = {
                    **(review.joint_scores or {}),
                    **normalize_scores({k: dict(v) for k, v in (value or {}).items()}, fmt),
                }
            changes[column] = value
    if "self_section_comments" in changes:
        criterion_keys = {c["key"] for c in get_template(fmt)}
        changes["self_section_comments"] = {
            k: (v or "").strip() for k, v in (changes["self_section_comments"] or {}).items()
            if k in criterion_keys and (v or "").strip()
        }
    for field, value in changes.items():
        setattr(review, field, value)
    db.commit()
    db.refresh(review)
    return review


def transition_review(db: Session, review: PerformanceReview, action: str) -> PerformanceReview:
    """Raises ValueError for an action that can't happen right now (the
    router turns that into a 400); authorization for WHO may call an action
    at all is checked by the router before this runs.

      submit_self:    self_assessment → in_review
      complete:       in_review → completed (the Manager Review needs at least one rated item)
      reopen_self:    back to self_assessment — the Manager Review is kept as is
      reopen_manager: completed → in_review, so reviewers can edit it again
    """
    now = datetime.now(timezone.utc)
    if action == "submit_self":
        review.status = "in_review"
        review.self_submitted_at = now
    elif action == "complete":
        if compute_averages(review.joint_scores or {}, review.evaluation_format)[1] is None:
            raise ValueError("Rate at least one item of the Manager Review before completing.")
        review.status = "completed"
        review.completed_at = now
    elif action == "reopen_self":
        review.status = "self_assessment"
        review.self_submitted_at = None
        review.completed_at = None
    elif action == "reopen_manager":
        review.status = "in_review"
        review.completed_at = None
    else:
        raise ValueError(f"Unknown action: {action}")
    db.commit()
    db.refresh(review)
    return review


def delete_review(db: Session, review: PerformanceReview) -> None:
    db.delete(review)
    db.commit()


def review_export_data(db: Session, review: PerformanceReview) -> dict:
    """Everything the .xlsx export needs, with names resolved (unfiltered —
    callers check access first, so this always renders as fully visible)."""
    name_by_id, project_by_id = _lookups(db, [review])
    data = to_out_dict(review, name_by_id, project_by_id, force_visible=True)
    emp = db.query(Employee).filter(Employee.id == review.employee_id).first()
    if emp and emp.first_name and emp.last_name:
        data["employee_display_name"] = f"{emp.last_name.strip()}, {emp.first_name.strip()}"
    else:
        data["employee_display_name"] = data["employee_name"]
    return data


def analytics(db: Session, year: Optional[int] = None) -> dict:
    """Completed reviews (optionally of one review-date year) with the self and
    Manager Review criterion averages and item scores — the Analytics tab
    builds its employee / project / item matrices from this. The annual
    measurement per employee is the plain mean of their reviews' Manager
    Review overall averages (same figure as Reports → Performance)."""
    completed = db.query(PerformanceReview).filter(PerformanceReview.status == "completed")
    years = sorted({d.year for (d,) in completed.with_entities(PerformanceReview.review_date).all()}, reverse=True)
    reviews = completed.order_by(PerformanceReview.review_date).all()
    if year:
        reviews = [r for r in reviews if r.review_date.year == year]
    name_by_id, project_by_id = _lookups(db, reviews)

    def _set(scores, fmt):
        criteria, overall = compute_averages(scores or {}, fmt)
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
            "reviewer_names": [name_by_id.get(rr.reviewer_id, "Unknown") for rr in r.reviewers],
            "review_date": r.review_date,
            "duration_hours": float(r.duration_hours) if r.duration_hours is not None else None,
            "evaluation_format": r.evaluation_format or DEFAULT_EVALUATION_FORMAT,
            "self": _set(r.self_scores, r.evaluation_format),
            "manager": _set(r.joint_scores, r.evaluation_format),
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
    # Team roster = staffed or logged hours or already has a review here —
    # reviewer ids are looked up separately below just to resolve names for
    # the review summaries, NOT added to the roster itself (being someone's
    # reviewer doesn't make you a member of their project team).
    team_ids = set(role_by_emp) | set(hours_by_emp) | {r.employee_id for r in reviews}
    if not team_ids:
        return []
    name_ids = set(team_ids)
    for r in reviews:
        name_ids |= {rr.reviewer_id for rr in r.reviewers}
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(name_ids)).all())
    employees = db.query(Employee).filter(Employee.id.in_(team_ids)).all()

    reviews_by_emp: Dict[str, List[dict]] = {}
    for r in reviews:  # already newest first
        _, overall = compute_averages(r.joint_scores or {}, r.evaluation_format)
        reviewer_ids = [rr.reviewer_id for rr in r.reviewers]
        reviews_by_emp.setdefault(r.employee_id, []).append({
            "id": r.id,
            "status": r.status,
            "review_date": r.review_date,
            "reviewer_ids": reviewer_ids,
            "reviewer_names": [name_by_id.get(rid, "Unknown") for rid in reviewer_ids],
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
