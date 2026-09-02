"""Reports router — detailed exports of worked hours.

Currently exposes a single endpoint that streams a fully-detailed Excel of the
time entries matching the same filters used by the Reports page. Non-admin
callers are transparently restricted to their own entries.
"""
from typing import List, Optional
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from config.database import get_db
from models.time_entries import TimeEntry
from models.employees import Employee
from models.projects import Project
from models.clients import Client
from models.project_roles import ProjectRole
from utils.auth_jwt import get_current_employee
from utils.roles import get_role
from services.export_excel import generate_time_entries_report_xlsx

reports_router = APIRouter(prefix="/reports", tags=["reports"])

# Sentinel used by the frontend Location filter for employees with no location.
NO_LOCATION = "__none__"


def _is_manager_or_admin(emp: Employee, db: Session) -> bool:
    return get_role(db, emp.id) in ("admin", "manager")


@reports_router.get("/time-entries/export/xlsx")
def export_time_entries_xlsx(
    date_gte: Optional[date] = None,
    date_lte: Optional[date] = None,
    user_id: Optional[List[str]] = Query(None),
    project_id: Optional[List[str]] = Query(None),
    client_id: Optional[List[str]] = Query(None),
    location: Optional[List[str]] = Query(None),
    work_location: Optional[List[str]] = Query(None),
    owner_id: Optional[List[str]] = Query(None),
    manager_id: Optional[List[str]] = Query(None),
    status: Optional[str] = None,
    billing: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    is_admin = _is_manager_or_admin(current_employee, db)
    # Regular employees can only ever export their own entries, regardless of params.
    if not is_admin:
        user_id = [current_employee.id]

    q = (
        db.query(TimeEntry, Employee, Project, Client, ProjectRole)
        .join(Employee, TimeEntry.user_id == Employee.id)
        .join(Project, TimeEntry.project_id == Project.id)
        .outerjoin(Client, Project.client_id == Client.id)
        .outerjoin(ProjectRole, TimeEntry.role_id == ProjectRole.id)
    )

    if date_gte is not None:
        q = q.filter(TimeEntry.date >= date_gte)
    if date_lte is not None:
        q = q.filter(TimeEntry.date <= date_lte)
    if user_id:
        q = q.filter(TimeEntry.user_id.in_(user_id))
    if project_id:
        q = q.filter(TimeEntry.project_id.in_(project_id))
    if client_id:
        q = q.filter(Project.client_id.in_(client_id))
    if owner_id:
        q = q.filter(Project.owner_id.in_(owner_id))
    if manager_id:
        q = q.filter(Project.manager_id.in_(manager_id))
    if location:
        ors = []
        if NO_LOCATION in location:
            ors.append((Employee.location.is_(None)) | (func.trim(Employee.location) == ""))
        real_locations = [l for l in location if l != NO_LOCATION]
        if real_locations:
            ors.append(func.trim(Employee.location).in_(real_locations))
        if ors:
            q = q.filter(or_(*ors))
    if work_location:
        # Where the hours were actually worked — the entry's own location if
        # it has one, else the employee's home location (same fallback as
        # the Reports page's Work Location filter).
        resolved = func.coalesce(func.nullif(func.trim(TimeEntry.location), ""), func.trim(Employee.location))
        ors = []
        if NO_LOCATION in work_location:
            ors.append(resolved.is_(None) | (resolved == ""))
        real_locations = [l for l in work_location if l != NO_LOCATION]
        if real_locations:
            ors.append(resolved.in_(real_locations))
        if ors:
            q = q.filter(or_(*ors))
    if status in ("normal", "on_hold"):
        q = q.filter(TimeEntry.status == status)
    if billing == "billable":
        q = q.filter(TimeEntry.billable.is_(True))
    elif billing == "non_billable":
        q = q.filter(TimeEntry.billable.is_(False))
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            func.lower(Project.name).like(term)
            | func.lower(Employee.name).like(term)
            | func.lower(func.coalesce(TimeEntry.notes, "")).like(term)
        )

    q = q.order_by(TimeEntry.date.desc(), Employee.name.asc())

    rows = []
    for te, emp, proj, cli, role in q.all():
        hours = float(te.hours or 0)
        rate = float(role.hourly_rate_usd) if role and role.hourly_rate_usd is not None else None
        amount = round(hours * rate, 2) if rate is not None else 0.0
        rows.append({
            "date": te.date,
            "employee_name": emp.name,
            "email": emp.email,
            "location": emp.location,
            "work_location": te.location or emp.location,
            "department": emp.department,
            "business_unit": emp.business_unit,
            "title": emp.title,
            "client_name": cli.name if cli else "",
            "project_name": proj.name,
            "project_code": proj.project_code,
            "role_name": role.name if role else "",
            "hours": hours,
            "billable": bool(te.billable),
            "rate": rate,
            "amount": amount,
            "status": te.status,
            "notes": te.notes,
            "created_at": te.created_at.strftime("%Y-%m-%d %H:%M") if te.created_at else "",
        })

    # ── Human-readable filter summary for the Summary sheet ──────────────────
    def _names_for(ids: list[str], model) -> str:
        rows = db.query(model).filter(model.id.in_(ids)).all()
        by_id = {r.id: r.name for r in rows}
        return ", ".join(by_id.get(i, i) for i in ids)

    filters: list[str] = []
    if project_id:
        filters.append(f"Project: {_names_for(project_id, Project)}")
    if client_id:
        filters.append(f"Client: {_names_for(client_id, Client)}")
    if user_id and is_admin:
        filters.append(f"Employee: {_names_for(user_id, Employee)}")
    if location:
        labels = ["No location" if l == NO_LOCATION else l for l in location]
        filters.append(f"Location: {', '.join(labels)}")
    if work_location:
        labels = ["No location" if l == NO_LOCATION else l for l in work_location]
        filters.append(f"Work Location: {', '.join(labels)}")
    if owner_id:
        filters.append(f"Owner: {_names_for(owner_id, Employee)}")
    if manager_id:
        filters.append(f"Manager: {_names_for(manager_id, Employee)}")
    if status in ("normal", "on_hold"):
        filters.append(f"Status: {'On Hold' if status == 'on_hold' else 'Normal'}")
    if billing in ("billable", "non_billable"):
        filters.append(f"Billing: {'Billable' if billing == 'billable' else 'Non-billable'}")
    if search:
        filters.append(f'Search: "{search}"')

    if not is_admin:
        scope = current_employee.name
    elif user_id:
        scope = _names_for(user_id, Employee) if len(user_id) <= 3 else f"{len(user_id)} employees"
    else:
        scope = "All employees"

    meta = {
        "date_from": str(date_gte) if date_gte else "—",
        "date_to": str(date_lte) if date_lte else "—",
        "scope": scope,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "filters": filters,
    }

    xlsx_bytes = generate_time_entries_report_xlsx(rows, meta)

    fname_from = str(date_gte) if date_gte else "all"
    fname_to = str(date_lte) if date_lte else "all"
    filename = f"worked-hours_{fname_from}_{fname_to}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
