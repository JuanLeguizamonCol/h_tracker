from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from utils.section_access import require_section_edit
from services.invoice_lines import (
    create_invoice_line, bulk_create_invoice_lines,
    get_invoice_lines, get_invoice_line, update_invoice_line, delete_invoice_line,
)
from schemas.invoice_lines import InvoiceLineCreate, InvoiceLineUpdate, InvoiceLineOut

invoice_lines_router = APIRouter(prefix="/invoice-lines", tags=["invoice-lines"])


@invoice_lines_router.post("/", response_model=InvoiceLineOut, status_code=status.HTTP_201_CREATED,
                            dependencies=[Depends(require_section_edit('invoices'))])
def create_new_invoice_line(line_in: InvoiceLineCreate, db: Session = Depends(get_db)):
    return create_invoice_line(db, line_in)


@invoice_lines_router.post("/bulk", response_model=List[InvoiceLineOut], status_code=status.HTTP_201_CREATED,
                            dependencies=[Depends(require_section_edit('invoices'))])
def bulk_create_lines(lines_in: List[InvoiceLineCreate], db: Session = Depends(get_db)):
    return bulk_create_invoice_lines(db, lines_in)


@invoice_lines_router.get("/", response_model=List[InvoiceLineOut])
def list_invoice_lines(invoice_id: Optional[str] = None, db: Session = Depends(get_db)):
    return get_invoice_lines(db, invoice_id=invoice_id)


@invoice_lines_router.get("/{line_id}", response_model=InvoiceLineOut)
def get_invoice_line_detail(line_id: str, db: Session = Depends(get_db)):
    line = get_invoice_line(db, line_id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice line not found")
    return line


@invoice_lines_router.put("/{line_id}", response_model=InvoiceLineOut, dependencies=[Depends(require_section_edit('invoices'))])
def update_invoice_line_detail(line_id: str, line_in: InvoiceLineUpdate, db: Session = Depends(get_db)):
    line = update_invoice_line(db, line_id, line_in)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice line not found")
    return line


@invoice_lines_router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_section_edit('invoices'))])
def delete_invoice_line_detail(line_id: str, db: Session = Depends(get_db)):
    if not delete_invoice_line(db, line_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice line not found")
