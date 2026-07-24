from typing import List, Optional, Dict, Any
from datetime import date as date_type, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text

from config.database import get_db
from services.invoice import create_invoice, get_invoices, get_invoice, update_invoice, delete_invoice
from services.invoice_expenses import create_expense, get_expenses, get_expense, update_expense, delete_expense
from services.export_pdf import generate_invoice_pdf
from services.export_excel import generate_invoice_xlsx, generate_invoices_report_xlsx
from services.invoice_generator import generate_invoices_for_period
from schemas.invoice import (
    InvoiceCreate, InvoiceUpdate, InvoiceOut,
    InvoiceEditDataOut, InvoiceEditClient, InvoiceEditProject, InvoiceEditLine, InvoiceEditExpense,
    InvoicePatch,
)
from schemas.invoice_expenses import InvoiceExpenseCreate
from schemas.invoice_lines import InvoiceLineUpdate
from models.invoice_lines import InvoiceLine
from models.invoice_expenses import InvoiceExpense
from models.time_entries import TimeEntry
from models.scheduler_log import SchedulerLog
from models.projects import Project
from models.clients import Client
from models.employees import Employee
from models.user_roles import UserRole
from models.invoice_time_entries import InvoiceTimeEntry
from services.invoice_hours_on_hold import upsert_on_hold_entry, delete_on_hold_entry
from sqlalchemy import func
from dateutil.relativedelta import relativedelta
import uuid

invoice_router = APIRouter(prefix="/invoices", tags=["invoices"])


@invoice_router.get("/signatories")
def list_signatories(company: Optional[str] = None):
    """Return signatories for a given company (IPC or PI). Defaults to IPC."""
    from services.invoice_config import COMPANY_SIGNATORIES
    key = company if company in COMPANY_SIGNATORIES else "IPC"
    return COMPANY_SIGNATORIES[key]


@invoice_router.get("/preview-number")
def preview_invoice_number(company: str = "IPC", db: Session = Depends(get_db)):
    """Preview next invoice number for a company without incrementing the counter."""
    from services.invoice_number_service import preview_next_number
    return preview_next_number(db, company)


