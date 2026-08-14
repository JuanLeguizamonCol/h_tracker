# schemas/project_roles.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ProjectRoleBase(BaseModel):
    project_id: str
    name: str
    hourly_rate_usd: float
    # Managed Services: bill a per-period minimum for this role when enabled.
    min_hours_enabled: bool = False
    min_hours: Optional[float] = None
    # Managed Services: hours beyond min_hours in a month accrue instead of
    # billing that month, and are billed as one quarterly line at this rate.
    additional_hours_enabled: bool = False
    additional_hours_rate: Optional[float] = None


class ProjectRoleCreate(ProjectRoleBase):
    pass


class ProjectRoleUpdate(BaseModel):
    name: Optional[str] = None
    hourly_rate_usd: Optional[float] = None
    min_hours_enabled: Optional[bool] = None
    min_hours: Optional[float] = None
    additional_hours_enabled: Optional[bool] = None
    additional_hours_rate: Optional[float] = None


class ProjectRoleOut(ProjectRoleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
