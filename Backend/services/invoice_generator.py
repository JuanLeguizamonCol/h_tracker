import logging
import uuid
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from models.invoice import Invoice
from models.invoice_lines import InvoiceLine
from models.invoice_time_entries import InvoiceTimeEntry
from models.projects import Project
from models.time_entries import TimeEntry
from models.employee_projects import EmployeeProject
from models.project_roles import ProjectRole
from models.employees import Employee
from services.invoice_number_service import atomic_generate_number

logger = logging.getLogger(__name__)


def generate_invoice_for_project_period(
    db: Session,
    project: Project,
    period_start: date,
    period_end: date,
) -> dict:
    """
    Generate ONE draft invoice for a single project + billing period.

    Idempotent by design:
      - Skips early if an auto-generated invoice already exists for this
        (project, period_start, period_end).
      - Even under a race (two runners at once), the partial unique index
        `uq_invoices_auto_project_period` makes the second INSERT fail with
        IntegrityError, which is caught here and reported as skipped — so a
        project+period can never be auto-invoiced twice.

    Returns: {"generated": bool, "skipped": bool, "reason": str, "invoice_number": str | None}
    """
    # 1. Fast path: already invoiced for this period.
    existing = db.query(Invoice).filter(
        Invoice.project_id == project.id,
        Invoice.auto_generated == True,  # noqa: E712
        Invoice.period_start == period_start,
        Invoice.period_end == period_end,
    ).first()
    if existing:
        return {"generated": False, "skipped": True, "reason": "already_exists", "invoice_number": None}

    # 2. Collect unlinked billable time entries for the period.
    linked_ids = {
        row[0] for row in db.execute(text("SELECT time_entry_id FROM invoice_time_entries")).fetchall()
    }
    entries = db.query(TimeEntry).filter(
        TimeEntry.project_id == project.id,
        TimeEntry.billable == True,  # noqa: E712
        TimeEntry.status == "normal",
        TimeEntry.date >= period_start,
        TimeEntry.date <= period_end,
    ).all()
    entries = [e for e in entries if e.id not in linked_ids]

    if not entries:
        return {"generated": False, "skipped": True, "reason": "no_entries", "invoice_number": None}

    company = getattr(project, "owner_company", None) or "IPC"
    issue_year = period_end.year

    try:
        invoice = Invoice(
            id=str(uuid.uuid4()),
            project_id=project.id,
            status="draft",
            subtotal=0,
            discount=0,
            total=0,
            owner_company=company,
            issue_date=date.today(),
            period_start=period_start,
            period_end=period_end,
            auto_generated=True,
            notes=f"[Auto-generated] Period: {period_start} to {period_end}",
        )
        db.add(invoice)
        invoice.invoice_number = atomic_generate_number(db, company, issue_year)
        # Flush now so the unique-index race is detected before we build lines.
        db.flush()

        # Roles & assignments for rate lookup.
        assignments = db.query(EmployeeProject).filter(
            EmployeeProject.project_id == project.id
        ).all()
        assign_map = {a.user_id: a.role_id for a in assignments}

        roles = db.query(ProjectRole).filter(ProjectRole.project_id == project.id).all()
        role_map = {r.id: r for r in roles}

        # Group entries by employee.
        employee_hours: dict = {}
        for entry in entries:
            uid = entry.user_id
            if uid not in employee_hours:
                employee = db.query(Employee).filter(Employee.id == uid).first()
                employee_hours[uid] = {
                    "user_id": uid,
                    "name": employee.name if employee else "Unknown",
                    "hours": 0.0,
                    "entry_ids": [],
                }
            employee_hours[uid]["hours"] += float(entry.hours)
            employee_hours[uid]["entry_ids"].append(entry.id)

        # Invoice lines.
        subtotal = 0.0
        for uid, data in employee_hours.items():
            role_id = assign_map.get(uid)
            role = role_map.get(role_id) if role_id else None
            rate = float(role.hourly_rate_usd) if role else 0.0
            amount = data["hours"] * rate
            db.add(InvoiceLine(
                id=str(uuid.uuid4()),
                invoice_id=invoice.id,
                user_id=uid,
                employee_name=data["name"],
                role_name=role.name if role else None,
                hours=data["hours"],
                rate_snapshot=rate,
                amount=amount,
                discount_type="amount",
                discount_value=0,
            ))
            subtotal += amount

        # Link time entries (guards against double-billing on future runs).
        for uid, data in employee_hours.items():
            for entry_id in data["entry_ids"]:
                db.add(InvoiceTimeEntry(
                    id=str(uuid.uuid4()),
                    invoice_id=invoice.id,
                    time_entry_id=entry_id,
                ))

        invoice.subtotal = subtotal
        invoice.total = subtotal

        if project.manager_id:
            from services.notifications import notify_invoice_generated
            notify_invoice_generated(
                db,
                invoice_id=invoice.id,
                invoice_number=invoice.invoice_number,
                project_name=project.name,
                manager_id=project.manager_id,
                total=subtotal,
            )

        db.commit()
        logger.info(
            f"Auto-generated invoice {invoice.invoice_number} for project {project.id} "
            f"({period_start} -> {period_end})"
        )
        return {"generated": True, "skipped": False, "reason": "created", "invoice_number": invoice.invoice_number}

    except IntegrityError:
        # Lost the race: another runner already created this project+period invoice.
        db.rollback()
        logger.info(f"Skipping project {project.id}: invoice for period already created concurrently")
        return {"generated": False, "skipped": True, "reason": "race_lost", "invoice_number": None}


def generate_invoices_for_period(db: Session, period_start: date, period_end: date) -> dict:
    """
    Generate draft invoices for every active, non-internal project that has
    unlinked billable time entries in [period_start, period_end].

    Thin wrapper over generate_invoice_for_project_period — used by the manual
    /invoices/generate-monthly endpoint. Idempotent: safe to re-run for a period.
    Returns: {"generated": int, "skipped": int, "errors": list}
    """
    generated = 0
    skipped = 0
    errors = []

    active_projects = db.query(Project).filter(
        Project.is_active == True,  # noqa: E712
        Project.is_internal == False,  # noqa: E712
    ).all()

    for project in active_projects:
        try:
            result = generate_invoice_for_project_period(db, project, period_start, period_end)
            if result["generated"]:
                generated += 1
            else:
                skipped += 1
        except Exception as e:
            db.rollback()
            errors.append(f"{project.id}: {e}")
            logger.error(f"Error generating invoice for project {project.id}: {e}")

    return {"generated": generated, "skipped": skipped, "errors": errors}
