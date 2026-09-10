from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from models.employees import Employee
from models.pto_requests import PTO_CATEGORIES
from schemas.pto_requests import PtoRequestCreate, PtoRequestReview, PtoRequestOut
from services.pto_requests import (
    create_pto_request, get_pto_requests, get_pto_request,
    review_pto_request, delete_pto_request,
)
from utils.auth_jwt import get_current_employee
from utils.roles import get_role

pto_requests_router = APIRouter(prefix="/pto-requests", tags=["pto-requests"])


def _can_manage(db: Session, employee: Employee) -> bool:
    return get_role(db, employee.id) in ("admin", "manager")


@pto_requests_router.post("/", response_model=PtoRequestOut, status_code=status.HTTP_201_CREATED)
def create_new_pto_request(
    data: PtoRequestCreate,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if data.category not in PTO_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"category must be one of {PTO_CATEGORIES}")
    if data.end_date < data.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")
    if data.hours <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hours must be greater than 0.")
    return create_pto_request(db, current_employee.id, data)


@pto_requests_router.get("/", response_model=List[PtoRequestOut])
def list_pto_requests(
    user_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    # Regular employees only ever see their own requests, regardless of the
    # user_id param — Admin/Manager can see anyone's (e.g. an approvals queue).
    if not _can_manage(db, current_employee):
        user_id = current_employee.id
    return get_pto_requests(db, user_id=user_id, status=status_filter)


@pto_requests_router.patch("/{request_id}/review", response_model=PtoRequestOut)
def review_request(
    request_id: str,
    body: PtoRequestReview,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    if not _can_manage(db, current_employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or manager access required.")
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='status must be "approved" or "rejected"')
    req = get_pto_request(db, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PTO request not found")
    result = review_pto_request(db, request_id, current_employee.id, body.status, body.review_notes)
    return result


@pto_requests_router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_pto_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_employee: Employee = Depends(get_current_employee),
):
    req = get_pto_request(db, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PTO request not found")
    is_owner = req.user_id == current_employee.id
    can_manage = _can_manage(db, current_employee)
    if not (can_manage or (is_owner and req.status == "pending")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own pending requests.",
        )
    delete_pto_request(db, request_id)
