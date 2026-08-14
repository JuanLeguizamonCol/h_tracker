from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from utils.auth_jwt import get_current_employee
from utils.roles import get_role
from services.time_entries import (
    create_time_entry, get_time_entries, get_time_entry, update_time_entry, delete_time_entry,
)
from schemas.time_entries import TimeEntryCreate, TimeEntryUpdate, TimeEntryOut

time_entries_router = APIRouter(prefix="/time-entries", tags=["time-entries"])


@time_entries_router.post("/", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED)
def create_new_time_entry(
    entry_in: TimeEntryCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Employees can only log hours for themselves. Managers/admins may enter
    # entries for anyone (e.g. corrections).
    if get_role(db, current_employee.id) not in ("admin", "manager") and entry_in.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only log time for yourself")
    return create_time_entry(db, entry_in)


@time_entries_router.get("/", response_model=List[TimeEntryOut])
def list_time_entries(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    date_gte: Optional[date] = None,
    date_lte: Optional[date] = None,
    billable: Optional[bool] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Employees can only ever see their own time entries — regardless of what
    # user_id is passed — so History/reporting can't be used to browse
    # someone else's hours by calling the API directly. Managers/admins can
    # see anyone's (or everyone's, when user_id is omitted).
    if get_role(db, current_employee.id) not in ("admin", "manager"):
        user_id = current_employee.id
    return get_time_entries(
        db,
        user_id=user_id,
        project_id=project_id,
        date_gte=date_gte,
        date_lte=date_lte,
        billable=billable,
        status=status,
    )


@time_entries_router.get("/{entry_id}", response_model=TimeEntryOut)
def get_time_entry_detail(
    entry_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    entry = get_time_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    if get_role(db, current_employee.id) not in ("admin", "manager") and entry.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own time entries")
    return entry


@time_entries_router.put("/{entry_id}", response_model=TimeEntryOut)
def update_time_entry_detail(
    entry_id: str,
    entry_in: TimeEntryUpdate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    existing = get_time_entry(db, entry_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    if get_role(db, current_employee.id) not in ("admin", "manager") and existing.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own time entries")
    entry = update_time_entry(db, entry_id, entry_in)
    return entry


@time_entries_router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_entry_detail(
    entry_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    existing = get_time_entry(db, entry_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    if get_role(db, current_employee.id) not in ("admin", "manager") and existing.user_id != current_employee.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own time entries")
    delete_time_entry(db, entry_id)
