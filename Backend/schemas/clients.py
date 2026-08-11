# schemas/clients.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, date


class ClientBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
    manager_phone: Optional[str] = None
    # Extended billing fields
    client_code: Optional[str] = None
    client_number: Optional[str] = None
    salutation: Optional[str] = None
    first_name: Optional[str] = None
    middle_initial: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    main_phone: Optional[str] = None
    work_phone: Optional[str] = None
    mobile: Optional[str] = None
    main_email: Optional[str] = None
    street_address_1: Optional[str] = None
    street_address_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    rep: Optional[str] = None
    payment_terms: Optional[str] = None
    team_member: Optional[str] = None
    notes: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    tax_id: Optional[str] = None
    referral_source: Optional[str] = None
    referred_by: Optional[str] = None
    acquisition_date: Optional[date] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    billing_rate: Optional[float] = None
    billing_currency: Optional[str] = None
    billing_email: Optional[str] = None
    # FreshSales CRM fields
    freshsales_id: Optional[int] = None
    crm_synced_at: Optional[datetime] = None
    crm_created_at: Optional[datetime] = None
    crm_updated_at: Optional[datetime] = None
    crm_source: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
    manager_phone: Optional[str] = None
    client_code: Optional[str] = None
    client_number: Optional[str] = None
    salutation: Optional[str] = None
    first_name: Optional[str] = None
    middle_initial: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    main_phone: Optional[str] = None
    work_phone: Optional[str] = None
    mobile: Optional[str] = None
    main_email: Optional[str] = None
    street_address_1: Optional[str] = None
    street_address_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    rep: Optional[str] = None
    payment_terms: Optional[str] = None
    team_member: Optional[str] = None
    notes: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    tax_id: Optional[str] = None
    referral_source: Optional[str] = None
    referred_by: Optional[str] = None
    acquisition_date: Optional[date] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    billing_rate: Optional[float] = None
    billing_currency: Optional[str] = None
    billing_email: Optional[str] = None
    freshsales_id: Optional[int] = None
    crm_synced_at: Optional[datetime] = None
    crm_created_at: Optional[datetime] = None
    crm_updated_at: Optional[datetime] = None
    crm_source: Optional[str] = None


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


# ── FreshSales schemas ────────────────────────────────────────────────────────

class FreshSalesAccountPreview(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None


class FreshSalesAccountsResponse(BaseModel):
    accounts: List[FreshSalesAccountPreview]
    total: int
    error: Optional[str] = None


class FreshSalesTestResponse(BaseModel):
    success: bool
    user: Optional[str] = None
    domain: Optional[str] = None
    error: Optional[str] = None


class FreshSalesImportRequest(BaseModel):
    account_ids: List[int]


class FreshSalesImportResponse(BaseModel):
    imported: int
    updated: int
    skipped: int
    errors: List[dict]


class FreshSalesSyncResponse(BaseModel):
    success: bool
    updated: Optional[bool] = None
    client_id: Optional[str] = None
    error: Optional[str] = None
