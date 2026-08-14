import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from config.database import get_db
from services.announcement_attachments import (
    create_announcement_attachment, delete_announcement_attachment,
)
from schemas.announcements import AnnouncementAttachmentCreate, AnnouncementAttachmentOut
from utils import blob_storage
from utils.roles import require_manager_or_admin

announcement_attachments_router = APIRouter(prefix="/announcement-attachments", tags=["announcement-attachments"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))


def _serialize(att) -> AnnouncementAttachmentOut:
    out = AnnouncementAttachmentOut.model_validate(att)
    if blob_storage.blob_enabled() and att.file_name:
        out.file_url = blob_storage.sas_url(att.file_name)
    return out


@announcement_attachments_router.post(
    "/upload",
    response_model=AnnouncementAttachmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_manager_or_admin)],
)
async def upload_attachment(
    announcement_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_name = f"{uuid.uuid4()}{ext}"
    contents = await file.read()

    if blob_storage.blob_enabled():
        blob_storage.upload_blob(unique_name, contents, content_type=file.content_type)
        file_url = blob_storage.sas_url(unique_name)
    else:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        file_path = os.path.join(UPLOAD_DIR, unique_name)
        with open(file_path, "wb") as f:
            f.write(contents)
        file_url = f"/uploads/{unique_name}"

    attachment_in = AnnouncementAttachmentCreate(
        announcement_id=announcement_id,
        file_name=unique_name,
        file_url=file_url,
        file_size=len(contents),
    )
    return _serialize(create_announcement_attachment(db, attachment_in))


@announcement_attachments_router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_manager_or_admin)],
)
def delete_attachment(attachment_id: str, db: Session = Depends(get_db)):
    if not delete_announcement_attachment(db, attachment_id, upload_dir=UPLOAD_DIR):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
