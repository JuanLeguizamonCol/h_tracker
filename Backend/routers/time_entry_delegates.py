"""Admin-only: grant one employee ("delegate") the ability to also log/edit/
delete time entries for exactly one other employee ("target") — e.g. an
assistant entering hours for someone who doesn't use the tracker directly.

Not a section — like time_entry_lock_overrides, this is a narrow,
security-sensitive admin power (it lets one person write into another
person's records), so it's gated on the real `role == "admin"`
(require_admin), never grantable through the per-section access overrides.
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.time_entry_delegates import TimeEntryDelegate
from schemas.time_entry_delegates import TimeEntryDelegateCreate, TimeEntryDelegateOut
from utils.auth_jwt import get_current_employee
from utils.roles import require_admin
from utils.time_entry_delegate import get_delegate_target_ids

time_entry_delegates_router = APIRouter(
    prefix="/time-entry-delegates", tags=["time-entry-delegates"],
    dependencies=[Depends(require_admin)],
)


def _to_out(d: TimeEntryDelegate, names: dict[str, str]) -> TimeEntryDelegateOut:
    return TimeEntryDelegateOut(
        id=d.id,
        delegate_user_id=d.delegate_user_id,
        delegate_name=names.get(d.delegate_user_id, "—"),
        target_user_id=d.target_user_id,
        target_name=names.get(d.target_user_id, "—"),
        granted_by=d.granted_by,
        granted_at=d.granted_at,
        revoked_at=d.revoked_at,
        is_active=d.revoked_at is None,
    )


def _names_for(db: Session, delegates: list[TimeEntryDelegate]) -> dict[str, str]:
    ids = {d.delegate_user_id for d in delegates} | {d.target_user_id for d in delegates}
    if not ids:
        return {}
    rows = db.query(Employee.id, Employee.name).filter(Employee.id.in_(ids)).all()
    return {row[0]: row[1] for row in rows}


@time_entry_delegates_router.post("/", response_model=TimeEntryDelegateOut, status_code=status.HTTP_201_CREATED)
def grant_delegate(
    body: TimeEntryDelegateCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if body.delegate_user_id == body.target_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An employee can't be delegated for themselves.")
    delegate = db.query(Employee).filter(Employee.id == body.delegate_user_id).first()
    target = db.query(Employee).filter(Employee.id == body.target_user_id).first()
    if not delegate or not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    existing = db.query(TimeEntryDelegate).filter(
        TimeEntryDelegate.delegate_user_id == body.delegate_user_id,
        TimeEntryDelegate.target_user_id == body.target_user_id,
        TimeEntryDelegate.revoked_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This delegation already exists.")

    delegation = TimeEntryDelegate(
        delegate_user_id=body.delegate_user_id,
        target_user_id=body.target_user_id,
        granted_by=current_employee.id,
        granted_at=datetime.now(timezone.utc),
    )
    db.add(delegation)
    db.commit()
    db.refresh(delegation)
    return _to_out(delegation, _names_for(db, [delegation]))


@time_entry_delegates_router.get("/", response_model=List[TimeEntryDelegateOut])
def list_delegates(
    delegate_user_id: str | None = None,
    target_user_id: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(TimeEntryDelegate)
    if delegate_user_id:
        query = query.filter(TimeEntryDelegate.delegate_user_id == delegate_user_id)
    if target_user_id:
        query = query.filter(TimeEntryDelegate.target_user_id == target_user_id)
    delegates = query.order_by(TimeEntryDelegate.granted_at.desc()).all()
    names = _names_for(db, delegates)
    return [_to_out(d, names) for d in delegates]


@time_entry_delegates_router.delete("/{delegate_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_delegate(delegate_id: str, db: Session = Depends(get_db)):
    delegation = db.query(TimeEntryDelegate).filter(TimeEntryDelegate.id == delegate_id).first()
    if not delegation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delegation not found")
    if delegation.revoked_at is None:
        delegation.revoked_at = datetime.now(timezone.utc)
        db.commit()


# Separate, non-admin-gated router: any authenticated employee may check WHO
# they're currently delegated for (read-only, no param — always "me"), so the
# Timesheet page can offer a "log hours for..." switcher only when there's
# actually someone to switch to.
my_time_entry_delegates_router = APIRouter(
    prefix="/time-entry-delegates", tags=["time-entry-delegates"],
)


@my_time_entry_delegates_router.get("/me/targets")
def get_my_delegate_targets(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    target_ids = get_delegate_target_ids(db, current_employee.id)
    if not target_ids:
        return []
    rows = db.query(Employee.id, Employee.name).filter(Employee.id.in_(target_ids)).all()
    return [{"id": row[0], "name": row[1]} for row in rows]
