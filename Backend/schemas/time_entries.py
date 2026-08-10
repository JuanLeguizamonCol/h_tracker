# schemas/time_entries.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import date, datetime

# A single day's entry can't exceed 24 hours. Enforced on the input schemas only
# (not on Base/Out) so reading any pre-existing out-of-range rows still works.
MAX_HOURS_PER_DAY = 24


class TimeEntryBase(BaseModel):
    user_id: str
    project_id: str
    role_id: Optional[str] = None
    date: date
    hours: float
    billable: bool = True
    notes: Optional[str] = None
    status: str = "normal"


class TimeEntryCreate(TimeEntryBase):
    hours: float = Field(..., ge=0, le=MAX_HOURS_PER_DAY)


class TimeEntryUpdate(BaseModel):
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    role_id: Optional[str] = None
    date: Optional[date] = None
    hours: Optional[float] = Field(None, ge=0, le=MAX_HOURS_PER_DAY)
    billable: Optional[bool] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class TimeEntryOut(TimeEntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
