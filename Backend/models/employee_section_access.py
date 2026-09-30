from config.database import Base
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from datetime import datetime, timezone
import uuid


class EmployeeSectionAccess(Base):
    """Per-employee override of a section's View/Edit access — when a row
    exists for (employee, section), its non-NULL fields replace what that
    employee's role would otherwise grant for that section; a NULL field (or
    no row at all) falls back to the role default. See
    utils/section_access.py, which is the only place that should ever read
    this table — every route checks access through its
    require_section_view/require_section_edit dependencies, never this model
    directly."""

    __tablename__ = "employee_section_access"
    __table_args__ = (UniqueConstraint("employee_id", "section", name="uq_employee_section_access"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    section = Column(String, nullable=False)
    can_view = Column(Boolean, nullable=True)
    can_edit = Column(Boolean, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String, ForeignKey("employees.id"), nullable=True)
