from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from config.database import get_db
from models.employees import Employee
from services.user_roles import get_all_user_roles, get_user_role, upsert_user_role, delete_user_role
from schemas.user_roles import UserRoleOut
from utils.auth_jwt import get_current_employee

user_roles_router = APIRouter(prefix="/user-roles", tags=["user-roles"])

PROTECTED_EMAIL = "jleguizamon@impactpoint.com"


class UpsertRoleBody(BaseModel):
    role: str


@user_roles_router.get("/", response_model=List[UserRoleOut])
def list_user_roles(db: Session = Depends(get_db)):
    return get_all_user_roles(db)


@user_roles_router.get("/{user_id}", response_model=UserRoleOut)
def get_user_role_detail(user_id: str, db: Session = Depends(get_db)):
    role = get_user_role(db, user_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User role not found")
    return role


@user_roles_router.put("/{user_id}", response_model=UserRoleOut)
def upsert_user_role_detail(
    user_id: str,
    body: UpsertRoleBody,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Cannot change your own role
    if user_id == current_employee.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own role",
        )

    # Cannot change the protected superadmin account
    target = db.query(Employee).filter(Employee.id == user_id).first()
    if target and target.email.lower() == PROTECTED_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is protected and its role cannot be changed",
        )

    return upsert_user_role(db, user_id, body.role)


@user_roles_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_role_detail(user_id: str, db: Session = Depends(get_db)):
    if not delete_user_role(db, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User role not found")
