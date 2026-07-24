from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from config.database import get_db
from services.projects import create_project, get_projects, get_project, update_project, delete_project
from schemas.projects import ProjectCreate, ProjectUpdate, ProjectOut, ProjectCategoryOut, ProjectAssignmentOut
from schemas.project_required_skill import (
    ProjectRequiredSkillCreate, ProjectRequiredSkillOut,
    AssignableEmployeeOut, SkillBrief, SkillCoverageOut,
    LEVEL_LABELS,
)
from models.employees import Employee
from models.employee_projects import EmployeeProject
from models.project_roles import ProjectRole
from models.project_categories import ProjectCategory
from models.project_required_skill import ProjectRequiredSkill
from models.skill_catalog import SkillCatalog
from models.employee_skills import EmployeeSkill
import uuid


def _auto_assign_all_employees(db: Session, project_id: str) -> None:
    """Assign all active employees to an internal project, skipping those already assigned."""
    already = {ep.user_id for ep in db.query(EmployeeProject).filter(EmployeeProject.project_id == project_id).all()}
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    for emp in employees:
        if emp.id not in already:
            db.add(EmployeeProject(
                id=str(uuid.uuid4()),
                user_id=emp.id,
                project_id=project_id,
            ))
    db.commit()

projects_router = APIRouter(prefix="/projects", tags=["projects"])

# ── Role suggestion map ───────────────────────────────────────────────────────
_SKILL_TO_ROLE: List[tuple] = [
    ({"react", "vue", "angular", "css", "html", "javascript", "typescript", "svelte", "next.js"}, "Frontend Developer"),
    ({"node.js", "python", "java", "go", "ruby", "php", "c#", "rust", "django", "fastapi", "spring", "express"}, "Backend Developer"),
    ({"aws", "azure", "gcp", "terraform", "cloud", "lambda", "s3", "ec2"}, "Cloud Engineer"),
    ({"docker", "kubernetes", "ci/cd", "jenkins", "gitlab ci", "github actions", "ansible", "helm"}, "DevOps Engineer"),
    ({"figma", "ui design", "ux research", "sketch", "adobe xd", "ux", "prototyping"}, "Designer"),
    ({"sql", "power bi", "data analysis", "tableau", "excel", "pandas", "spark", "data science", "machine learning"}, "Data Analyst"),
    ({"scrum", "project management", "agile", "jira", "confluence", "pmp", "kanban"}, "Project Manager"),
    ({"security", "penetration testing", "cybersecurity", "siem", "soc", "owasp"}, "Security Engineer"),
]

_LEVEL_MAP = {"beginner": 1, "intermediate": 2, "advanced": 3, "expert": 4}


def _suggest_role(skill_names: List[str]) -> Optional[str]:
    if not skill_names:
        return None
    normalized = {s.lower() for s in skill_names}
    best_role, best_count = None, 0
    for skill_set, role in _SKILL_TO_ROLE:
        count = len(normalized & skill_set)
        if count > best_count:
            best_count, best_role = count, role
    return best_role if best_count > 0 else None


def _project_out(project, manager_name: Optional[str]) -> ProjectOut:
    data = {c.name: getattr(project, c.name) for c in project.__table__.columns}
    data["manager_name"] = manager_name
    return ProjectOut.model_validate(data)


def _with_manager_name(project, db: Session) -> ProjectOut:
    manager_name = None
    if project.manager_id:
        manager = db.query(Employee).filter(Employee.id == project.manager_id).first()
        manager_name = manager.name if manager else None
    return _project_out(project, manager_name)


# ── Categories (must come before /{project_id}) ───────────────────────────────

@projects_router.get("/categories", response_model=List[ProjectCategoryOut])
def list_project_categories(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ProjectCategory).filter(ProjectCategory.active == True)
    if type:
        q = q.filter(ProjectCategory.type == type)
    return q.order_by(ProjectCategory.value).all()


# ── CRUD ──────────────────────────────────────────────────────────────────────

@projects_router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_new_project(project_in: ProjectCreate, db: Session = Depends(get_db)):
    project = create_project(db, project_in)
    if project.is_internal:
        _auto_assign_all_employees(db, project.id)
    return _with_manager_name(project, db)


