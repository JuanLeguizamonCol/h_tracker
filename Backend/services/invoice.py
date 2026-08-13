from typing import List, Optional
from datetime import date
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.invoice import Invoice
from models.projects import Project
from models.clients import Client
from schemas.invoice import InvoiceCreate, InvoiceUpdate
from services.invoice_number_service import atomic_generate_number_for_client


def create_invoice(db: Session, invoice_in: InvoiceCreate) -> Invoice:
    data = invoice_in.model_dump(exclude_unset=True)
    invoice = Invoice(**data)

    project = db.query(Project).filter(Project.id == invoice.project_id).first()
    client = db.query(Client).filter(Client.id == project.client_id).first() if project else None
    if not client or not client.client_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This client has no Client Number set. Add one in the client's record before generating invoices.",
        )
    # Auto-generate invoice number — never user-supplied. The owning company
    # decides the prefix (Pegasus invoices lead with "P").
    owner_company = invoice.owner_company or (project.owner_company if project else None) or "IPC"
    invoice.invoice_number = atomic_generate_number_for_client(
        db, client.id, client.client_number, owner_company
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def get_invoices(
    db: Session,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Invoice]:
    query = db.query(Invoice)
    if project_id is not None:
        query = query.filter(Invoice.project_id == project_id)
    if status is not None:
        query = query.filter(Invoice.status == status)
    return query.order_by(Invoice.created_at.desc()).all()


def get_invoice(db: Session, invoice_id: str) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.id == invoice_id).first()


def update_invoice(db: Session, invoice_id: str, invoice_in: InvoiceUpdate) -> Optional[Invoice]:
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        return None
    data = invoice_in.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(invoice, field, value)
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_invoice(db: Session, invoice_id: str) -> bool:
    invoice = get_invoice(db, invoice_id)
    if not invoice:
        return False
    db.delete(invoice)
    db.commit()
    return True
