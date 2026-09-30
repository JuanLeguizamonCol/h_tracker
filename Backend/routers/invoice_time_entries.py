from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from config.database import get_db
from utils.section_access import require_section_edit
from services.invoice_time_entries import (
    get_invoice_time_entries, get_all_linked_entry_ids,
    bulk_link_time_entries, delete_invoice_time_entry,
)
from schemas.invoice_time_entries import InvoiceTimeEntryOut

invoice_time_entries_router = APIRouter(prefix="/invoice-time-entries", tags=["invoice-time-entries"])


class BulkLinkBody(BaseModel):
    invoice_id: str
    time_entry_ids: List[str]


@invoice_time_entries_router.get("/linked-ids", response_model=List[str])
def get_linked_ids(db: Session = Depends(get_db)):
    return get_all_linked_entry_ids(db)


@invoice_time_entries_router.get("/", response_model=List[InvoiceTimeEntryOut])
def list_invoice_time_entries(invoice_id: str, db: Session = Depends(get_db)):
    return get_invoice_time_entries(db, invoice_id)


@invoice_time_entries_router.post("/bulk", response_model=List[InvoiceTimeEntryOut], status_code=status.HTTP_201_CREATED,
                                   dependencies=[Depends(require_section_edit('invoices'))])
def bulk_link(body: BulkLinkBody, db: Session = Depends(get_db)):
    return bulk_link_time_entries(db, body.invoice_id, body.time_entry_ids)


@invoice_time_entries_router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_section_edit('invoices'))])
def delete_link(link_id: str, db: Session = Depends(get_db)):
    if not delete_invoice_time_entry(db, link_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
