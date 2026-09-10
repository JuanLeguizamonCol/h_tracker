import os
from typing import List, Optional
from sqlalchemy.orm import Session

from models.pto_request_attachments import PtoRequestAttachment
from models.employees import Employee
from schemas.pto_request_attachments import PtoRequestAttachmentCreate
from utils import blob_storage


def _to_out_dict(att: PtoRequestAttachment, name_by_id: dict) -> dict:
    return {
        "id": att.id,
        "pto_request_id": att.pto_request_id,
        "file_name": att.file_name,
        "file_url": att.file_url,
        "file_size": att.file_size,
        "uploaded_by": att.uploaded_by,
        "uploaded_by_name": name_by_id.get(att.uploaded_by) if att.uploaded_by else None,
        "created_at": att.created_at,
    }


def create_pto_request_attachment(db: Session, attachment_in: PtoRequestAttachmentCreate) -> dict:
    data = attachment_in.model_dump(exclude_unset=True)
    db_att = PtoRequestAttachment(**data)
    db.add(db_att)
    db.commit()
    db.refresh(db_att)
    name_by_id = {}
    if db_att.uploaded_by:
        name = db.query(Employee.name).filter(Employee.id == db_att.uploaded_by).scalar()
        if name:
            name_by_id[db_att.uploaded_by] = name
    return _to_out_dict(db_att, name_by_id)


def get_pto_request_attachments(db: Session, pto_request_id: Optional[str] = None) -> List[dict]:
    query = db.query(PtoRequestAttachment)
    if pto_request_id is not None:
        query = query.filter(PtoRequestAttachment.pto_request_id == pto_request_id)
    attachments = query.order_by(PtoRequestAttachment.created_at.desc()).all()
    ids = {a.uploaded_by for a in attachments if a.uploaded_by}
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(ids)).all()) if ids else {}
    return [_to_out_dict(a, name_by_id) for a in attachments]


def get_pto_request_attachment(db: Session, attachment_id: str) -> Optional[PtoRequestAttachment]:
    return db.query(PtoRequestAttachment).filter(PtoRequestAttachment.id == attachment_id).first()


def delete_pto_request_attachment(db: Session, attachment_id: str, upload_dir: str = "") -> bool:
    db_att = get_pto_request_attachment(db, attachment_id)
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
