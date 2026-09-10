from config.database import Base
from sqlalchemy import Column, String, Date, DateTime, Numeric, ForeignKey, Text
from datetime import datetime, timezone
import uuid

PTO_CATEGORIES = ("vacation", "sick", "holiday", "other")
PTO_STATUSES = ("pending", "approved", "rejected", "cancelled")


class PtoRequest(Base):

    __tablename__ = "pto_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("employees.id"), nullable=False, index=True)
    category = Column(String, nullable=False)  # vacation | sick | holiday | other
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    hours = Column(Numeric(6, 2), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    # Who is expected to approve this request — defaults to the requester's
    # supervisor at creation time (models/employees.py::supervisor_id), but any
    # Admin/Manager can still review it (see routers/pto_requests.py::_can_manage).
    approver_id = Column(String, ForeignKey("employees.id"), nullable=True, index=True)
    reviewed_by = Column(String, ForeignKey("employees.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
