from typing import Optional, List
from sqlalchemy.orm import Session

from models.clients import Client
from schemas.clients import ClientCreate, ClientUpdate


def create_client(db: Session, client_in: ClientCreate) -> Client:
    data = client_in.model_dump(exclude_unset=True)
    if not data.get('client_number'):
        data['client_number'] = None
    db_client = Client(**data)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client


def get_clients(db: Session, active: Optional[bool] = None) -> List[Client]:
    query = db.query(Client)
    if active is not None:
        query = query.filter(Client.is_active == active)
    return query.order_by(Client.name).all()


def get_client(db: Session, client_id: str) -> Optional[Client]:
    return db.query(Client).filter(Client.id == client_id).first()


def update_client(db: Session, client_id: str, client_in: ClientUpdate) -> Optional[Client]:
    db_client = get_client(db, client_id)
    if not db_client:
        return None
    data = client_in.model_dump(exclude_unset=True)
    if 'client_number' in data and not data['client_number']:
        data['client_number'] = None
    for field, value in data.items():
        setattr(db_client, field, value)
    db.commit()
    db.refresh(db_client)
    return db_client


def delete_client(db: Session, client_id: str) -> bool:
    db_client = get_client(db, client_id)
    if not db_client:
        return False
    db.delete(db_client)
    db.commit()
    return True
