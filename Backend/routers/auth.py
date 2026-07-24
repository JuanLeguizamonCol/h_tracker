import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.user_roles import UserRole
from schemas.employees import EmployeeOut
from utils.auth_jwt import (
    verify_password, create_access_token, get_current_employee, hash_password,
    verify_password_setup_token,
)

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["auth"])

# Self-registration is restricted to company email domains. Comma-separated list;
# set ALLOWED_EMAIL_DOMAINS="" to disable self-registration entirely.
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "impactpoint.com").split(",")
    if d.strip()
]


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


class SetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


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
    """Self-registration, restricted to authorized company email domains.
    Creates a new employee with role 'employee'."""
    email = body.email.strip().lower()
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    if not ALLOWED_EMAIL_DOMAINS or domain not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is restricted to authorized company emails",
        )
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


# ── Forgot / reset password (public) ─────────────────────────────────────────

@auth_router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Public: email a password-reset link to the account, if it exists.

    Always returns the same generic response so the endpoint can't be used to
    probe which emails are registered. The reset link reuses the set-password
    token/flow and expires in 72h; requesting it does NOT change the current
    password (it stays valid until the user completes the reset).
    """
    email = body.email.strip().lower()
    emp = db.query(Employee).filter(
        Employee.email == email,
        Employee.is_active == True,
    ).first()
    if emp:
        try:
            from services.invitations import send_password_reset_email
            sent = send_password_reset_email(emp)
            if not sent:
                logger.warning("Password reset requested for %s but email is not configured/sending failed.", email)
        except Exception:  # noqa: BLE001 — never leak internal errors on a public endpoint
            logger.exception("Failed to send password reset email to %s", email)
    return {"message": "If an account with that email exists, a reset link has been sent."}


# ── Password setup via emailed invitation token (public) ──────────────────────

@auth_router.get("/reset-token-valid")
def reset_token_valid(token: str, db: Session = Depends(get_db)):
    """Public: let the frontend check an invitation token before showing the form."""
    employee_id = verify_password_setup_token(token)
    if not employee_id:
        return {"valid": False}
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.is_active == True).first()
    if not emp:
        return {"valid": False}
    return {"valid": True, "email": emp.email, "name": emp.name}


@auth_router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
def set_password(body: SetPasswordRequest, db: Session = Depends(get_db)):
    """Public: set a password using a valid emailed invitation token (no prior login)."""
    employee_id = verify_password_setup_token(body.token)
    if not employee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.is_active == True).first()
    if not emp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    emp.password_hash = hash_password(body.new_password)
    emp.must_change_password = False
    db.commit()
