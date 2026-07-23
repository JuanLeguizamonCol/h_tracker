"""
Idempotent admin bootstrap.

Runs at container startup (before uvicorn) so a fresh deployment always has at
least one admin account to log in with — the app no longer ships seed data.

Behaviour (safe to run on every boot):
  - If ADMIN_EMAIL / ADMIN_PASSWORD are unset  → no-op (logs and returns).
  - If the employee does not exist             → create it + grant 'admin' role,
                                                  with must_change_password=True.
  - If the employee already exists             → ensure it has the 'admin' role;
                                                  NEVER overwrite an existing password.

Env vars:
    ADMIN_EMAIL       Admin login email (required to do anything).
    ADMIN_PASSWORD    Initial password, min 8 chars (required to do anything).
    ADMIN_NAME        Display name (optional; defaults to the email local-part).

Run:
    python -m jobs.bootstrap_admin
"""
import logging
import os
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("bootstrap_admin")


def run() -> int:
    from sqlalchemy.exc import IntegrityError

    from config.database import SessionLocal
    from models.employees import Employee
    from models.user_roles import UserRole
    from utils.auth_jwt import hash_password

    email = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD") or ""
    name = (os.getenv("ADMIN_NAME") or "").strip()

    if not email or not password:
        logger.info("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.")
        return 0
    if len(password) < 8:
        logger.error("ADMIN_PASSWORD must be at least 8 characters — skipping admin bootstrap.")
        return 1

    if not name:
        name = email.split("@", 1)[0]

    db = SessionLocal()
    try:
        emp = db.query(Employee).filter(Employee.email == email).first()

        if emp is None:
            emp_id = str(uuid.uuid4())
            emp = Employee(
                id=emp_id,
                user_id=emp_id,
                name=name,
                email=email,
                password_hash=hash_password(password),
                is_active=True,
                must_change_password=True,   # force a change on first login
            )
            db.add(emp)
            try:
                db.flush()
            except IntegrityError:
                # Another replica created it first — reload and fall through to role check.
                db.rollback()
                emp = db.query(Employee).filter(Employee.email == email).first()
                if emp is None:
                    raise
            else:
                logger.info("Created admin employee %s", email)

        # Ensure the 'admin' role exists for this employee.
        has_admin = db.query(UserRole).filter(
            UserRole.user_id == emp.id,
            UserRole.role == "admin",
        ).first()
        if not has_admin:
            db.add(UserRole(id=str(uuid.uuid4()), user_id=emp.id, role="admin"))
            logger.info("Granted 'admin' role to %s", email)
        else:
            logger.info("Admin %s already present — nothing to do.", email)

        db.commit()
        return 0

    except Exception as e:
        db.rollback()
        logger.error("Admin bootstrap failed: %s", e)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    sys.exit(run())
