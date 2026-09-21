from config.database import Base
from sqlalchemy import Column, String, Numeric, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class ProjectRole(Base):

    __tablename__ = "project_roles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    hourly_rate_usd = Column(Numeric(10, 2), nullable=False)
    # Managed Services only: when enabled, this role bills at least `min_hours`
    # per `min_hours_basis` (max of actual vs. minimum in each bucket). Toggled per role â€” roles left
    # off are billed flat on actual hours.
    min_hours_enabled = Column(Boolean, nullable=False, default=False)
    min_hours = Column(Numeric(10, 2), nullable=True)
    # What `min_hours` is measured against: 'week' (each Mon–Sun week), 'month'
    # (each calendar month) or 'period' (the whole invoice period).
    min_hours_basis = Column(String(10), nullable=False, default='week')
    # Managed Services only: when enabled, hours logged in a month beyond
    # `min_hours` (the floor) accrue as "additional hours" for the role.
    # They are NOT billed monthly â€” they accumulate across the quarter and are
    # billed as a single line on the invoice for the quarter's 3rd month, at
    # `additional_hours_rate` per hour.
    additional_hours_enabled = Column(Boolean, nullable=False, default=False)
    additional_hours_rate = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="roles")
