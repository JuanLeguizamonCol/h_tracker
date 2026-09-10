# schemas/pto_request_attachments.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class PtoRequestAttachmentBase(BaseModel):
    pto_request_id: str
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    uploaded_by: Optional[str] = None


class PtoRequestAttachmentCreate(PtoRequestAttachmentBase):
    pass


class PtoRequestAttachmentOut(PtoRequestAttachmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    uploaded_by_name: Optional[str] = None
    created_at: datetime
