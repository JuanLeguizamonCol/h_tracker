from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from utils.auth_jwt import get_current_employee
from utils.roles import get_role
from services.project_expenses import (
    create_project_expense, get_project_expenses_with_employee, get_project_expense,
    delete_project_expense,
)
from schemas.project_expenses import ProjectExpenseCreate, ProjectExpenseOut, ProjectExpenseWithEmployeeOut

project_expenses_router = APIRouter(prefix="/project-expenses", tags=["project-expenses"])


@project_expenses_router.post("/", response_model=ProjectExpenseOut, status_code=status.HTTP_201_CREATED)
def create_new_project_expense(
    expense_in: ProjectExpenseCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Employees can only log expenses for themselves. Managers/admins may log
    # one for anyone (e.g. corrections, or logging on someone else's behalf).
    if get_role(db, current_employee.id) not in ("admin", "manager") and expense_in.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only log expenses for yourself")
    return create_project_expense(db, expense_in)


@project_expenses_router.get("/", response_model=List[ProjectExpenseWithEmployeeOut])
def list_project_expenses(
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Employees can only ever see their own logged expenses, regardless of
    # what user_id is passed. Managers/admins can see anyone's.
    if get_role(db, current_employee.id) not in ("admin", "manager"):
        user_id = current_employee.id
    return get_project_expenses_with_employee(db, project_id=project_id, user_id=user_id)


@project_expenses_router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_expense_detail(
    expense_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    existing = get_project_expense(db, expense_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if get_role(db, current_employee.id) not in ("admin", "manager") and existing.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own expenses")
    if existing.invoice_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This expense is already on an invoice and can't be deleted here — remove it from the invoice instead.",
        )
    delete_project_expense(db, expense_id)
