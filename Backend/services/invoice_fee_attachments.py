import os
from typing import List, Optional
from sqlalchemy.orm import Session

from models.invoice_fee_attachments import InvoiceFeeAttachment
from schemas.invoice_fee_attachments import InvoiceFeeAttachmentCreate
from utils import blob_storage


def create_invoice_fee_attachment(db: Session, attachment_in: InvoiceFeeAttachmentCreate) -> InvoiceFeeAttachment:
    data = attachment_in.model_dump(exclude_unset=True)
    db_att = InvoiceFeeAttachment(**data)
    db.add(db_att)
    db.commit()
    db.refresh(db_att)
    return db_att


def get_invoice_fee_attachments(db: Session, fee_id: Optional[str] = None) -> List[InvoiceFeeAttachment]:
    query = db.query(InvoiceFeeAttachment)
    if fee_id is not None:
        query = query.filter(InvoiceFeeAttachment.fee_id == fee_id)
    return query.all()


def get_invoice_fee_attachment(db: Session, attachment_id: str) -> Optional[InvoiceFeeAttachment]:
    return db.query(InvoiceFeeAttachment).filter(InvoiceFeeAttachment.id == attachment_id).first()


def delete_invoice_fee_attachment(db: Session, attachment_id: str, upload_dir: str = "") -> bool:
    db_att = get_invoice_fee_attachment(db, attachment_id)
    if not db_att:
        return False
    # Remove the underlying file: Blob Storage when enabled, else local disk.
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
