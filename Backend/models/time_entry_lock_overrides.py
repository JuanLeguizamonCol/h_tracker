from config.database import Base
from sqlalchemy import Column, String, DateTime, ForeignKey
from datetime import datetime, timezone
import uuid


class TimeEntryLockOverride(Base):
    """A temporary, admin-granted exception to the monthly time-entry close
    (see utils/time_entry_lock.py). While `now()` is before `expires_at` and
    `revoked_at` is NULL, `employee_id` may log/edit/delete time entries in an
    already-closed month — everyone else still can't, no exceptions. Granted
    for a fixed 2-hour window from `granted_at`; cannot be extended, only
    re-granted after it expires."""

    __tablename__ = "time_entry_lock_overrides"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by = Column(String, ForeignKey("employees.id"), nullable=False)
    granted_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
