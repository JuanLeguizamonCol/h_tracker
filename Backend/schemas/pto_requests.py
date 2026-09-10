# schemas/pto_requests.py
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime

PTO_CATEGORIES = ["vacation", "sick", "holiday", "other"]


class PtoRequestCreate(BaseModel):
    category: str
    start_date: date
    end_date: date
    hours: float
    notes: Optional[str] = None
    # Who should approve this — defaults to the requester's supervisor when omitted
    # (see services/pto_requests.py::create_pto_request). Any Admin/Manager can
    # still review the request regardless of who is set here.
    approver_id: Optional[str] = None


class PtoRequestReview(BaseModel):
    status: str  # "approved" | "rejected"
    review_notes: Optional[str] = None


class PtoRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    employee_name: str
    category: str
    start_date: date
    end_date: date
    hours: float
    notes: Optional[str] = None
    status: str
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime
