"""
Admin utility — reset ALL active employees' passwords to a temporary value.

Mirrors the secure pattern of /auth/admin-reset-password:
  - hashes with bcrypt (passlib) via utils.auth_jwt.hash_password
  - sets must_change_password=True so every user is forced to change it on next login

Usage (from the Backend/ directory, or inside the backend container):
    python reset_all_passwords.py                 # uses default temp password below
    TEMP_PASSWORD=otherpass python reset_all_passwords.py

In Docker:
    docker exec h_tracker-backend-1 python reset_all_passwords.py
"""
import os

from config.database import SessionLocal
from models.employees import Employee
from utils.auth_jwt import hash_password

TEMP_PASSWORD = os.getenv("TEMP_PASSWORD", "password123")


def main():
    if len(TEMP_PASSWORD) < 8:
        raise SystemExit("Temporary password must be at least 8 characters.")

    db = SessionLocal()
    try:
        employees = db.query(Employee).filter(Employee.is_active == True).all()
        if not employees:
            print("[reset] No active employees found.")
            return

        hashed = hash_password(TEMP_PASSWORD)
        for emp in employees:
            emp.password_hash = hashed
            emp.must_change_password = True
            print(f"[reset] {emp.email}")

        db.commit()
        print(f"[reset] Done. {len(employees)} password(s) reset; users must change on next login.")
    except Exception as e:
        db.rollback()
        print(f"[reset] Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
