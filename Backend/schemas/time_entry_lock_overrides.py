from datetime import datetime
from pydantic import BaseModel


class TimeEntryLockOverrideCreate(BaseModel):
    employee_id: str


class TimeEntryLockOverrideOut(BaseModel):
    id: str
    employee_id: str
    granted_by: str
    granted_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}
