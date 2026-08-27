from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from config.database import get_db
from services.employee_projects import (
    create_employee_project, get_employee_projects, get_employee_project,
    update_employee_project, get_employee_projects_with_details,
    get_all_assignments_with_details,
    delete_employee_project, bulk_replace_assignments,
)
from schemas.employee_projects import (
    EmployeeProjectCreate, EmployeeProjectOut,
    EmployeeProjectWithDetails as EmployeeProjectWithDetailsOut,
    StaffingAssignmentOut,
)

employee_projects_router = APIRouter(prefix="/employee-projects", tags=["employee-projects"])


class BulkAssignBody(BaseModel):
    assignments: List[dict]


class UpdateEpBody(BaseModel):
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None


@employee_projects_router.post("/", response_model=EmployeeProjectOut, status_code=status.HTTP_201_CREATED)
def create_new_employee_project(ep_in: EmployeeProjectCreate, db: Session = Depends(get_db)):
    return create_employee_project(db, ep_in)


@employee_projects_router.get("/", response_model=List[EmployeeProjectOut])
def list_employee_projects(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return get_employee_projects(db, user_id=user_id, project_id=project_id)


@employee_projects_router.get("/staffing", response_model=List[StaffingAssignmentOut])
def list_staffing(db: Session = Depends(get_db)):
    """Every assignment across every employee — feeds the Staffing panel."""
    return get_all_assignments_with_details(db)


@employee_projects_router.get("/{user_id}/details", response_model=List[EmployeeProjectWithDetailsOut])
def get_employee_projects_with_details_route(user_id: str, db: Session = Depends(get_db)):
    return get_employee_projects_with_details(db, user_id)


@employee_projects_router.put("/{user_id}/bulk", response_model=List[EmployeeProjectOut])
def bulk_replace_assignments_route(user_id: str, body: BulkAssignBody, db: Session = Depends(get_db)):
    return bulk_replace_assignments(db, user_id, body.assignments)


@employee_projects_router.put("/{ep_id}", response_model=EmployeeProjectOut)
def update_employee_project_detail(ep_id: str, body: UpdateEpBody, db: Session = Depends(get_db)):
    ep = update_employee_project(db, ep_id, body.model_dump(exclude_unset=True))
    if not ep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee project not found")
    return ep


@employee_projects_router.delete("/{ep_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee_project_detail(ep_id: str, db: Session = Depends(get_db)):
    if not delete_employee_project(db, ep_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee project not found")
