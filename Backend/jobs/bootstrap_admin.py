"""
Idempotent admin bootstrap.

Runs at container startup (before uvicorn) so a fresh deployment always has at
least one admin account able to sign in — the app no longer ships seed data.
Login is via "Sign in with Microsoft" (Entra ID); this job only makes sure the
Employee record and 'admin' role exist so ADMIN_EMAIL's Entra ID account
lands as an admin on first login.

Behaviour (safe to run on every boot):
  - If ADMIN_EMAIL is unset             → no-op (logs and returns).
  - If the employee does not exist      → create it + grant 'admin' role.
  - If the employee already exists      → ensure it has the 'admin' role.

Env vars:
    ADMIN_EMAIL       Admin account email (required to do anything). Must
                       match the Entra ID account that should have admin access.
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

    email = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
    name = (os.getenv("ADMIN_NAME") or "").strip()

    if not email:
        logger.info("ADMIN_EMAIL not set — skipping admin bootstrap.")
        return 0

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
                is_active=True,
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
