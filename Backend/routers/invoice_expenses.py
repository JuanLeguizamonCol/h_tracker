from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from utils.section_access import require_section_edit
from services.invoice_expenses import (
    create_expense, get_expenses, get_expense, update_expense, delete_expense
)
from schemas.invoice_expenses import InvoiceExpenseCreate, InvoiceExpenseUpdate, InvoiceExpenseOut

invoice_expenses_router = APIRouter(prefix="/invoice-expenses", tags=["invoice-expenses"])


@invoice_expenses_router.post("/", response_model=InvoiceExpenseOut, status_code=status.HTTP_201_CREATED,
                               dependencies=[Depends(require_section_edit('invoices'))])
def create_invoice_expense(expense_in: InvoiceExpenseCreate, db: Session = Depends(get_db)):
    return create_expense(db, expense_in)


@invoice_expenses_router.get("/", response_model=List[InvoiceExpenseOut])
def list_invoice_expenses(invoice_id: Optional[str] = None, db: Session = Depends(get_db)):
    if not invoice_id:
        return []
    return get_expenses(db, invoice_id)


@invoice_expenses_router.get("/{expense_id}", response_model=InvoiceExpenseOut)
def get_invoice_expense(expense_id: str, db: Session = Depends(get_db)):
    expense = get_expense(db, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@invoice_expenses_router.put("/{expense_id}", response_model=InvoiceExpenseOut, dependencies=[Depends(require_section_edit('invoices'))])
def update_invoice_expense(expense_id: str, expense_in: InvoiceExpenseUpdate, db: Session = Depends(get_db)):
    expense = update_expense(db, expense_id, expense_in)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@invoice_expenses_router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_section_edit('invoices'))])
def delete_invoice_expense(expense_id: str, db: Session = Depends(get_db)):
    if not delete_expense(db, expense_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
