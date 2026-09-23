from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from services.project_roles import create_project_role, get_project_roles, get_project_role, update_project_role, delete_project_role
from schemas.project_roles import ProjectRoleCreate, ProjectRoleUpdate, ProjectRoleOut, ProjectRoleNameOut
from utils.roles import require_admin

project_roles_router = APIRouter(prefix="/project-roles", tags=["project-roles"])


@project_roles_router.post("/", response_model=ProjectRoleOut, status_code=status.HTTP_201_CREATED,
                            dependencies=[Depends(require_admin)])
def create_new_project_role(role_in: ProjectRoleCreate, db: Session = Depends(get_db)):
    return create_project_role(db, role_in)


# Rates (hourly_rate_usd, additional_hours_rate) are billing data — Admin only,
# same level as creating/editing/deleting a role. Non-admin consumers that just
# need to label a role (a name, not a rate) use GET /project-roles/names below
# instead, which stays open to any authenticated employee.
@project_roles_router.get("/", response_model=List[ProjectRoleOut], dependencies=[Depends(require_admin)])
def list_project_roles(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    return get_project_roles(db, project_id=project_id)


# Must be declared before GET /{role_id} — otherwise "/names" would match the
# {role_id} path parameter first and never reach this route.
@project_roles_router.get("/names", response_model=List[ProjectRoleNameOut])
def list_project_role_names(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    return get_project_roles(db, project_id=project_id)


@project_roles_router.get("/{role_id}", response_model=ProjectRoleOut, dependencies=[Depends(require_admin)])
def get_project_role_detail(role_id: str, db: Session = Depends(get_db)):
    role = get_project_role(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project role not found")
    return role


@project_roles_router.put("/{role_id}", response_model=ProjectRoleOut,
                           dependencies=[Depends(require_admin)])
def update_project_role_detail(role_id: str, role_in: ProjectRoleUpdate, db: Session = Depends(get_db)):
    role = update_project_role(db, role_id, role_in)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project role not found")
    return role


@project_roles_router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT,
                              dependencies=[Depends(require_admin)])
def delete_project_role_detail(role_id: str, db: Session = Depends(get_db)):
    if not delete_project_role(db, role_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project role not found")
