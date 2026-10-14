from config.database import Base
from sqlalchemy import Column, String, DateTime, ForeignKey
from datetime import datetime, timezone
import uuid


class TimeEntryDelegate(Base):
    """An admin-granted, open-ended permission for `delegate_user_id` to also
    log/edit/delete time entries for `target_user_id` (in addition to their
    own) — e.g. an assistant who enters hours for someone who doesn't use the
    tracker directly. Scoped to exactly that one pairing: it does not grant
    manager-style access to anyone else's hours. Active while `revoked_at` is
    NULL; persists until explicitly revoked (no expiry, unlike
    TimeEntryLockOverride)."""

    __tablename__ = "time_entry_delegates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    delegate_user_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    target_user_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by = Column(String, ForeignKey("employees.id"), nullable=False)
    granted_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    revoked_at = Column(DateTime, nullable=True)
