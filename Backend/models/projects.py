from config.database import Base
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Numeric, Date, Integer
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class Project(Base):

    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = Column(String, ForeignKey("clients.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_internal = Column(Boolean, nullable=False, default=False)
    manager_id = Column(String, ForeignKey("employees.id"), nullable=True)
    project_code = Column(String, unique=True, nullable=True)
    area_category = Column(String, nullable=True)
    business_unit = Column(String, nullable=True)
    referral_id = Column(String, ForeignKey("employees.id"), nullable=True)
    referral_type = Column(String, nullable=True)
    referral_value = Column(Numeric(10, 2), nullable=True)
    status = Column(String, nullable=False, default="active")
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    # Company + billing configuration
    owner_company = Column(String(10), nullable=False, default='IPC')
    billing_period = Column(String(20), nullable=False, default='monthly')
    billing_day_of_period = Column(Integer, nullable=True, default=3)
    custom_period_days = Column(Integer, nullable=True)
    billing_anchor_date = Column(Date, nullable=True)

    client = relationship("Client", back_populates="projects")
    roles = relationship("ProjectRole", back_populates="project", cascade="all, delete-orphan")
    assigned_projects = relationship("EmployeeProject", back_populates="project")
    time_entries = relationship("TimeEntry", back_populates="project")
    invoices = relationship("Invoice", back_populates="project")
    required_skills = relationship("ProjectRequiredSkill", back_populates="project", cascade="all, delete-orphan")
