from typing import List, Optional
from sqlalchemy.orm import Session

from models.employee_projects import EmployeeProject
from models.projects import Project
from models.clients import Client
from models.employees import Employee
from models.project_roles import ProjectRole
from schemas.employee_projects import EmployeeProjectCreate


def _sync_project_dates(db: Session, project_id: str, start_date, end_date) -> None:
    """Write-through: the Staffing panel's time window IS the project's own
    start_date/end_date — editing it here updates the project record itself,
    so there's a single source of truth and no drift between what the panel
    shows and the actual project."""
    if start_date is None and end_date is None:
        return
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return
    if start_date is not None:
        project.start_date = start_date
    if end_date is not None:
        project.end_date = end_date


def create_employee_project(db: Session, ep_in: EmployeeProjectCreate) -> EmployeeProject:
    data = ep_in.model_dump(exclude_unset=True)
    start_date = data.pop("project_start_date", None)
    end_date = data.pop("project_end_date", None)
    db_ep = EmployeeProject(**data)
    db.add(db_ep)
    _sync_project_dates(db, db_ep.project_id, start_date, end_date)
    db.commit()
    db.refresh(db_ep)
    return db_ep


def get_employee_projects(
    db: Session,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> List[EmployeeProject]:
    query = db.query(EmployeeProject)
    if user_id is not None:
        query = query.filter(EmployeeProject.user_id == user_id)
    if project_id is not None:
        query = query.filter(EmployeeProject.project_id == project_id)
    return query.all()


def get_employee_project(db: Session, ep_id: str) -> Optional[EmployeeProject]:
    return db.query(EmployeeProject).filter(EmployeeProject.id == ep_id).first()


def get_employee_projects_with_details(db: Session, user_id: str) -> List[dict]:
    results = (
        db.query(
            EmployeeProject.id,
            EmployeeProject.user_id,
            EmployeeProject.project_id,
            EmployeeProject.role_id,
            EmployeeProject.allocation_percentage,
            EmployeeProject.assigned_at,
            EmployeeProject.assigned_by,
            Project.name.label("project_name"),
            Project.client_id,
            Client.name.label("client_name"),
        )
        .join(Project, EmployeeProject.project_id == Project.id)
        .join(Client, Project.client_id == Client.id)
        .filter(EmployeeProject.user_id == user_id)
        .all()
    )
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "project_id": r.project_id,
            "role_id": r.role_id,
            "allocation_percentage": float(r.allocation_percentage) if r.allocation_percentage is not None else None,
            "assigned_at": r.assigned_at,
            "assigned_by": r.assigned_by,
            "project_name": r.project_name,
            "client_id": r.client_id,
            "client_name": r.client_name,
        }
        for r in results
    ]


def get_all_assignments_with_details(db: Session) -> List[dict]:
    """Every employee↔project assignment, with everything the Staffing panel
    needs to render in one query: who, which project/client/role, how much of
    their time (%), and the project's own time window."""
    results = (
        db.query(
            EmployeeProject.id,
            EmployeeProject.user_id,
            EmployeeProject.project_id,
            EmployeeProject.role_id,
            EmployeeProject.allocation_percentage,
            EmployeeProject.assigned_at,
            Employee.name.label("employee_name"),
            Project.name.label("project_name"),
            Project.is_active.label("project_is_active"),
            Project.start_date.label("project_start_date"),
            Project.end_date.label("project_end_date"),
            Project.client_id,
            Client.name.label("client_name"),
            ProjectRole.name.label("role_name"),
        )
        .join(Employee, EmployeeProject.user_id == Employee.id)
        .join(Project, EmployeeProject.project_id == Project.id)
        .join(Client, Project.client_id == Client.id)
        .outerjoin(ProjectRole, EmployeeProject.role_id == ProjectRole.id)
        .order_by(Employee.name, Project.name)
        .all()
    )
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "employee_name": r.employee_name,
            "project_id": r.project_id,
            "project_name": r.project_name,
            "project_is_active": r.project_is_active,
            "client_id": r.client_id,
            "client_name": r.client_name,
            "role_id": r.role_id,
            "role_name": r.role_name,
            "allocation_percentage": float(r.allocation_percentage) if r.allocation_percentage is not None else None,
            "project_start_date": r.project_start_date,
            "project_end_date": r.project_end_date,
            "assigned_at": r.assigned_at,
        }
        for r in results
    ]


def update_employee_project(db: Session, ep_id: str, updates: dict) -> Optional[EmployeeProject]:
    db_ep = get_employee_project(db, ep_id)
    if not db_ep:
        return None
    updates = dict(updates)
    start_date = updates.pop("project_start_date", None)
    end_date = updates.pop("project_end_date", None)
    for field, value in updates.items():
        setattr(db_ep, field, value)
    _sync_project_dates(db, db_ep.project_id, start_date, end_date)
    db.commit()
    db.refresh(db_ep)
    return db_ep


def delete_employee_project(db: Session, ep_id: str) -> bool:
    db_ep = get_employee_project(db, ep_id)
    if not db_ep:
        return False
    db.delete(db_ep)
    db.commit()
    return True


def bulk_replace_assignments(
    db: Session,
    user_id: str,
    assignments: List[dict],
) -> List[EmployeeProject]:
    db.query(EmployeeProject).filter(EmployeeProject.user_id == user_id).delete()
    new_records = []
    for item in assignments:
        record = EmployeeProject(
            user_id=user_id,
            project_id=item["project_id"],
            role_id=item.get("role_id"),
            allocation_percentage=item.get("allocation_percentage"),
            assigned_by=item.get("assigned_by"),
        )
        db.add(record)
        new_records.append(record)
    db.commit()
    for r in new_records:
        db.refresh(r)
    return new_records
