from config.database import Base
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from datetime import datetime, timezone
import uuid


class PtoRequestAttachment(Base):

    __tablename__ = "pto_request_attachments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    pto_request_id = Column(String, ForeignKey("pto_requests.id"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    uploaded_by = Column(String, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
