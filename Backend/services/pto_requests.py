from typing import List, Optional
from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from models.pto_requests import PtoRequest
from models.employees import Employee
from schemas.pto_requests import PtoRequestCreate


def _to_out_dict(req: PtoRequest, name_by_id: dict) -> dict:
    return {
        "id": req.id,
        "user_id": req.user_id,
        "employee_name": name_by_id.get(req.user_id, "Unknown"),
        "category": req.category,
        "start_date": req.start_date,
        "end_date": req.end_date,
        "hours": float(req.hours),
        "notes": req.notes,
        "status": req.status,
        "approver_id": req.approver_id,
        "approver_name": name_by_id.get(req.approver_id) if req.approver_id else None,
        "reviewed_by": req.reviewed_by,
        "reviewer_name": name_by_id.get(req.reviewed_by) if req.reviewed_by else None,
        "reviewed_at": req.reviewed_at,
        "review_notes": req.review_notes,
        "created_at": req.created_at,
    }


def create_pto_request(db: Session, user_id: str, data: PtoRequestCreate) -> dict:
    approver_id = data.approver_id
    if not approver_id:
        approver_id = db.query(Employee.supervisor_id).filter(Employee.id == user_id).scalar()

    req = PtoRequest(
        id=str(uuid.uuid4()),
        user_id=user_id,
        category=data.category,
        start_date=data.start_date,
        end_date=data.end_date,
        hours=data.hours,
        notes=data.notes,
        status="pending",
        approver_id=approver_id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    ids = {user_id} | ({approver_id} if approver_id else set())
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(ids)).all())
    return _to_out_dict(req, name_by_id)


def get_pto_requests(db: Session, user_id: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
    q = db.query(PtoRequest)
    if user_id:
        q = q.filter(PtoRequest.user_id == user_id)
    if status:
        q = q.filter(PtoRequest.status == status)
    requests = q.order_by(PtoRequest.created_at.desc()).all()

    ids = (
        {r.user_id for r in requests}
        | {r.reviewed_by for r in requests if r.reviewed_by}
        | {r.approver_id for r in requests if r.approver_id}
    )
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(ids)).all()) if ids else {}
    return [_to_out_dict(r, name_by_id) for r in requests]


def get_pto_request(db: Session, request_id: str) -> Optional[PtoRequest]:
    return db.query(PtoRequest).filter(PtoRequest.id == request_id).first()


def review_pto_request(db: Session, request_id: str, reviewer_id: str, status: str, review_notes: Optional[str]) -> Optional[dict]:
    req = get_pto_request(db, request_id)
    if not req:
        return None
    req.status = status
    req.reviewed_by = reviewer_id
    req.reviewed_at = datetime.now(timezone.utc)
    req.review_notes = review_notes
    db.commit()
    db.refresh(req)
    ids = {req.user_id, reviewer_id} | ({req.approver_id} if req.approver_id else set())
    name_by_id = dict(db.query(Employee.id, Employee.name).filter(Employee.id.in_(ids)).all())
    return _to_out_dict(req, name_by_id)


def delete_pto_request(db: Session, request_id: str) -> bool:
    req = get_pto_request(db, request_id)
    if not req:
        return False
    db.delete(req)
    db.commit()
    return True
