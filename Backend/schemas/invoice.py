# schemas/invoice.py
from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional, List
from datetime import date, datetime


class InvoiceBase(BaseModel):
    project_id: str
    status: str = "draft"
    notes: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    owner_company: str = 'IPC'


class InvoiceUpdate(BaseModel):
    project_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    total: Optional[float] = None
    cap_amount: Optional[float] = None
    fixed_fee_amount: Optional[float] = None
    managed_services_min_hours: Optional[float] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    signatory_employee_id: Optional[str] = None
    owner_company: Optional[str] = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: str
    subtotal: float
    discount: float
    total: float
    cap_amount: Optional[float] = None
    fixed_fee_amount: Optional[float] = None
    managed_services_min_hours: Optional[float] = None
    notes: Optional[str] = None
    invoice_number: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    signatory_employee_id: Optional[str] = None
    owner_company: Optional[str] = 'IPC'
    bill_to_contact: Optional[str] = None
    bill_to_title: Optional[str] = None
    bill_to_company: Optional[str] = None
    bill_to_address: Optional[str] = None
    bill_to_city_state_zip: Optional[str] = None
    bank_name: Optional[str] = None
    bank_aba: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Edit-data composite response ──

class InvoiceEditClient(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    manager_name: Optional[str] = None
    job_title: Optional[str] = None
    street_address_1: Optional[str] = None
    street_address_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None


class InvoiceEditProject(BaseModel):
    id: str
    name: str
    client_id: str
    owner_company: Optional[str] = 'IPC'
    is_fixed_fee: bool = False
    is_managed_services: bool = False
    managed_services_min_hours: Optional[float] = None


class InvoiceEditLine(BaseModel):
    id: str
    user_id: str
    employee_name: str
    title: Optional[str] = None
    role: Optional[str] = None
    role_id: Optional[str] = None
    project_role_rate: Optional[float] = None
    hours: float
    hourly_rate: float
    discount_type: Optional[str] = None
    discount_value: float = 0
    amount: float
    original_hours: Optional[float] = None


class InvoiceEditExpense(BaseModel):
    id: str
    date: date
    professional: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    category: str
    amount_usd: float
    payment_source: Optional[str] = None
    receipt_attached: bool = False
    notes: Optional[str] = None


class InvoiceEditTimeDetail(BaseModel):
    week_start: date
    user_id: str
    employee_name: str
    title: Optional[str] = None
    hourly_rate: float
    hours: float
    subtotal: float
    discount: float
    total: float


class InvoiceManagedServicesRole(BaseModel):
    role_id: str
    role_name: str
    hourly_rate: float
    min_hours: Optional[float] = None
    min_hours_basis: str = "period"
    minimum_total: float = 0
    package_amount: float = 0
    worked_hours: float = 0
    billed_hours: float = 0
    billed_amount: float = 0
    hours_over_min: float = 0
    additional_rate: Optional[float] = None
    additional_amount: float = 0


class InvoiceManagedServicesFee(BaseModel):
    label: str
    quantity: float
    unit_price: float
    total: float


class InvoiceManagedServices(BaseModel):
    roles: List[InvoiceManagedServicesRole] = []
    package_total: float = 0
    billed_total: float = 0
    additional_total: float = 0
    additional_fees: List[InvoiceManagedServicesFee] = []


class InvoiceEditDataOut(BaseModel):
    invoice: InvoiceOut
    client: Optional[InvoiceEditClient] = None
    project: Optional[InvoiceEditProject] = None
    lines: List[InvoiceEditLine] = []
    expenses: List[InvoiceEditExpense] = []
    time_detail: List[InvoiceEditTimeDetail] = []
    managed_services: Optional[InvoiceManagedServices] = None


# ── PATCH payload ──

class InvoiceLinePatch(BaseModel):
    id: str
    hours: Optional[float] = None
    rate_snapshot: Optional[float] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None


class InvoiceExpensePatch(BaseModel):
    id: Optional[str] = None  # null = create new
    invoice_id: Optional[str] = None
    date: Optional[date] = None
    professional: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    amount_usd: Optional[float] = None
    payment_source: Optional[str] = None
    receipt_attached: Optional[bool] = None
    notes: Optional[str] = None


class OnHoldEntryPatch(BaseModel):
    line_id: str
    employee_name: str
    original_hours: float
    billed_hours: float
    rate: float
    has_on_hold: bool  # True → upsert; False → delete
    reason: Optional[str] = None


class InvoicePatch(BaseModel):
    status: Optional[str] = None
    # Admin-only — see patch_invoice. Manually renumbering an already-issued
    # invoice is a deliberate correction, not part of the normal auto flow.
    invoice_number: Optional[str] = None
    cap_amount: Optional[float] = None
    fixed_fee_amount: Optional[float] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    notes: Optional[str] = None
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    signatory_employee_id: Optional[str] = None
    owner_company: Optional[str] = None
    # Per-invoice "Bill To" overrides — empty string clears back to the
    # client's own field, None leaves it untouched.
    bill_to_contact: Optional[str] = None
    bill_to_title: Optional[str] = None
    bill_to_company: Optional[str] = None
    bill_to_address: Optional[str] = None
    bill_to_city_state_zip: Optional[str] = None
    bank_name: Optional[str] = None
    bank_aba: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    lines: Optional[List[InvoiceLinePatch]] = None
    expenses: Optional[List[InvoiceExpensePatch]] = None
    on_hold_entries: Optional[List[OnHoldEntryPatch]] = None


class ManagedServicesRoleMinimum(BaseModel):
    role_id: str
    min_hours: Optional[float] = None  # None = no minimum for this role
    basis: Literal["week", "month", "period"] = "week"


class ManagedServicesMinimumsUpdate(BaseModel):
    roles: List[ManagedServicesRoleMinimum]
