import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.user_roles import UserRole
from schemas.employees import EmployeeOut
from utils.auth_jwt import verify_password, create_access_token, get_current_employee, hash_password

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    temporary_password: str


@auth_router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(
        Employee.email == body.email.strip().lower(),
        Employee.is_active == True,
    ).first()
    if not emp or not emp.password_hash or not verify_password(body.password, emp.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(emp.id, emp.email)
    return {"access_token": token, "token_type": "bearer"}


@auth_router.post("/register", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Public self-registration. Creates a new employee with role 'employee'."""
    email = body.email.strip().lower()
    if db.query(Employee).filter(Employee.email == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if len(body.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    emp_id = str(uuid.uuid4())
    emp = Employee(
        id=emp_id,
        user_id=emp_id,
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        is_active=True,
        must_change_password=True,
    )
    db.add(emp)
    db.flush()
    db.add(UserRole(id=str(uuid.uuid4()), user_id=emp.id, role="employee"))
    db.commit()
    db.refresh(emp)
    return emp


@auth_router.get("/me", response_model=EmployeeOut)
def get_me(current_employee: Employee = Depends(get_current_employee)):
    return current_employee


@auth_router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    if not current_employee.password_hash or not verify_password(body.current_password, current_employee.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    current_employee.password_hash = hash_password(body.new_password)
    current_employee.must_change_password = False
    db.commit()


@auth_router.post("/admin-reset-password/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_reset_password(
    employee_id: str,
    body: AdminResetPasswordRequest,
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """Admin-only: reset another employee's password and force a change on next login."""
    from models.user_roles import UserRole
    admin_role = db.query(UserRole).filter(UserRole.user_id == current_employee.id, UserRole.role == "admin").first()
    if not admin_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if len(body.temporary_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    target = db.query(Employee).filter(Employee.id == employee_id, Employee.is_active == True).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    target.password_hash = hash_password(body.temporary_password)
    target.must_change_password = True
    db.commit()