@invoice_router.post("/", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_new_invoice(invoice_in: InvoiceCreate, db: Session = Depends(get_db)):
    invoice = create_invoice(db, invoice_in)
    # Notify project manager
    project = db.query(Project).filter(Project.id == invoice.project_id).first()
    if project and project.manager_id:
        from services.notifications import notify_invoice_generated
        notify_invoice_generated(
            db,
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number or invoice.id[:8],
            project_name=project.name,
            manager_id=project.manager_id,
            total=float(invoice.total or 0),
        )
        db.commit()
        db.refresh(invoice)
    return invoice


@invoice_router.get("/", response_model=List[InvoiceOut])
def list_invoices(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return get_invoices(db, project_id=project_id, status=status)


@invoice_router.get("/check-hours")
def check_hours(
    project_id: str,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Check if a project has unlinked billable time entries for the period."""
    linked_ids_result = db.execute(
        sql_text("SELECT time_entry_id FROM invoice_time_entries")
    ).fetchall()
    linked_ids = {row[0] for row in linked_ids_result}

    q = db.query(TimeEntry).filter(
        TimeEntry.project_id == project_id,
        TimeEntry.billable == True,
        TimeEntry.status == 'normal',
    )
    if period_start and period_end:
        start = datetime.strptime(period_start, "%Y-%m-%d").date()
        end = datetime.strptime(period_end, "%Y-%m-%d").date()
        q = q.filter(TimeEntry.date >= start, TimeEntry.date <= end)
    entries = q.all()
    available = [e for e in entries if e.id not in linked_ids]

    total_hours = sum(float(e.hours) for e in available)
    return {
        "has_entries": len(available) > 0,
        "total_hours": total_hours,
        "total_amount": 0.0,
        "entry_count": len(available),
    }


@invoice_router.post("/generate-monthly")
def generate_monthly_invoices(body: Dict[str, Any], db: Session = Depends(get_db)):
    """Manually trigger invoice generation for a given period."""
    period_start_str = body.get("period_start")
    period_end_str = body.get("period_end")
    if not period_start_str or not period_end_str:
        raise HTTPException(status_code=400, detail="period_start and period_end are required (YYYY-MM-DD)")

    period_start = datetime.strptime(period_start_str, "%Y-%m-%d").date()
    period_end = datetime.strptime(period_end_str, "%Y-%m-%d").date()

    result = generate_invoices_for_period(db, period_start, period_end)

    log = SchedulerLog(
        id=str(uuid.uuid4()),
        run_at=datetime.now(),
        period_start=period_start_str,
        period_end=period_end_str,
        invoices_generated=result["generated"],
        invoices_skipped=result["skipped"],
        status="success" if not result["errors"] else "error",
        error_message="; ".join(result["errors"]) if result["errors"] else None,
    )
    db.add(log)
    db.commit()

    return result


@invoice_router.get("/scheduler-status")
def get_scheduler_status(db: Session = Depends(get_db)):
    """Get the last scheduler run info."""
    last_log = db.query(SchedulerLog).order_by(SchedulerLog.run_at.desc()).first()
    if not last_log:
        return {
            "last_run": None,
            "last_period": None,
            "invoices_generated": 0,
            "next_run": None,
        }

    today = date_type.today()
    if today.day <= 3:
        next_run = today.replace(day=3)
    else:
        next_run = (today.replace(day=1) + relativedelta(months=1)).replace(day=3)

    return {
        "last_run": last_log.run_at.isoformat() if last_log.run_at else None,
        "last_period": f"{last_log.period_start} / {last_log.period_end}",
        "invoices_generated": last_log.invoices_generated,
        "next_run": next_run.isoformat(),
        "status": last_log.status,
    }


def _build_edit_data(invoice_id: str, db: Session) -> dict:
    """Shared helper — returns a plain dict suitable for PDF/Excel generators and the API response."""
    invoice = get_invoice(db, invoice_id)
    project = db.query(Project).filter(Project.id == invoice.project_id).first()
    client = db.query(Client).filter(Client.id == project.client_id).first() if project else None

    # Batch the per-line lookups to avoid N+1 queries (one role query + one
    # hours-aggregate query per line). Roles for all line employees in one go…
    line_user_ids = {ln.user_id for ln in invoice.lines if ln.user_id}
    role_by_user = dict(
        db.query(UserRole.user_id, UserRole.role).filter(UserRole.user_id.in_(line_user_ids)).all()
    ) if line_user_ids else {}
    # …and the original (linked) hours per employee for this invoice in one
    # grouped query instead of one aggregate per line.
    hours_by_user = dict(
        db.query(TimeEntry.user_id, func.coalesce(func.sum(TimeEntry.hours), 0))
        .join(InvoiceTimeEntry, InvoiceTimeEntry.time_entry_id == TimeEntry.id)
        .filter(InvoiceTimeEntry.invoice_id == invoice.id)
        .group_by(TimeEntry.user_id)
        .all()
    ) if line_user_ids else {}

    lines_out = []
    for line in invoice.lines:
        # Preserve prior semantics: fall back to the line's own hours when there
        # are no linked entries (sum is 0/absent) or the line has no employee.
        original_hours = float(hours_by_user.get(line.user_id, 0) or line.hours)
        lines_out.append({
            "id": line.id,
            "user_id": line.user_id,
            "employee_name": line.employee_name,
            "title": line.role_name,
            "role": role_by_user.get(line.user_id),
            "hours": float(line.hours),
            "hourly_rate": float(line.rate_snapshot),
            "discount_type": line.discount_type,
            "discount_value": float(line.discount_value) if line.discount_value is not None else 0.0,
            "amount": float(line.amount),
            "original_hours": original_hours,
        })

    expenses_out = [
        {
            "id": exp.id,
            "date": exp.date,
            "professional": exp.professional,
            "vendor": exp.vendor,
            "description": exp.description,
            "category": exp.category,
            "amount_usd": float(exp.amount_usd),
            "payment_source": exp.payment_source,
            "receipt_attached": exp.receipt_attached,
            "notes": exp.notes,
        }
        for exp in get_expenses(db, invoice_id)
    ]

    return {
        "invoice": {
            "id": invoice.id,
            "project_id": invoice.project_id,
            "status": invoice.status,
            "subtotal": float(invoice.subtotal),
            "discount": float(invoice.discount),
            "total": float(invoice.total),
            "cap_amount": float(invoice.cap_amount) if invoice.cap_amount is not None else None,
            "notes": invoice.notes,
            "invoice_number": invoice.invoice_number,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "period_start": invoice.period_start,
            "period_end": invoice.period_end,
            "signatory_name": invoice.signatory_name,
            "signatory_title": invoice.signatory_title,
            "owner_company": invoice.owner_company or "IPC",
            "created_at": invoice.created_at,
            "updated_at": invoice.updated_at,
        },
        "client": {
            "id": client.id,
            "name": client.name,
            "email": client.email,
            "phone": client.phone,
            "manager_name": client.manager_name,
            "job_title": client.job_title,
            "street_address_1": client.street_address_1,
            "street_address_2": client.street_address_2,
            "city": client.city,
            "state": client.state,
            "zip": client.zip,
        } if client else None,
        "project": {"id": project.id, "name": project.name, "client_id": project.client_id, "owner_company": project.owner_company or "IPC"} if project else None,
        "lines": lines_out,
        "expenses": expenses_out,
    }


@invoice_router.get("/export/report")
def export_invoices_report(
    status: Optional[str] = None,
    company: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Export all invoices (optionally filtered) as a multi-sheet XLSX report."""
    invoices = get_invoices(db, project_id=None, status=status)
    if company:
        invoices = [inv for inv in invoices if (inv.owner_company or "IPC") == company]
    invoices_data = [_build_edit_data(inv.id, db) for inv in invoices]
    xlsx_bytes = generate_invoices_report_xlsx(invoices_data)
    import datetime as dt
    filename = f"Invoices_Report_{dt.date.today()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@invoice_router.get("/{invoice_id}/edit-data", response_model=InvoiceEditDataOut)
def get_invoice_edit_data(invoice_id: str, db: Session = Depends(get_db)):
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    data = _build_edit_data(invoice_id, db)

    def _line(d):
        return InvoiceEditLine(**d)

    def _exp(d):
        return InvoiceEditExpense(**d)

    client_d = data["client"]
    project_d = data["project"]

    return InvoiceEditDataOut(
        invoice=invoice,
        client=InvoiceEditClient(**client_d) if client_d else None,
        project=InvoiceEditProject(**project_d) if project_d else None,
        lines=[_line(l) for l in data["lines"]],
        expenses=[_exp(e) for e in data["expenses"]],
    )


@invoice_router.patch("/{invoice_id}", response_model=InvoiceOut)
def patch_invoice(invoice_id: str, patch_in: InvoicePatch, db: Session = Depends(get_db)):
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    # Capture current company before any updates
    current_company = invoice.owner_company or "IPC"

    # Update simple invoice fields
    simple_fields = [
        "status", "cap_amount", "issue_date", "due_date",
        "period_start", "period_end", "notes", "signatory_name", "signatory_title", "owner_company",
    ]
    for field in simple_fields:
        value = getattr(patch_in, field)
        if value is not None:
            setattr(invoice, field, value)

    # If company changed, assign a new invoice number for the new company
    new_company = patch_in.owner_company
    if new_company and new_company != current_company:
        from services.invoice_number_service import atomic_generate_number
        invoice.invoice_number = atomic_generate_number(db, new_company)

    # Update lines
    if patch_in.lines:
        for line_patch in patch_in.lines:
            line = db.query(InvoiceLine).filter(
                InvoiceLine.id == line_patch.id,
                InvoiceLine.invoice_id == invoice_id,
            ).first()
            if line:
                if line_patch.hours is not None:
                    line.hours = line_patch.hours
                if line_patch.rate_snapshot is not None:
                    line.rate_snapshot = line_patch.rate_snapshot
                if line_patch.discount_type is not None:
                    line.discount_type = line_patch.discount_type
                if line_patch.discount_value is not None:
                    line.discount_value = line_patch.discount_value
                # Recompute amount
                line.amount = float(line.hours) * float(line.rate_snapshot)

    # Recompute invoice subtotal/total from lines
    db.flush()
    db.refresh(invoice)
    subtotal = sum(float(ln.amount) for ln in invoice.lines)
    total_discount = sum(
        (float(ln.amount) * float(ln.discount_value) / 100)
        if ln.discount_type == "percent"
        else float(ln.discount_value)
        for ln in invoice.lines
    )
    invoice.subtotal = subtotal
    invoice.discount = total_discount
    invoice.total = subtotal - total_discount

    # Handle expenses (upsert)
    if patch_in.expenses is not None:
        for exp_patch in patch_in.expenses:
            if exp_patch.id is None:
                # Create new expense
                new_exp = InvoiceExpense(
                    id=str(uuid.uuid4()),
                    invoice_id=invoice_id,
                    date=exp_patch.date,
                    professional=exp_patch.professional,
                    vendor=exp_patch.vendor,
                    description=exp_patch.description,
                    category=exp_patch.category or "Other",
                    amount_usd=exp_patch.amount_usd or 0,
                    payment_source=exp_patch.payment_source,
                    receipt_attached=exp_patch.receipt_attached or False,
                    notes=exp_patch.notes,
                )
                db.add(new_exp)
            else:
                exp = db.query(InvoiceExpense).filter(
                    InvoiceExpense.id == exp_patch.id,
                    InvoiceExpense.invoice_id == invoice_id,
                ).first()
                if exp:
                    for field in ["date", "professional", "vendor", "description", "category",
                                  "amount_usd", "payment_source", "receipt_attached", "notes"]:
                        value = getattr(exp_patch, field)
                        if value is not None:
                            setattr(exp, field, value)

    # Handle on-hold entries (upsert / delete per line)
    if patch_in.on_hold_entries:
        for entry in patch_in.on_hold_entries:
            if entry.has_on_hold and entry.original_hours > entry.billed_hours:
                upsert_on_hold_entry(
                    db,
                    invoice_id=invoice_id,
                    line_id=entry.line_id,
                    employee_name=entry.employee_name,
                    original_hours=entry.original_hours,
                    billed_hours=entry.billed_hours,
                    rate=entry.rate,
                    reason=entry.reason,
                )
            else:
                delete_on_hold_entry(db, invoice_id=invoice_id, line_id=entry.line_id)

    db.commit()
    db.refresh(invoice)
    return invoice


@invoice_router.get("/{invoice_id}/export/pdf")
def export_invoice_pdf(invoice_id: str, db: Session = Depends(get_db)):
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    edit_data = _build_edit_data(invoice_id, db)
    pdf_bytes = generate_invoice_pdf(edit_data)
    inv_label = invoice.invoice_number or invoice_id[:8]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="INV-{inv_label}.pdf"'},
    )


@invoice_router.get("/{invoice_id}/export/xlsx")
def export_invoice_xlsx(invoice_id: str, db: Session = Depends(get_db)):
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    edit_data = _build_edit_data(invoice_id, db)
    xlsx_bytes = generate_invoice_xlsx(edit_data)
    inv_label = invoice.invoice_number or invoice_id[:8]
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="INV-{inv_label}.xlsx"'},
    )


@invoice_router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice_detail(invoice_id: str, db: Session = Depends(get_db)):
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@invoice_router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice_detail(invoice_id: str, invoice_in: InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = update_invoice(db, invoice_id, invoice_in)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@invoice_router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice_detail(invoice_id: str, db: Session = Depends(get_db)):
    if not delete_invoice(db, invoice_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
