from config.database import Base
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Date, Text, Integer
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class Employee(Base):

    __tablename__ = "employees"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    supervisor_id = Column(String, ForeignKey("employees.id"), nullable=True)
    title = Column(String, nullable=True)
    department = Column(String, nullable=True)
    business_unit = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Personal Information
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String, nullable=True)
    personal_email = Column(String, nullable=True)
    personal_phone = Column(String, nullable=True)
    id_number = Column(String, nullable=True)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)

    # Location
    country = Column(String, nullable=True)
    state = Column(String, nullable=True)
    city = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    street_address = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    work_mode = Column(String, nullable=True)

    # Corporate
    corporate_phone = Column(String, nullable=True)
    employee_code = Column(String, nullable=True)
    employment_type = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    employment_status = Column(String, nullable=True)
    billing_currency = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    password_hash = Column(String, nullable=True)
    must_change_password = Column(Boolean, nullable=False, default=True)

    assigned_projects = relationship("EmployeeProject", back_populates="employee")
    time_entries = relationship("TimeEntry", back_populates="employee")
    supervisor = relationship("Employee", remote_side=[id])
    skills = relationship("EmployeeSkill", back_populates="employee", cascade="all, delete-orphan")
    internal_costs = relationship("EmployeeInternalCost", back_populates="employee", cascade="all, delete-orphan")
