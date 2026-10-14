from datetime import datetime
from pydantic import BaseModel


class TimeEntryDelegateCreate(BaseModel):
    delegate_user_id: str
    target_user_id: str


class TimeEntryDelegateOut(BaseModel):
    id: str
    delegate_user_id: str
    delegate_name: str
    target_user_id: str
    target_name: str
    granted_by: str
    granted_at: datetime
    revoked_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}
