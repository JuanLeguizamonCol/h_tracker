# schemas/employee_projects.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, date


class EmployeeProjectBase(BaseModel):
    user_id: str
    project_id: str
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None


class EmployeeProjectCreate(EmployeeProjectBase):
    # When set, written straight back to the project's own start_date/end_date
    # (single source of truth) — see services/employee_projects.py.
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None


class EmployeeProjectUpdate(BaseModel):
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None


class EmployeeProjectOut(EmployeeProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    assigned_at: datetime
    assigned_by: Optional[str] = None


class EmployeeProjectWithDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    project_id: str
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None
    assigned_at: datetime
    assigned_by: Optional[str] = None
    project_name: str
    client_id: str
    client_name: str


class BulkAssignItem(BaseModel):
    project_id: str
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None


class BulkAssignRequest(BaseModel):
    assignments: List[BulkAssignItem]


class StaffingAssignmentOut(BaseModel):
    """One row of the Staffing panel: a person, staffed on a project, with
    their allocation % and the project's own time window."""
    id: str
    user_id: str
    employee_name: str
    project_id: str
    project_name: str
    project_is_active: bool
    client_id: str
    client_name: str
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    allocation_percentage: Optional[float] = None
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None
    assigned_at: datetime
