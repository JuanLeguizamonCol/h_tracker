# schemas/invoice_lines.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class InvoiceLineBase(BaseModel):
    invoice_id: str
    user_id: Optional[str] = None
    employee_name: str
    role_name: Optional[str] = None
    role_id: Optional[str] = None
    hours: float
    rate_snapshot: float
    amount: float


class InvoiceLineCreate(InvoiceLineBase):
    pass


class InvoiceLineUpdate(BaseModel):
    invoice_id: Optional[str] = None
    user_id: Optional[str] = None
    employee_name: Optional[str] = None
    role_name: Optional[str] = None
    role_id: Optional[str] = None
    hours: Optional[float] = None
    rate_snapshot: Optional[float] = None
    amount: Optional[float] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None


class InvoiceLineOut(InvoiceLineBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    discount_type: Optional[str] = None
    discount_value: float = 0
    created_at: datetime
