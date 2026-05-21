# schemas/employees.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class EmployeeBase(BaseModel):
    name: str
    email: str
    is_active: bool = True
    supervisor_id: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    business_unit: Optional[str] = None
    # Personal
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    personal_email: Optional[str] = None
    personal_phone: Optional[str] = None
    id_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    # Location
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    street_address: Optional[str] = None
    zip_code: Optional[str] = None
    work_mode: Optional[str] = None
    # Corporate
    corporate_phone: Optional[str] = None
    employee_code: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    employment_status: Optional[str] = None
    billing_currency: Optional[str] = None
    notes: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    user_id: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    supervisor_id: Optional[str] = None
    user_id: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    business_unit: Optional[str] = None
    # Personal
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    personal_email: Optional[str] = None
    personal_phone: Optional[str] = None
    id_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    # Location
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    street_address: Optional[str] = None
    zip_code: Optional[str] = None
    work_mode: Optional[str] = None
    # Corporate
    corporate_phone: Optional[str] = None
    employee_code: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    employment_status: Optional[str] = None
    billing_currency: Optional[str] = None
    notes: Optional[str] = None


class EmployeeOut(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    must_change_password: bool = True
