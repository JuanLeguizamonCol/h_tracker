from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config.database import get_db
from services.clients import create_client, get_clients, get_client, update_client, delete_client
from schemas.clients import ClientCreate, ClientUpdate, ClientOut

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


@clients_router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client_detail(client_id: str, db: Session = Depends(get_db)):
    if not delete_client(db, client_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
