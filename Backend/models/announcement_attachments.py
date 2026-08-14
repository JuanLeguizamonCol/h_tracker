from config.database import Base
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class AnnouncementAttachment(Base):

    __tablename__ = "announcement_attachments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    announcement_id = Column(String, ForeignKey("announcements.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    announcement = relationship("Announcement", back_populates="attachments")
