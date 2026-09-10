import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from services.pto_requests import get_pto_request
from services.pto_request_attachments import (
    create_pto_request_attachment, get_pto_request_attachments,
    get_pto_request_attachment, delete_pto_request_attachment,
)
from schemas.pto_request_attachments import PtoRequestAttachmentCreate, PtoRequestAttachmentOut
from utils import blob_storage
from utils.auth_jwt import get_current_employee
from utils.roles import get_role

pto_request_attachments_router = APIRouter(prefix="/pto-request-attachments", tags=["pto-request-attachments"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))


def _can_manage(db: Session, employee: Employee) -> bool:
    return get_role(db, employee.id) in ("admin", "manager")


def _require_request_access(db: Session, pto_request_id: str, current_employee: Employee):
    """Owner of the PTO request, or any Admin/Manager, may see/attach its documents."""
    req = get_pto_request(db, pto_request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PTO request not found")
    if req.user_id != current_employee.id and not _can_manage(db, current_employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this PTO request.")
    return req


@pto_request_attachments_router.post("/upload", response_model=PtoRequestAttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_pto_request_attachment(
    pto_request_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    _require_request_access(db, pto_request_id, current_employee)

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

    attachment_in = PtoRequestAttachmentCreate(
        pto_request_id=pto_request_id,
        file_name=unique_name,
        file_url=file_url,
        file_size=len(contents),
        uploaded_by=current_employee.id,
    )
    return create_pto_request_attachment(db, attachment_in)


@pto_request_attachments_router.get("/", response_model=List[PtoRequestAttachmentOut])
def list_pto_request_attachments(
    pto_request_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if pto_request_id:
        _require_request_access(db, pto_request_id, current_employee)
    elif not _can_manage(db, current_employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="pto_request_id is required.")
    return get_pto_request_attachments(db, pto_request_id=pto_request_id)


@pto_request_attachments_router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pto_request_attachment_detail(
    attachment_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    att = get_pto_request_attachment(db, attachment_id)
    if not att:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    req = get_pto_request(db, att.pto_request_id)
    is_owner = bool(req) and req.user_id == current_employee.id
    can_manage = _can_manage(db, current_employee)
    if not (can_manage or (is_owner and req.status == "pending")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove documents from your own pending requests.",
        )
    delete_pto_request_attachment(db, attachment_id, upload_dir=UPLOAD_DIR)
