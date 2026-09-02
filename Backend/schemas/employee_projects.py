# schemas/employee_projects.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, date


class EmployeeProjectBase(BaseModel):
    user_id: str
    project_id: str
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None
    # Optional window scoping just THIS assignment (e.g. "staffed on this
    # project for Q1 only") — never written to the project itself.
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class EmployeeProjectCreate(EmployeeProjectBase):
    # Separate, explicit opt-in: when set, written straight back to the
    # project's own start_date/end_date (single source of truth for the
    # project's dates) — see services/employee_projects.py. Distinct from
    # start_date/end_date above, which only affect this assignment.
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None


class EmployeeProjectUpdate(BaseModel):
    role_id: Optional[str] = None
    allocation_percentage: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
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
    start_date: Optional[date] = None
    end_date: Optional[date] = None
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
    their allocation %, their own optional assignment window, and the
    project's own (separate) time window."""
    id: str
    user_id: str
    employee_name: str
    project_id: str
    project_name: str
    project_is_active: bool
    project_is_internal: bool
    client_id: str
    client_name: str
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    allocation_percentage: Optional[float] = None
    # This assignment's own window — never affects the project.
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    # The project's own dates, for context / the opt-in "edit project dates" action.
    project_start_date: Optional[date] = None
    project_end_date: Optional[date] = None
    assigned_at: datetime
