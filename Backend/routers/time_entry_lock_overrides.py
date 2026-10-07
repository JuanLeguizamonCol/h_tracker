"""Admin-only: grant a specific employee a 2-hour window to log/edit/delete
time entries in an already-closed month (see utils/time_entry_lock.py).

Not a section — this is a narrow, security-sensitive admin power (a
controlled bypass of a hard rule that otherwise applies to every role with no
exceptions), so it's gated on the real `role == "admin"` (require_admin),
never grantable through the per-section access overrides.
"""
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.time_entry_lock_overrides import TimeEntryLockOverride
from schemas.time_entry_lock_overrides import TimeEntryLockOverrideCreate, TimeEntryLockOverrideOut
from utils.auth_jwt import get_current_employee
from utils.roles import require_admin

OVERRIDE_DURATION = timedelta(hours=2)

time_entry_lock_overrides_router = APIRouter(
    prefix="/time-entry-lock-overrides", tags=["time-entry-lock-overrides"],
    dependencies=[Depends(require_admin)],
)


def _to_out(o: TimeEntryLockOverride) -> TimeEntryLockOverrideOut:
    now = datetime.now(timezone.utc)
    expires_at = o.expires_at if o.expires_at.tzinfo else o.expires_at.replace(tzinfo=timezone.utc)
    is_active = o.revoked_at is None and expires_at > now
    return TimeEntryLockOverrideOut(
        id=o.id, employee_id=o.employee_id, granted_by=o.granted_by,
        granted_at=o.granted_at, expires_at=o.expires_at, revoked_at=o.revoked_at,
        is_active=is_active,
    )


@time_entry_lock_overrides_router.post("/", response_model=TimeEntryLockOverrideOut, status_code=status.HTTP_201_CREATED)
def grant_lock_override(
    body: TimeEntryLockOverrideCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    target = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    now = datetime.now(timezone.utc)
    override = TimeEntryLockOverride(
        employee_id=body.employee_id,
        granted_by=current_employee.id,
        granted_at=now,
        expires_at=now + OVERRIDE_DURATION,
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return _to_out(override)


@time_entry_lock_overrides_router.get("/", response_model=List[TimeEntryLockOverrideOut])
def list_lock_overrides(employee_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(TimeEntryLockOverride)
    if employee_id:
        query = query.filter(TimeEntryLockOverride.employee_id == employee_id)
    overrides = query.order_by(TimeEntryLockOverride.granted_at.desc()).all()
    return [_to_out(o) for o in overrides]


@time_entry_lock_overrides_router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_lock_override(override_id: str, db: Session = Depends(get_db)):
    override = db.query(TimeEntryLockOverride).filter(TimeEntryLockOverride.id == override_id).first()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")
    if override.revoked_at is None:
        override.revoked_at = datetime.now(timezone.utc)
        db.commit()


# Separate, non-admin-gated router: any authenticated employee may check their
# OWN active-override status (read-only, no employee_id param — always "me"),
# so the Weekly Log page can unlock a closed month's cells for themselves
# when an Admin has granted them one. Mounted as its own router rather than a
# route on time_entry_lock_overrides_router so the admin-only gate on that
# router's grant/list/revoke endpoints is never touched by this addition.
my_time_entry_lock_status_router = APIRouter(
    prefix="/time-entry-lock-overrides", tags=["time-entry-lock-overrides"],
)


@my_time_entry_lock_status_router.get("/me/active")
def get_my_lock_override_status(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    return {"is_active": has_active_lock_override(db, current_employee.id)}
