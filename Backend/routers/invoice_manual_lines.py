from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from utils.section_access import require_section_edit
from services.invoice_manual_lines import (
    create_invoice_manual_line, get_invoice_manual_lines,
    get_invoice_manual_line, update_invoice_manual_line, delete_invoice_manual_line,
)
from schemas.invoice_manual_lines import InvoiceManualLineCreate, InvoiceManualLineUpdate, InvoiceManualLineOut

invoice_manual_lines_router = APIRouter(prefix="/invoice-manual-lines", tags=["invoice-manual-lines"])


@invoice_manual_lines_router.post("/", response_model=InvoiceManualLineOut, status_code=status.HTTP_201_CREATED,
                                   dependencies=[Depends(require_section_edit('invoices'))])
def create_new_manual_line(line_in: InvoiceManualLineCreate, db: Session = Depends(get_db)):
    return create_invoice_manual_line(db, line_in)


@invoice_manual_lines_router.get("/", response_model=List[InvoiceManualLineOut])
def list_manual_lines(invoice_id: Optional[str] = None, db: Session = Depends(get_db)):
    return get_invoice_manual_lines(db, invoice_id=invoice_id)


@invoice_manual_lines_router.get("/{line_id}", response_model=InvoiceManualLineOut)
def get_manual_line_detail(line_id: str, db: Session = Depends(get_db)):
    line = get_invoice_manual_line(db, line_id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual line not found")
    return line


@invoice_manual_lines_router.put("/{line_id}", response_model=InvoiceManualLineOut, dependencies=[Depends(require_section_edit('invoices'))])
def update_manual_line_detail(line_id: str, line_in: InvoiceManualLineUpdate, db: Session = Depends(get_db)):
    line = update_invoice_manual_line(db, line_id, line_in)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual line not found")
    return line


@invoice_manual_lines_router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_section_edit('invoices'))])
def delete_manual_line_detail(line_id: str, db: Session = Depends(get_db)):
    if not delete_invoice_manual_line(db, line_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual line not found")
