from config.database import Base
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class Announcement(Base):

    __tablename__ = "announcements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    # "all" = every employee sees it; "locations" = restricted to employees
    # whose Employee.location is one of the comma-separated `locations` below.
    visibility = Column(String, nullable=False, default="all")
    locations = Column(String, nullable=True)
    posted_by = Column(String, ForeignKey("employees.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    attachments = relationship(
        "AnnouncementAttachment", back_populates="announcement", cascade="all, delete-orphan"
    )
