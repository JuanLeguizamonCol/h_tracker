from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import os

from config.database import get_db
from models.employees import Employee
from utils.auth_jwt import get_current_employee
from utils.roles import require_manager_or_admin, get_role
from utils import blob_storage
from services.announcements import (
    create_announcement, list_announcements, update_announcement, delete_announcement,
)
from schemas.announcements import (
    AnnouncementCreate, AnnouncementUpdate, AnnouncementOut, AnnouncementAttachmentOut,
)

announcements_router = APIRouter(prefix="/announcements", tags=["announcements"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))


def _attachment_out(att) -> AnnouncementAttachmentOut:
    out = AnnouncementAttachmentOut.model_validate(att)
    if blob_storage.blob_enabled() and att.file_name:
        out.file_url = blob_storage.sas_url(att.file_name)
    return out


def _to_out(a: dict) -> AnnouncementOut:
    return AnnouncementOut(**{**a, "attachments": [_attachment_out(att) for att in a["attachments"]]})


@announcements_router.get("/", response_model=List[AnnouncementOut])
def list_all(
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    is_privileged = get_role(db, current_employee.id) in ("admin", "manager")
    return [_to_out(a) for a in list_announcements(db, current_employee, is_privileged)]


@announcements_router.post(
    "/",
    response_model=AnnouncementOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_manager_or_admin)],
)
def create(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if data.visibility == "locations" and not data.locations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one location")
    return _to_out(create_announcement(db, current_employee.id, data))


@announcements_router.patch(
    "/{announcement_id}",
    response_model=AnnouncementOut,
    dependencies=[Depends(require_manager_or_admin)],
)
def update(announcement_id: str, data: AnnouncementUpdate, db: Session = Depends(get_db)):
    if data.visibility == "locations" and data.locations is not None and not data.locations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one location")
    result = update_announcement(db, announcement_id, data)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    return _to_out(result)


@announcements_router.delete(
    "/{announcement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_manager_or_admin)],
)
def delete(announcement_id: str, db: Session = Depends(get_db)):
    if not delete_announcement(db, announcement_id, upload_dir=UPLOAD_DIR):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
