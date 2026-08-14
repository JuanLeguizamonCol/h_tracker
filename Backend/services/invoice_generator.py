import logging
import uuid
from typing import Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from models.invoice import Invoice
from models.invoice_lines import InvoiceLine
from models.invoice_time_entries import InvoiceTimeEntry
from models.projects import Project
from models.clients import Client
from models.time_entries import TimeEntry
from models.employee_projects import EmployeeProject
from models.project_roles import ProjectRole
from models.employees import Employee
from services.invoice_number_service import atomic_generate_number_for_client

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

    # Managed Services is a retainer — it still bills the minimum-hours
    # package even when nobody logged time this period, so it does NOT skip
    # on zero entries like every other billing mode does.
    if not entries and not project.is_managed_services:
        return {"generated": False, "skipped": True, "reason": "no_entries", "invoice_number": None}

    company = getattr(project, "owner_company", None) or "IPC"

    client = db.query(Client).filter(Client.id == project.client_id).first()
    if not client or not client.client_number:
        logger.warning(
            f"Skipping project {project.id}: client has no Client Number set — cannot generate invoice number"
        )
        return {"generated": False, "skipped": True, "reason": "missing_client_number", "invoice_number": None}

    if project.is_fixed_fee and not project.fixed_fee_amount:
        logger.warning(f"Skipping project {project.id}: marked fixed-fee but has no fee amount set")
        return {"generated": False, "skipped": True, "reason": "missing_fixed_fee_amount", "invoice_number": None}

    if project.is_managed_services and not project.managed_services_min_hours:
        logger.warning(f"Skipping project {project.id}: marked managed-services but has no minimum hours set")
        return {"generated": False, "skipped": True, "reason": "missing_min_hours", "invoice_number": None}

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
        invoice.invoice_number = atomic_generate_number_for_client(db, client.id, client.client_number, company)
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

        # Real (hours x rate) amounts — used as-is for normal hourly projects,
        # and also used to derive the blended rate for Managed Services.
        real_subtotal = 0.0
        total_hours = 0.0
        for uid, data in employee_hours.items():
            role_id = assign_map.get(uid)
            role = role_map.get(role_id) if role_id else None
            rate = float(role.hourly_rate_usd) if role else 0.0
            real_subtotal += data["hours"] * rate
            total_hours += data["hours"]

        # Invoice lines. For Fixed Fee / Managed Services projects, hours are
        # still tracked per employee for reference, but rate/amount are
        # zeroed out — the invoice total comes from the flat/package amount
        # below, not from hours x rate.
        is_flat_billing = project.is_fixed_fee or project.is_managed_services
        subtotal = 0.0
        for uid, data in employee_hours.items():
            role_id = assign_map.get(uid)
            role = role_map.get(role_id) if role_id else None
            rate = 0.0 if is_flat_billing else (float(role.hourly_rate_usd) if role else 0.0)
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

        if project.is_fixed_fee:
            fee_amount = float(project.fixed_fee_amount)
            invoice.fixed_fee_amount = fee_amount
            invoice.subtotal = fee_amount
            invoice.total = fee_amount
        elif project.is_managed_services:
            # Per-role minimum: each role with its minimum enabled bills
            # max(actual, min_hours) for the period; roles left off bill flat on
            # actual hours. A min-enabled role bills its minimum even with no
            # hours logged (e.g. a Manager's guaranteed package).
            actual_by_role: dict = {}
            for uid, data in employee_hours.items():
                rid = assign_map.get(uid)
                if rid:
                    actual_by_role[rid] = actual_by_role.get(rid, 0.0) + data["hours"]
            roles_to_bill = set(actual_by_role) | {
                rid for rid, r in role_map.items() if r.min_hours_enabled
            }
            fee_amount = 0.0
            for rid in roles_to_bill:
                role = role_map.get(rid)
                if not role:
                    continue
                rate = float(role.hourly_rate_usd)
                actual = actual_by_role.get(rid, 0.0)
                if role.min_hours_enabled and role.min_hours is not None:
                    billed = max(actual, float(role.min_hours))
                else:
                    billed = actual
                fee_amount += billed * rate
            invoice.fixed_fee_amount = fee_amount
            invoice.subtotal = fee_amount
            invoice.total = fee_amount
        else:
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
                total=float(invoice.total),
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


def generate_invoices_for_period(
    db: Session, period_start: date, period_end: date, owner_id: Optional[str] = None
) -> dict:
    """
    Generate draft invoices for every active, non-internal project that has
    unlinked billable time entries in [period_start, period_end].

    When `owner_id` is given, only projects owned by that employee are
    considered — so a manual run bills just the caller's own projects.

    Thin wrapper over generate_invoice_for_project_period — used by the manual
    /invoices/generate-monthly endpoint. Idempotent: safe to re-run for a period.
    Returns: {"generated": int, "skipped": int, "errors": list}
    """
    generated = 0
    skipped = 0
    errors = []

    query = db.query(Project).filter(
        Project.is_active == True,  # noqa: E712
        Project.is_internal == False,  # noqa: E712
    )
    if owner_id is not None:
        query = query.filter(Project.owner_id == owner_id)
    active_projects = query.all()

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
