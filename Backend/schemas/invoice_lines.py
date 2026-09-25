# schemas/invoice_lines.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

from schemas.projects import FixedFeePeriod


class InvoiceLineBase(BaseModel):
    invoice_id: str
    user_id: Optional[str] = None
    employee_name: str
    role_name: Optional[str] = None
    role_id: Optional[str] = None
    hours: float
    rate_snapshot: float
    amount: float
    fee_period: Optional[FixedFeePeriod] = None
    fee_unit_amount: Optional[float] = None


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
    fee_period: Optional[FixedFeePeriod] = None
    fee_unit_amount: Optional[float] = None


class InvoiceLineOut(InvoiceLineBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    discount_type: Optional[str] = None
    discount_value: float = 0
    created_at: datetime
