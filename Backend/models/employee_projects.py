from config.database import Base
from sqlalchemy import Column, String, ForeignKey, DateTime, Date, Numeric, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class EmployeeProject(Base):

    __tablename__ = "employee_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    role_id = Column(String, ForeignKey("project_roles.id"), nullable=True)
    # % of the employee's time this assignment represents (e.g. 50 when split
    # across two projects). Set from the Staffing panel — purely informational
    # for planning, not enforced against logged hours.
    allocation_percentage = Column(Numeric(5, 2), nullable=True)
    # Optional window scoping THIS assignment only (e.g. "on this project just
    # for Q1") — independent of the project's own start_date/end_date. Null
    # means the assignment isn't time-boxed and simply lasts as long as the
    # person stays staffed on the project.
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    assigned_by = Column(String, nullable=True)
    # "Remove" from Staffing sets this False instead of deleting the row, so
    # the role/allocation/window history stays in the database (excluded
    # from Staffing and every assignment listing, same as an inactive
    # Client/Project) — a separate "Delete permanently" action still hard-
    # deletes, for an assignment added by mistake.
    is_active = Column(Boolean, nullable=False, default=True)

    employee = relationship("Employee", back_populates="assigned_projects")
    project = relationship("Project", back_populates="assigned_projects")
    role = relationship("ProjectRole")
