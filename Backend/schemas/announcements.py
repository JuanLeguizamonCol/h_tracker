# schemas/announcements.py
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime


class AnnouncementAttachmentCreate(BaseModel):
    announcement_id: str
    file_name: str
    file_url: str
    file_size: Optional[int] = None


class AnnouncementAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    announcement_id: str
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    created_at: datetime


class AnnouncementCreate(BaseModel):
    title: str
    body: Optional[str] = None
    visibility: str = "all"  # "all" | "locations" | "roles"
    locations: List[str] = []
    roles: List[str] = []


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    visibility: Optional[str] = None
    locations: Optional[List[str]] = None
    roles: Optional[List[str]] = None


class AnnouncementOut(BaseModel):
    id: str
    title: str
    body: Optional[str] = None
    visibility: str
    locations: List[str]
    roles: List[str]
    posted_by: str
    posted_by_name: str
    created_at: datetime
    attachments: List[AnnouncementAttachmentOut] = []
