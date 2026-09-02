import logging
from typing import Optional, List
from sqlalchemy.orm import Session

from models.clients import Client
from schemas.clients import ClientCreate, ClientUpdate

logger = logging.getLogger(__name__)


def create_client(db: Session, client_in: ClientCreate) -> Client:
    data = client_in.model_dump(exclude_unset=True)
    if not data.get('client_number'):
        data['client_number'] = None
    db_client = Client(**data)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)

    try:
        from services.client_notifications import notify_new_client_created
        notify_new_client_created(db_client)
    except Exception:
        logger.exception("Failed to send new-client notification for client %s", db_client.id)

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


def preview_next_client_number(db: Session) -> str:
    """Next Client Number, one past the highest one already in use — plain
    consecutive integer, not reserved (purely a suggestion for the "Autogenerate"
    button; the actual uniqueness check still happens on save). Non-numeric
    client_number values (legacy/free-typed ones) are ignored when finding the
    highest — they aren't part of this consecutive sequence."""
    values = [
        v for (v,) in db.query(Client.client_number).filter(Client.client_number.isnot(None)).all()
    ]
    max_n = 0
    for v in values:
        if v and v.strip().isdigit():
            max_n = max(max_n, int(v.strip()))
    return str(max_n + 1)
