"""Per-employee, per-section access — a second, optional layer on top of the
base role (employee/manager/admin).

Every section has a default View/Edit answer derived purely from the caller's
role (`_DEFAULTS` below) — this is today's actual behavior, unchanged. An
Admin can override either field for one employee on one section from the
Employees panel (`EmployeeSectionAccess`); a non-NULL override field wins,
NULL (or no row at all) falls back to the default. An empty table is exactly
today's behavior for everyone.

"Edit" on a section is defined as whatever a Manager can already do there
today — see the docstring on each `_DEFAULTS` entry. Genuinely Admin-exclusive
powers (project-role billing rates, editing/deleting a project, the
last-admin/protected-account guards, manual invoice renumbering, Invoices'
legacy-no-owner-project fallback, being a named super admin) are NOT part of
any section's "Edit" and stay gated by a real `get_role(...) == "admin"` check
wherever they already are — this module is never involved in those.
"""
from typing import Callable, Dict, Optional, Tuple
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.employee_section_access import EmployeeSectionAccess
from utils.auth_jwt import get_current_employee
from utils.roles import get_role

# (key, label) — order is display order in the Access tab / sidebar.
SECTIONS: Dict[str, str] = {
    "dashboard": "Dashboard",
    "timesheet": "Weekly Log",
    "history": "History",
    "profile": "My Profile",
    "projects": "Projects",
    "clients": "Clients",
    "employees": "Employees",
    "staffing": "Staffing",
    "invoices": "Invoices",
    "reports": "Reports",
}

_EVERYONE: Callable[[str], bool] = lambda role: True
_ADMIN_OR_MANAGER: Callable[[str], bool] = lambda role: role in ("admin", "manager")
_ADMIN_ONLY: Callable[[str], bool] = lambda role: role == "admin"
_NEVER: Callable[[str], bool] = lambda role: False

# (default_view, default_edit) per section, as a function of the base role.
_DEFAULTS: Dict[str, Tuple[Callable[[str], bool], Callable[[str], bool]]] = {
    "dashboard": (_EVERYONE, _NEVER),          # no write actions
    "timesheet": (_EVERYONE, _EVERYONE),       # everyone logs their own hours
    "history": (_EVERYONE, _NEVER),            # read-only page
    "profile": (_EVERYONE, _EVERYONE),         # everyone edits their own profile
    "projects": (_EVERYONE, _ADMIN_OR_MANAGER),
    "clients": (_EVERYONE, _EVERYONE),         # matches today's already-open behavior
    "employees": (_ADMIN_OR_MANAGER, _ADMIN_OR_MANAGER),
    "staffing": (_EVERYONE, _ADMIN_OR_MANAGER),
    "invoices": (_ADMIN_ONLY, _ADMIN_ONLY),
    "reports": (_ADMIN_OR_MANAGER, _NEVER),    # read-only analytics
}


def _require_valid_section(section: str) -> None:
    if section not in SECTIONS:
        raise ValueError(f"Unknown section: {section}")


def get_section_access(db: Session, employee_id: str, section: str) -> Tuple[bool, bool]:
    """Returns (can_view, can_edit) for this employee on this section."""
    _require_valid_section(section)
    role = get_role(db, employee_id)
    default_view, default_edit = _DEFAULTS[section]
    override = (
        db.query(EmployeeSectionAccess)
        .filter(EmployeeSectionAccess.employee_id == employee_id, EmployeeSectionAccess.section == section)
        .first()
    )
    can_view = default_view(role) if override is None or override.can_view is None else override.can_view
    can_edit = default_edit(role) if override is None or override.can_edit is None else override.can_edit
    return can_view, can_edit


def get_all_section_access(db: Session, employee_id: str) -> Dict[str, Tuple[bool, bool]]:
    return {section: get_section_access(db, employee_id, section) for section in SECTIONS}


def require_section_view(section: str):
    """FastAPI dependency factory — 403s unless the caller can at least view
    this section. Use in a route's `dependencies=[...]`."""
    _require_valid_section(section)

    def _dep(
        db: Session = Depends(get_db),
        current_employee: Employee = Depends(get_current_employee),
    ) -> None:
        can_view, _ = get_section_access(db, current_employee.id, section)
        if not can_view:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have access to {SECTIONS[section]}.",
            )

    return _dep


def require_section_edit(section: str):
    """FastAPI dependency factory — 403s unless the caller can edit this
    section. Use in a route's `dependencies=[...]`."""
    _require_valid_section(section)

    def _dep(
        db: Session = Depends(get_db),
        current_employee: Employee = Depends(get_current_employee),
    ) -> None:
        _, can_edit = get_section_access(db, current_employee.id, section)
        if not can_edit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have edit access to {SECTIONS[section]}.",
            )

    return _dep
