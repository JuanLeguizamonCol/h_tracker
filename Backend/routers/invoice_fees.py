from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from utils.section_access import require_section_edit
from services.invoice_fees import (
    create_invoice_fee, get_invoice_fees, get_invoice_fee, update_invoice_fee, delete_invoice_fee,
)
from schemas.invoice_fees import InvoiceFeeCreate, InvoiceFeeUpdate, InvoiceFeeOut

invoice_fees_router = APIRouter(prefix="/invoice-fees", tags=["invoice-fees"])


@invoice_fees_router.post("/", response_model=InvoiceFeeOut, status_code=status.HTTP_201_CREATED,
                           dependencies=[Depends(require_section_edit('invoices'))])
def create_new_fee(fee_in: InvoiceFeeCreate, db: Session = Depends(get_db)):
    return create_invoice_fee(db, fee_in)


@invoice_fees_router.get("/", response_model=List[InvoiceFeeOut])
def list_fees(invoice_id: Optional[str] = None, db: Session = Depends(get_db)):
    return get_invoice_fees(db, invoice_id=invoice_id)


@invoice_fees_router.get("/{fee_id}", response_model=InvoiceFeeOut)
def get_fee_detail(fee_id: str, db: Session = Depends(get_db)):
    fee = get_invoice_fee(db, fee_id)
    if not fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee not found")
    return fee


@invoice_fees_router.put("/{fee_id}", response_model=InvoiceFeeOut, dependencies=[Depends(require_section_edit('invoices'))])
def update_fee_detail(fee_id: str, fee_in: InvoiceFeeUpdate, db: Session = Depends(get_db)):
    fee = update_invoice_fee(db, fee_id, fee_in)
    if not fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee not found")
    return fee


@invoice_fees_router.delete("/{fee_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_section_edit('invoices'))])
def delete_fee_detail(fee_id: str, db: Session = Depends(get_db)):
    if not delete_invoice_fee(db, fee_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee not found")
