# schemas/invoice_expenses.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime
# See schemas/invoice.py's DateValue comment: Pydantic v2 resolves
# `Optional[date]` against the class's OWN namespace first, which for a
# field literally named `date` with a default already holds that field's
# default (None) by the time the annotation is evaluated — so it silently
# accepts nothing but null. Only Optional/defaulted fields named `date` need
# this alias; the required `date: date` fields above are unaffected (no
# default in the class namespace to shadow the import).
from datetime import date as DateValue

EXPENSE_CATEGORIES = ["Airfare", "Hotel", "Parking / Transportation", "Meals", "Other"]


class InvoiceExpenseBase(BaseModel):
    invoice_id: str
    date: date
    professional: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    category: str
    amount_usd: float
    payment_source: Optional[str] = None
    receipt_attached: bool = False
    notes: Optional[str] = None


class InvoiceExpenseCreate(InvoiceExpenseBase):
    pass


class InvoiceExpenseUpdate(BaseModel):
    date: Optional[DateValue] = None
    professional: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    amount_usd: Optional[float] = None
    payment_source: Optional[str] = None
    receipt_attached: Optional[bool] = None
    notes: Optional[str] = None


class InvoiceExpenseOut(InvoiceExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
