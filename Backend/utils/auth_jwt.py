import os
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config.database import get_db

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(employee_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": employee_id, "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── Password-setup / invitation tokens ────────────────────────────────────────
# Single-purpose, signed tokens emailed to a new user so they can set their own
# password without prior credentials. Stateless (no DB table): validity is the
# signature + expiry + the "purpose" claim.

PASSWORD_SETUP_PURPOSE = "set_password"
PASSWORD_SETUP_EXPIRE_HOURS = int(os.getenv("PASSWORD_SETUP_EXPIRE_HOURS", "72"))


def create_password_setup_token(employee_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=PASSWORD_SETUP_EXPIRE_HOURS)
    payload = {"sub": employee_id, "purpose": PASSWORD_SETUP_PURPOSE, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_password_setup_token(token: str) -> str | None:
    """Return the employee_id if the token is a valid, unexpired set-password token, else None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != PASSWORD_SETUP_PURPOSE:
        return None
    return payload.get("sub")


def get_current_employee(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    from models.employees import Employee

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        employee_id: str = payload.get("sub")
        if not employee_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    emp = db.query(Employee).filter(
        Employee.id == employee_id,
        Employee.is_active == True,
    ).first()
    if emp is None:
        raise credentials_exception
    return emp
