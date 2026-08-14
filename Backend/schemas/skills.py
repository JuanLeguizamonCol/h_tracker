from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class SkillCatalogBase(BaseModel):
    name: str
    category: str


class SkillCatalogCreate(SkillCatalogBase):
    pass


class SkillCatalogOut(SkillCatalogBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class EmployeeSkillBase(BaseModel):
    skill_catalog_id: Optional[str] = None
    skill_name: str
    category: str
    proficiency_level: int = 1  # 1=Beginner, 2=Intermediate, 3=Advanced, 4=Expert
    years_experience: Optional[float] = None
    certified: bool = False
    certificate_name: Optional[str] = None
    cert_expiry_date: Optional[date] = None
    notes: Optional[str] = None


class EmployeeSkillCreate(EmployeeSkillBase):
    pass


class EmployeeSkillUpdate(BaseModel):
    skill_name: Optional[str] = None
    category: Optional[str] = None
    proficiency_level: Optional[int] = None
    years_experience: Optional[float] = None
    certified: Optional[bool] = None
    certificate_name: Optional[str] = None
    cert_expiry_date: Optional[date] = None
    notes: Optional[str] = None


class EmployeeSkillOut(EmployeeSkillBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    employee_id: str
    created_at: datetime


class SkillSearchResultOut(BaseModel):
    """One employee-skill match, flattened with the employee's basic profile
    info — used by the Reports skills search for resource staffing."""
    employee_id: str
    employee_name: str
    title: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    skill_id: str
    skill_name: str
    category: str
    proficiency_level: int
    years_experience: Optional[float] = None
    certified: bool
