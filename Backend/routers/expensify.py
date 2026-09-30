"""Expensify integration endpoints."""
import os
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from utils.section_access import require_section_edit
from services.expensify_service import fetch_expense_reports, filter_approved_only, _credentials_configured
from models.invoice_expenses import InvoiceExpense
from models.invoice import Invoice
import uuid

logger = logging.getLogger(__name__)

expensify_router = APIRouter(prefix="/expensify", tags=["expensify"])

# In-memory last-sync state (resets on restart — good enough for dev)
_last_sync: dict = {}


@expensify_router.get("/status")
def get_expensify_status():
    """Return Expensify integration status and last sync info."""
    return {
        "configured": _credentials_configured(),
        "last_sync": _last_sync.get("timestamp"),
        "last_sync_count": _last_sync.get("count", 0),
        "last_sync_invoice_id": _last_sync.get("invoice_id"),
    }


@expensify_router.get("/reports")
async def preview_reports(
    project_code: Optional[str] = None,
    employee_email: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Preview importable (APPROVED) expense reports from Expensify.
    Does NOT write anything to the database.
    """
    try:
        reports = await fetch_expense_reports(
            project_code=project_code,
            employee_email=employee_email,
            date_from=date_from,
            date_to=date_to,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Expensify fetch failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Expensify API error: {str(e)}",
        )

    return {
        "count": len(reports),
        "reports": reports,
    }


@expensify_router.post("/sync", dependencies=[Depends(require_section_edit('invoices'))])
async def sync_to_invoice(
    invoice_id: str,
    project_code: Optional[str] = None,
    employee_email: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    cop_rate: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    Fetch APPROVED expenses from Expensify and import them into the specified invoice.
    Only APPROVED reports are imported. Existing expenses with the same Expensify
    expense_id (stored in description) are skipped to avoid duplicates.
    """
    # Verify invoice exists
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    try:
        reports = await fetch_expense_reports(
            project_code=project_code,
            employee_email=employee_email,
            date_from=date_from,
            date_to=date_to,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Expensify sync failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Expensify API error: {str(e)}",
        )

    # Get existing expense_ids already imported (stored in notes field as "expensify:{id}")
    existing = db.query(InvoiceExpense).filter(InvoiceExpense.invoice_id == invoice_id).all()
    existing_ext_ids = set()
    for exp in existing:
        if exp.notes and exp.notes.startswith("expensify:"):
            existing_ext_ids.add(exp.notes.split(":", 1)[1])

    imported = 0
    skipped = 0
    conversion_notes = []

    for report in reports:
        for exp in report.get("expenses", []):
            ext_id = exp.get("expense_id", "")
            if ext_id and ext_id in existing_ext_ids:
                skipped += 1
                continue

            # Resolve COP rate override if provided
            amount_usd = exp["amount_usd"]
            if cop_rate and exp["original_currency"] == "COP":
                from services.expensify_service import convert_to_usd
                amount_usd, note = convert_to_usd(exp["original_amount"], "COP", {"COP": cop_rate})
                if note:
                    conversion_notes.append(note)
            elif exp.get("conversion_note"):
                conversion_notes.append(exp["conversion_note"])

            new_exp = InvoiceExpense(
                id=str(uuid.uuid4()),
                invoice_id=invoice_id,
                date=exp.get("date") or report.get("submitted_date"),
                professional=report.get("submitted_by") or None,
                vendor=exp.get("merchant") or None,
                description=exp.get("description") or exp.get("tag") or None,
                category=exp.get("category") or "Other",
                amount_usd=amount_usd,
                payment_source="Expensify",
                receipt_attached=bool(exp.get("receipt_url")),
                notes=f"expensify:{ext_id}" if ext_id else None,
            )
            db.add(new_exp)
            imported += 1
            if ext_id:
                existing_ext_ids.add(ext_id)

    db.commit()

    _last_sync.update({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": imported,
        "invoice_id": invoice_id,
    })

    return {
        "imported": imported,
        "skipped": skipped,
        "reports_processed": len(reports),
        "conversion_notes": list(set(conversion_notes)),
    }