@projects_router.get("/", response_model=List[ProjectOut])
def list_projects(
    active: Optional[bool] = None,
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    projects = get_projects(db, active=active, client_id=client_id, status=status)
    # Batch-load manager names in one query instead of one per project (N+1).
    manager_ids = {p.manager_id for p in projects if p.manager_id}
    name_by_id = dict(
        db.query(Employee.id, Employee.name).filter(Employee.id.in_(manager_ids)).all()
    ) if manager_ids else {}
    return [_project_out(p, name_by_id.get(p.manager_id) if p.manager_id else None) for p in projects]


# ── Project sub-resources (before /{project_id} catch-all) ───────────────────

@projects_router.get("/{project_id}/assignments", response_model=List[ProjectAssignmentOut])
def get_project_assignments(project_id: str, db: Session = Depends(get_db)):
    assignments = db.query(EmployeeProject).filter(EmployeeProject.project_id == project_id).all()
    # Batch employee + role lookups instead of querying per assignment (N+1).
    emp_ids = {a.user_id for a in assignments}
    role_ids = {a.role_id for a in assignments if a.role_id}
    emp_by_id = {
        e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()
    } if emp_ids else {}
    role_by_id = {
        r.id: r for r in db.query(ProjectRole).filter(ProjectRole.id.in_(role_ids)).all()
    } if role_ids else {}
    result = []
    for a in assignments:
        employee = emp_by_id.get(a.user_id)
        role = role_by_id.get(a.role_id) if a.role_id else None
        result.append(ProjectAssignmentOut(
            id=a.id,
            user_id=a.user_id,
            employee_name=employee.name if employee else "Unknown",
            project_id=a.project_id,
            role_id=a.role_id,
            role_name=role.name if role else None,
            rate=float(role.hourly_rate_usd) if role and role.hourly_rate_usd else None,
        ))
    return result


@projects_router.get("/{project_id}/assignable-employees", response_model=List[AssignableEmployeeOut])
def get_assignable_employees(
    project_id: str,
    name: Optional[str] = None,
    skills: Optional[List[str]] = Query(None),
    skill_match: str = "all",
    min_level: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    assigned_ids: set = {
        a.user_id
        for a in db.query(EmployeeProject).filter(EmployeeProject.project_id == project_id).all()
    }

    q = db.query(Employee)
    if name:
        q = q.filter(Employee.name.ilike(f"%{name}%"))
    employees = q.order_by(Employee.name).all()

    min_level_int = _LEVEL_MAP.get(min_level or "", 1)
    requested_skill_ids = set(skills) if skills else set()

    result: List[AssignableEmployeeOut] = []
    for emp in employees:
        emp_skills_q = db.query(EmployeeSkill).filter(EmployeeSkill.employee_id == emp.id)
        if category:
            emp_skills_q = emp_skills_q.filter(EmployeeSkill.category == category)
        emp_skills = emp_skills_q.all()

        skill_briefs = [
            SkillBrief(
                name=s.skill_name,
                category=s.category,
                level=s.proficiency_level,
                level_label=LEVEL_LABELS.get(s.proficiency_level, str(s.proficiency_level)),
                years=float(s.years_experience) if s.years_experience else None,
            )
            for s in emp_skills
        ]

        matched_names: List[str] = []
        missing_names: List[str] = []
        match_score = 100

        if requested_skill_ids:
            skill_by_catalog: dict = {s.skill_catalog_id: s for s in emp_skills if s.skill_catalog_id}
            catalog_cache: dict = {}
            for sid in requested_skill_ids:
                if sid not in catalog_cache:
                    entry = db.query(SkillCatalog).filter(SkillCatalog.id == sid).first()
                    catalog_cache[sid] = entry.name if entry else sid
                display = catalog_cache[sid]
                skill_rec = skill_by_catalog.get(sid)
                if skill_rec and skill_rec.proficiency_level >= min_level_int:
                    matched_names.append(display)
                else:
                    missing_names.append(display)

            total = len(requested_skill_ids)
            match_score = round((len(matched_names) / total) * 100) if total > 0 else 0

            if skill_match == "all" and missing_names:
                continue
            elif skill_match == "any" and not matched_names:
                continue

        result.append(AssignableEmployeeOut(
            id=emp.id,
            name=emp.name,
            title=emp.title,
            skills=skill_briefs,
            match_score=match_score,
            matched_skills=matched_names,
            missing_skills=missing_names,
            already_assigned=emp.id in assigned_ids,
            suggested_role=_suggest_role([s.skill_name for s in emp_skills]),
        ))

    if requested_skill_ids:
        result.sort(key=lambda e: (-e.match_score, e.already_assigned, e.name))

    return result


@projects_router.get("/{project_id}/required-skills", response_model=List[ProjectRequiredSkillOut])
def get_required_skills(project_id: str, db: Session = Depends(get_db)):
    records = db.query(ProjectRequiredSkill).filter(ProjectRequiredSkill.project_id == project_id).all()
    result = []
    for r in records:
        catalog = db.query(SkillCatalog).filter(SkillCatalog.id == r.skill_id).first()
        lv = r.min_level or 2
        result.append(ProjectRequiredSkillOut(
            id=r.id, project_id=r.project_id, skill_id=r.skill_id,
            skill_name=catalog.name if catalog else r.skill_id,
            skill_category=catalog.category if catalog else "",
            min_level=lv, min_level_label=LEVEL_LABELS.get(lv, "Intermediate"),
            created_at=r.created_at,
        ))
    return result


@projects_router.post("/{project_id}/required-skills", response_model=ProjectRequiredSkillOut, status_code=status.HTTP_201_CREATED)
def add_required_skill(project_id: str, body: ProjectRequiredSkillCreate, db: Session = Depends(get_db)):
    if not get_project(db, project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    existing = (
        db.query(ProjectRequiredSkill)
        .filter(ProjectRequiredSkill.project_id == project_id, ProjectRequiredSkill.skill_id == body.skill_id)
        .first()
    )
    if existing:
        existing.min_level = body.min_level
        db.commit()
        db.refresh(existing)
        record = existing
    else:
        record = ProjectRequiredSkill(
            id=str(uuid.uuid4()), project_id=project_id,
            skill_id=body.skill_id, min_level=body.min_level,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    catalog = db.query(SkillCatalog).filter(SkillCatalog.id == record.skill_id).first()
    lv = record.min_level or 2
    return ProjectRequiredSkillOut(
        id=record.id, project_id=record.project_id, skill_id=record.skill_id,
        skill_name=catalog.name if catalog else record.skill_id,
        skill_category=catalog.category if catalog else "",
        min_level=lv, min_level_label=LEVEL_LABELS.get(lv, "Intermediate"),
        created_at=record.created_at,
    )


@projects_router.delete("/{project_id}/required-skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_required_skill(project_id: str, skill_id: str, db: Session = Depends(get_db)):
    record = (
        db.query(ProjectRequiredSkill)
        .filter(ProjectRequiredSkill.project_id == project_id, ProjectRequiredSkill.skill_id == skill_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Required skill not found")
    db.delete(record)
    db.commit()


@projects_router.get("/{project_id}/skill-coverage", response_model=List[SkillCoverageOut])
def get_skill_coverage(project_id: str, db: Session = Depends(get_db)):
    required = db.query(ProjectRequiredSkill).filter(ProjectRequiredSkill.project_id == project_id).all()
    if not required:
        return []

    assigned_ids = [
        a.user_id
        for a in db.query(EmployeeProject).filter(EmployeeProject.project_id == project_id).all()
    ]

    result = []
    for req in required:
        catalog = db.query(SkillCatalog).filter(SkillCatalog.id == req.skill_id).first()
        if not catalog:
            continue
        matching = (
            db.query(EmployeeSkill, Employee)
            .join(Employee, EmployeeSkill.employee_id == Employee.id)
            .filter(EmployeeSkill.employee_id.in_(assigned_ids), EmployeeSkill.skill_catalog_id == req.skill_id)
            .all()
        )
        min_lv = req.min_level or 2
        qualifying = [emp.name for skill, emp in matching if skill.proficiency_level >= min_lv]
        partial = [emp.name for skill, emp in matching if skill.proficiency_level < min_lv]
        status_val = "covered" if qualifying else ("partial" if partial else "missing")
        lv = req.min_level or 2
        result.append(SkillCoverageOut(
            skill_id=req.skill_id, skill_name=catalog.name, skill_category=catalog.category,
            min_level=lv, min_level_label=LEVEL_LABELS.get(lv, "Intermediate"),
            coverage_status=status_val,
            covered_by_names=qualifying if qualifying else partial,
        ))
    return result


# ── Project CRUD (catch-all /{project_id}) ────────────────────────────────────

@projects_router.get("/{project_id}", response_model=ProjectOut)
def get_project_detail(project_id: str, db: Session = Depends(get_db)):
    project = get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return _with_manager_name(project, db)


@projects_router.put("/{project_id}", response_model=ProjectOut)
def update_project_detail(project_id: str, project_in: ProjectUpdate, db: Session = Depends(get_db)):
    project = update_project(db, project_id, project_in)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.is_internal:
        _auto_assign_all_employees(db, project_id)
    return _with_manager_name(project, db)


@projects_router.patch("/{project_id}", response_model=ProjectOut)
def patch_project_detail(project_id: str, project_in: ProjectUpdate, db: Session = Depends(get_db)):
    project = update_project(db, project_id, project_in)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.is_internal:
        _auto_assign_all_employees(db, project_id)
    return _with_manager_name(project, db)


@projects_router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_detail(project_id: str, db: Session = Depends(get_db)):
    if not delete_project(db, project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
