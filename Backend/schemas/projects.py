# schemas/projects.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date, datetime


class ProjectBase(BaseModel):
    client_id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_internal: bool = False
    project_code: Optional[str] = None
    area_category: Optional[str] = None
    business_unit: Optional[str] = None
    manager_id: Optional[str] = None
    referral_id: Optional[str] = None
    referral_type: Optional[str] = None
    referral_value: Optional[float] = None
    status: str = "active"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    owner_company: str = "IPC"
    billing_period: str = "monthly"
    billing_day_of_period: Optional[int] = 3
    custom_period_days: Optional[int] = None
    billing_anchor_date: Optional[date] = None
    is_fixed_fee: bool = False
    fixed_fee_amount: Optional[float] = None
    is_managed_services: bool = False
    managed_services_min_hours: Optional[float] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    client_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_internal: Optional[bool] = None
    project_code: Optional[str] = None
    area_category: Optional[str] = None
    business_unit: Optional[str] = None
    manager_id: Optional[str] = None
    referral_id: Optional[str] = None
    referral_type: Optional[str] = None
    referral_value: Optional[float] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    owner_company: Optional[str] = None
    billing_period: Optional[str] = None
    billing_day_of_period: Optional[int] = None
    custom_period_days: Optional[int] = None
    billing_anchor_date: Optional[date] = None
    is_fixed_fee: Optional[bool] = None
    fixed_fee_amount: Optional[float] = None
    is_managed_services: Optional[bool] = None
    managed_services_min_hours: Optional[float] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_internal: bool = False
    project_code: Optional[str] = None
    area_category: Optional[str] = None
    business_unit: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None   # computed in router, not a DB column
    referral_id: Optional[str] = None
    referral_type: Optional[str] = None
    referral_value: Optional[float] = None
    status: str = "active"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: datetime
    owner_company: str = "IPC"
    billing_period: str = "monthly"
    billing_day_of_period: Optional[int] = 3
    custom_period_days: Optional[int] = None
    billing_anchor_date: Optional[date] = None
    is_fixed_fee: bool = False
    fixed_fee_amount: Optional[float] = None
    is_managed_services: bool = False
    managed_services_min_hours: Optional[float] = None


class ProjectCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    value: str
    active: bool


class ProjectAssignmentOut(BaseModel):
    id: str
    user_id: str
    employee_name: str
    project_id: str
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    rate: Optional[float] = None
