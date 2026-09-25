# schemas/project_roles.py
from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional, Literal
from datetime import datetime

from schemas.projects import FixedFeePeriod


def _require_fee_amount(period, amount) -> None:
    if period is not None and not (amount is not None and amount > 0):
        raise ValueError("Enter the fixed fee amount for this role.")


class ProjectRoleBase(BaseModel):
    project_id: str
    name: str
    hourly_rate_usd: float
    # Managed Services: bill a per-period minimum for this role when enabled.
    min_hours_enabled: bool = False
    min_hours: Optional[float] = None
    min_hours_basis: Literal['week', 'month', 'period'] = 'week'
    # Managed Services: hours beyond min_hours in a month accrue instead of
    # billing that month, and are billed as one quarterly line at this rate.
    additional_hours_enabled: bool = False
    additional_hours_rate: Optional[float] = None
    # Fixed-fee role — see models/project_roles.py. None = billed hourly.
    fixed_fee_period: Optional[FixedFeePeriod] = None
    fixed_fee_amount: Optional[float] = None

    @model_validator(mode="after")
    def _fee_amount_matches_period(self):
        _require_fee_amount(self.fixed_fee_period, self.fixed_fee_amount)
        if self.fixed_fee_period is None:
            self.fixed_fee_amount = None
        return self


class ProjectRoleCreate(ProjectRoleBase):
    pass


class ProjectRoleUpdate(BaseModel):
    name: Optional[str] = None
    hourly_rate_usd: Optional[float] = None
    min_hours_enabled: Optional[bool] = None
    min_hours: Optional[float] = None
    min_hours_basis: Optional[Literal['week', 'month', 'period']] = None
    additional_hours_enabled: Optional[bool] = None
    additional_hours_rate: Optional[float] = None
    fixed_fee_period: Optional[FixedFeePeriod] = None
    fixed_fee_amount: Optional[float] = None

    @model_validator(mode="after")
    def _fee_amount_matches_period(self):
        _require_fee_amount(self.fixed_fee_period, self.fixed_fee_amount)
        return self


class ProjectRoleOut(ProjectRoleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class ProjectRoleNameOut(BaseModel):
    """Id/name only — no rate or Managed Services fields. For non-admin
    consumers that just need to label a role (e.g. History's role-name
    lookup, Staffing's assignment dropdowns) without exposing billing rates,
    which are Admin-only (see routers/project_roles.py)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
