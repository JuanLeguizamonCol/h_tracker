import os
from typing import Optional
from sqlalchemy.orm import Session

from models.announcement_attachments import AnnouncementAttachment
from schemas.announcements import AnnouncementAttachmentCreate
from utils import blob_storage


def create_announcement_attachment(db: Session, attachment_in: AnnouncementAttachmentCreate) -> AnnouncementAttachment:
    data = attachment_in.model_dump(exclude_unset=True)
    db_att = AnnouncementAttachment(**data)
    db.add(db_att)
    db.commit()
    db.refresh(db_att)
    return db_att


def get_announcement_attachment(db: Session, attachment_id: str) -> Optional[AnnouncementAttachment]:
    return db.query(AnnouncementAttachment).filter(AnnouncementAttachment.id == attachment_id).first()


def delete_announcement_attachment(db: Session, attachment_id: str, upload_dir: str = "") -> bool:
    db_att = get_announcement_attachment(db, attachment_id)
    if not db_att:
        return False
    if db_att.file_name:
        if blob_storage.blob_enabled():
            blob_storage.delete_blob(db_att.file_name)
        elif upload_dir:
            file_path = os.path.join(upload_dir, db_att.file_name)
            if os.path.exists(file_path):
                os.remove(file_path)
    db.delete(db_att)
    db.commit()
    return True
