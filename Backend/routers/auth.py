import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.user_roles import UserRole
from schemas.employees import EmployeeOut
from utils.auth_jwt import create_access_token, get_current_employee
from utils.auth_entra import verify_entra_id_token

auth_router = APIRouter(prefix="/auth", tags=["auth"])

# Email domains allowed to sign in via Entra ID. Comma-separated list.
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "impactpoint.com").split(",")
    if d.strip()
]


class EntraLoginRequest(BaseModel):
    id_token: str


def _is_allowed_domain(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    return bool(ALLOWED_EMAIL_DOMAINS) and domain in ALLOWED_EMAIL_DOMAINS


@auth_router.post("/login/entra")
def login_entra(body: EntraLoginRequest, db: Session = Depends(get_db)):
    """Login via Microsoft Entra ID (Impact Point tenant).

    Verifies the id_token against Entra's JWKS, then finds-or-creates the
    matching Employee by email and issues our own internal JWT."""
    claims = verify_entra_id_token(body.id_token)
    email = (claims.get("preferred_username") or claims.get("email") or "").strip().lower()
    if not email or not _is_allowed_domain(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Microsoft sign-in is restricted to authorized company emails",
        )

    emp = db.query(Employee).filter(Employee.email == email).first()
    if emp is None:
        emp_id = str(uuid.uuid4())
        emp = Employee(
            id=emp_id,
            user_id=emp_id,
            name=claims.get("name") or email.split("@", 1)[0],
            email=email,
            is_active=True,
        )
        db.add(emp)
        db.flush()
        db.add(UserRole(id=str(uuid.uuid4()), user_id=emp.id, role="employee"))
        db.commit()
        db.refresh(emp)
    elif not emp.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(emp.id, emp.email)
    return {"access_token": token, "token_type": "bearer"}


@auth_router.get("/me", response_model=EmployeeOut)
def get_me(current_employee: Employee = Depends(get_current_employee)):
    return current_employee
