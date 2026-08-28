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
    # Internal projects only: who gets auto-assigned (see
    # routers/employees.py::_auto_assign_internal_projects). Null/blank = every
    # active employee; a value (matching Employee.location) restricts
    # auto-assignment to employees at that location. Ignored for client
    # projects — those are staffed explicitly, never auto-assigned.
    location = Column(String, nullable=True)
    manager_id = Column(String, ForeignKey("employees.id"), nullable=True)
    # The project owner is the ONLY employee allowed to invoice this project
    # (owners are Admins). Distinct from manager_id (operational manager, may be
    # any Manager or Admin).
    owner_id = Column(String, ForeignKey("employees.id"), nullable=True)
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
    is_fixed_fee = Column(Boolean, nullable=False, default=False)
    fixed_fee_amount = Column(Numeric(10, 2), nullable=True)
    # Managed Services: bills a minimum hours package (at the project's
    # blended employee rate) — hours below the minimum still bill the
    # minimum; hours above it bill the actual hours worked.
    is_managed_services = Column(Boolean, nullable=False, default=False)
    managed_services_min_hours = Column(Numeric(10, 2), nullable=True)

    client = relationship("Client", back_populates="projects")
    roles = relationship("ProjectRole", back_populates="project", cascade="all, delete-orphan")
    assigned_projects = relationship("EmployeeProject", back_populates="project")
    time_entries = relationship("TimeEntry", back_populates="project")
    invoices = relationship("Invoice", back_populates="project")
    required_skills = relationship("ProjectRequiredSkill", back_populates="project", cascade="all, delete-orphan")
