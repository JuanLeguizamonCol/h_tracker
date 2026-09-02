from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config.database import get_db
from services.clients import (
    create_client, get_clients, get_client, update_client, delete_client,
    preview_next_client_number,
)
from schemas.clients import ClientCreate, ClientUpdate, ClientOut
from utils.auth_jwt import require_admin

clients_router = APIRouter(prefix="/clients", tags=["clients"])


@clients_router.post("/", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_new_client(client_in: ClientCreate, db: Session = Depends(get_db)):
    try:
        return create_client(db, client_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client Number is already in use by another client.")


@clients_router.get("/", response_model=List[ClientOut])
def list_clients(active: Optional[bool] = None, db: Session = Depends(get_db)):
    return get_clients(db, active=active)


# Must come before /{client_id} — otherwise "preview-number" is parsed as a client_id.
@clients_router.get("/preview-number")
def preview_client_number(db: Session = Depends(get_db)):
    """Suggest the next consecutive Client Number, without reserving it."""
    return {"client_number": preview_next_client_number(db)}


@clients_router.get("/{client_id}", response_model=ClientOut)
def get_client_detail(client_id: str, db: Session = Depends(get_db)):
    client = get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@clients_router.put("/{client_id}", response_model=ClientOut)
def update_client_detail(client_id: str, client_in: ClientUpdate, db: Session = Depends(get_db)):
    try:
        client = update_client(db, client_id, client_in)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client Number is already in use by another client.")
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@clients_router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT,
                       dependencies=[Depends(require_admin)])
def delete_client_detail(client_id: str, db: Session = Depends(get_db)):
    try:
        deleted = delete_client(db, client_id)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete this client because it still has projects. Delete its projects first.",
        )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
