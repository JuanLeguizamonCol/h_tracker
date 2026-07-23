import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from services.employees import (
    create_employee, get_employees, get_employee,
    update_employee, delete_employee,
)
from services.skills import (
    get_employee_skills, create_employee_skill, update_employee_skill, delete_employee_skill,
)
from services.employee_internal_cost import (
    get_current_internal_cost, get_internal_cost_history, upsert_internal_cost,
)
from schemas.employees import EmployeeCreate, EmployeeUpdate, EmployeeOut
from schemas.skills import EmployeeSkillCreate, EmployeeSkillUpdate, EmployeeSkillOut
from schemas.employee_internal_cost import EmployeeInternalCostCreate, EmployeeInternalCostOut
from models.employees import Employee
from models.user_roles import UserRole
from models.projects import Project
from models.employee_projects import EmployeeProject
from utils.auth_jwt import get_current_employee
import uuid

employees_router = APIRouter(prefix="/employees", tags=["employees"])


def _auto_assign_internal_projects(db: Session, employee_id: str) -> None:
    """Assign all active internal projects to a new employee, skipping any already assigned."""
    already = {ep.project_id for ep in db.query(EmployeeProject).filter(EmployeeProject.user_id == employee_id).all()}
    internal_projects = db.query(Project).filter(Project.is_internal == True, Project.is_active == True).all()
    for proj in internal_projects:
        if proj.id not in already:
            db.add(EmployeeProject(
                id=str(uuid.uuid4()),
                user_id=employee_id,
                project_id=proj.id,
            ))
    db.commit()


# ── Admin guard dependency ────────────────────────────────────────────────────

async def require_admin(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Raises 403 if the requesting employee is not an admin."""
    role_record = db.query(UserRole).filter(UserRole.user_id == current_employee.id).first()
    if not role_record or role_record.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


# ── /me  (open to all authenticated users) ────────────────────────────────────

@employees_router.get("/me", response_model=EmployeeOut)
def get_current_employee_me(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    _auto_assign_internal_projects(db, current_employee.id)
    return current_employee


# ── Admin-only CRUD ───────────────────────────────────────────────────────────

@employees_router.post(
    "/",
    response_model=EmployeeOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_new_employee(employee_in: EmployeeCreate, db: Session = Depends(get_db)):
    if employee_in.password is not None and len(employee_in.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    if employee_in.user_role and employee_in.user_role.strip().lower() not in ("employee", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'employee' or 'admin'")
    email = employee_in.email.strip().lower()
    if db.query(Employee).filter(Employee.email == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    emp = create_employee(db, employee_in)
    _auto_assign_internal_projects(db, emp.id)
    # Best-effort: email the new user a link to set their own password. Never let
    # an email failure break user creation.
    try:
        from services.invitations import send_password_setup_invitation
        send_password_setup_invitation(emp)
    except Exception:  # noqa: BLE001
        logging.getLogger("employees").exception("Failed to send invitation email to %s", emp.email)
    return emp


@employees_router.get(
    "/",
    response_model=List[EmployeeOut],
    dependencies=[Depends(require_admin)],
)
def list_employees(
    active: Optional[bool] = None,
    user_role: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Employee)
    if active is not None:
        query = query.filter(Employee.is_active == active)
    if user_role:
        query = query.join(UserRole, UserRole.user_id == Employee.id).filter(
            UserRole.role == user_role
        )
    if search:
        query = query.filter(Employee.name.ilike(f"%{search}%"))
    return query.order_by(Employee.name).all()


@employees_router.get(
    "/{employee_id}",
    response_model=EmployeeOut,
    dependencies=[Depends(require_admin)],
)
def get_employee_detail(employee_id: str, db: Session = Depends(get_db)):
    emp = get_employee(db, employee_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return emp


@employees_router.put(
    "/{employee_id}",
    response_model=EmployeeOut,
    dependencies=[Depends(require_admin)],
)
def update_employee_detail(employee_id: str, employee_in: EmployeeUpdate, db: Session = Depends(get_db)):
    emp = update_employee(db, employee_id, employee_in)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return emp


@employees_router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_employee_detail(employee_id: str, db: Session = Depends(get_db)):
    if not delete_employee(db, employee_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")


# ── Internal Cost (admin-only) ────────────────────────────────────────────────

@employees_router.get(
    "/{employee_id}/internal-cost",
    response_model=EmployeeInternalCostOut,
    dependencies=[Depends(require_admin)],
)
def get_employee_internal_cost(employee_id: str, db: Session = Depends(get_db)):
    record = get_current_internal_cost(db, employee_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cost record found")
    return record


@employees_router.post(
    "/{employee_id}/internal-cost",
    response_model=EmployeeInternalCostOut,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_admin)],
)
def upsert_employee_internal_cost(
    employee_id: str,
    cost_in: EmployeeInternalCostCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    emp = get_employee(db, employee_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return upsert_internal_cost(db, employee_id, cost_in, actor_id=current_employee.id)


@employees_router.get(
    "/{employee_id}/internal-cost/history",
    response_model=List[EmployeeInternalCostOut],
    dependencies=[Depends(require_admin)],
)
def get_employee_internal_cost_history(employee_id: str, db: Session = Depends(get_db)):
    return get_internal_cost_history(db, employee_id)


# ── Skills (admin-only) ───────────────────────────────────────────────────────

@employees_router.get(
    "/{employee_id}/skills",
    response_model=List[EmployeeSkillOut],
    dependencies=[Depends(require_admin)],
)
def list_employee_skills(employee_id: str, db: Session = Depends(get_db)):
    return get_employee_skills(db, employee_id)


@employees_router.post(
    "/{employee_id}/skills",
    response_model=EmployeeSkillOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def add_employee_skill(employee_id: str, skill_in: EmployeeSkillCreate, db: Session = Depends(get_db)):
    emp = get_employee(db, employee_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return create_employee_skill(db, employee_id, skill_in)


@employees_router.patch(
    "/{employee_id}/skills/{skill_id}",
    response_model=EmployeeSkillOut,
    dependencies=[Depends(require_admin)],
)
def update_skill(employee_id: str, skill_id: str, skill_in: EmployeeSkillUpdate, db: Session = Depends(get_db)):
    skill = update_employee_skill(db, skill_id, skill_in)
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return skill


@employees_router.delete(
    "/{employee_id}/skills/{skill_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
def delete_skill(employee_id: str, skill_id: str, db: Session = Depends(get_db)):
    if not delete_employee_skill(db, skill_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
