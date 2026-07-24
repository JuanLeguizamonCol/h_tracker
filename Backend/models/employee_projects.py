from config.database import Base
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class EmployeeProject(Base):

    __tablename__ = "employee_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    role_id = Column(String, ForeignKey("project_roles.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    assigned_by = Column(String, nullable=True)

    employee = relationship("Employee", back_populates="assigned_projects")
    project = relationship("Project", back_populates="assigned_projects")
    role = relationship("ProjectRole")
