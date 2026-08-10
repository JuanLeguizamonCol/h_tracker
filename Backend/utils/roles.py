"""Shared role-based access dependencies.

Roles are stored as a free-text string on `UserRole.role` (no DB-level enum);
the only values the app recognizes are "employee", "manager", and "admin",
enforced at the employee-creation and role-update endpoints rather than by a
schema constraint. A missing UserRole row is treated as "employee".

Manager sits between employee and admin: it gets admin-level access to every
module EXCEPT Invoices, which stays admin-only (require_admin).
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.user_roles import UserRole
from utils.auth_jwt import get_current_employee

VALID_ROLES = ("employee", "manager", "admin")


def get_role(db: Session, employee_id: str) -> str:
    record = db.query(UserRole).filter(UserRole.user_id == employee_id).first()
    return record.role if record else "employee"


def require_admin(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Admin only. Used for Invoices and role/account management — the two
    areas a Manager should NOT reach."""
    if get_role(db, current_employee.id) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def require_manager_or_admin(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Admin or manager — general elevated access (everything except Invoices)."""
    if get_role(db, current_employee.id) not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or admin access required")
