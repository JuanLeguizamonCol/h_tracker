from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.employee_section_access import EmployeeSectionAccess
from schemas.section_access import SectionAccessOut, SectionAccessUpdate
from utils.auth_jwt import get_current_employee
from utils.roles import require_admin
from utils.section_access import SECTIONS, get_all_section_access

section_access_router = APIRouter(prefix="/section-access", tags=["section-access"])


def _resolved_list(db: Session, employee_id: str) -> List[SectionAccessOut]:
    overrides = {
        o.section: o for o in
        db.query(EmployeeSectionAccess).filter(EmployeeSectionAccess.employee_id == employee_id).all()
    }
    access = get_all_section_access(db, employee_id)
    return [
        SectionAccessOut(
            section=section,
            label=label,
            can_view=access[section][0],
            can_edit=access[section][1],
            view_overridden=section in overrides and overrides[section].can_view is not None,
            edit_overridden=section in overrides and overrides[section].can_edit is not None,
        )
        for section, label in SECTIONS.items()
    ]


@section_access_router.get("/me", response_model=List[SectionAccessOut])
def get_my_section_access(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    """Drives the sidebar and route guards for the caller themselves."""
    return _resolved_list(db, current_employee.id)


@section_access_router.get(
    "/{employee_id}", response_model=List[SectionAccessOut], dependencies=[Depends(require_admin)],
)
def get_employee_section_access(employee_id: str, db: Session = Depends(get_db)):
    if not db.query(Employee).filter(Employee.id == employee_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return _resolved_list(db, employee_id)


@section_access_router.put(
    "/{employee_id}", response_model=List[SectionAccessOut], dependencies=[Depends(require_admin)],
)
def update_employee_section_access(
    employee_id: str,
    body: SectionAccessUpdate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if not db.query(Employee).filter(Employee.id == employee_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    # Mirrors PUT /user-roles/{user_id}'s "you cannot change your own role" —
    # editing your own access could lock you out of this very panel.
    if employee_id == current_employee.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own access.",
        )

    db.query(EmployeeSectionAccess).filter(EmployeeSectionAccess.employee_id == employee_id).delete()
    for item in body.overrides:
        if item.section not in SECTIONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown section: {item.section}")
        if item.can_view is None and item.can_edit is None:
            continue
        db.add(EmployeeSectionAccess(
            employee_id=employee_id, section=item.section,
            can_view=item.can_view, can_edit=item.can_edit,
            updated_by=current_employee.id,
        ))
    db.commit()
    return _resolved_list(db, employee_id)
