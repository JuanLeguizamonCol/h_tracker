from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from models.skill_catalog import SkillCatalog
from models.employee_skills import EmployeeSkill
from models.employees import Employee
from schemas.skills import SkillCatalogCreate, EmployeeSkillCreate, EmployeeSkillUpdate


def list_skill_catalog(db: Session, search: Optional[str] = None) -> List[SkillCatalog]:
    q = db.query(SkillCatalog)
    if search:
        q = q.filter(SkillCatalog.name.ilike(f"%{search}%"))
    return q.order_by(SkillCatalog.category, SkillCatalog.name).all()


def get_or_create_skill_catalog(db: Session, name: str, category: str) -> SkillCatalog:
    skill = db.query(SkillCatalog).filter(SkillCatalog.name.ilike(name)).first()
    if skill:
        return skill
    skill = SkillCatalog(id=str(uuid.uuid4()), name=name, category=category)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def get_employee_skills(db: Session, employee_id: str) -> List[EmployeeSkill]:
    return (
        db.query(EmployeeSkill)
        .filter(EmployeeSkill.employee_id == employee_id)
        .order_by(EmployeeSkill.proficiency_level.desc(), EmployeeSkill.skill_name)
        .all()
    )


def create_employee_skill(db: Session, employee_id: str, skill_in: EmployeeSkillCreate) -> EmployeeSkill:
    skill_catalog_id = skill_in.skill_catalog_id
    if not skill_catalog_id:
        catalog = get_or_create_skill_catalog(db, skill_in.skill_name, skill_in.category)
        skill_catalog_id = catalog.id

    data = skill_in.model_dump(exclude={'skill_catalog_id'})
    db_skill = EmployeeSkill(
        id=str(uuid.uuid4()),
        employee_id=employee_id,
        skill_catalog_id=skill_catalog_id,
        **data,
    )
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill


def create_employee_skill_from_catalog(
    db: Session, employee_id: str, skill_catalog_id: str, skill_in: EmployeeSkillCreate
) -> Optional[EmployeeSkill]:
    """Self-service skill add (employees, via /profile/skills): must reference
    an existing catalog entry — name/category are taken from that entry, not
    from client input, so an employee can't sneak in a typo'd or duplicate
    skill name. Returns None if the catalog entry doesn't exist."""
    catalog = db.query(SkillCatalog).filter(SkillCatalog.id == skill_catalog_id).first()
    if not catalog:
        return None
    data = skill_in.model_dump(exclude={"skill_catalog_id", "skill_name", "category"})
    db_skill = EmployeeSkill(
        id=str(uuid.uuid4()),
        employee_id=employee_id,
        skill_catalog_id=catalog.id,
        skill_name=catalog.name,
        category=catalog.category,
        **data,
    )
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill


def update_employee_skill(db: Session, skill_id: str, skill_in: EmployeeSkillUpdate) -> Optional[EmployeeSkill]:
    db_skill = db.query(EmployeeSkill).filter(EmployeeSkill.id == skill_id).first()
    if not db_skill:
        return None
    for field, value in skill_in.model_dump(exclude_unset=True).items():
        setattr(db_skill, field, value)
    db.commit()
    db.refresh(db_skill)
    return db_skill


def search_employee_skills(
    db: Session,
    q: Optional[str] = None,
    category: Optional[str] = None,
    min_proficiency: Optional[int] = None,
) -> List[dict]:
    """Find employees/managers who have a matching skill — for resource
    staffing lookups (Reports panel), not tied to time entries."""
    query = (
        db.query(EmployeeSkill, Employee)
        .join(Employee, EmployeeSkill.employee_id == Employee.id)
        .filter(Employee.is_active == True)  # noqa: E712
    )
    if q:
        query = query.filter(EmployeeSkill.skill_name.ilike(f"%{q}%"))
    if category:
        query = query.filter(EmployeeSkill.category == category)
    if min_proficiency is not None:
        query = query.filter(EmployeeSkill.proficiency_level >= min_proficiency)

    rows = query.order_by(EmployeeSkill.proficiency_level.desc(), Employee.name).all()
    return [
        {
            "employee_id": emp.id,
            "employee_name": emp.name,
            "title": emp.title,
            "department": emp.department,
            "location": emp.location,
            "skill_id": skill.id,
            "skill_name": skill.skill_name,
            "category": skill.category,
            "proficiency_level": skill.proficiency_level,
            "years_experience": float(skill.years_experience) if skill.years_experience is not None else None,
            "certified": skill.certified,
        }
        for skill, emp in rows
    ]


def delete_employee_skill(db: Session, skill_id: str) -> bool:
    db_skill = db.query(EmployeeSkill).filter(EmployeeSkill.id == skill_id).first()
    if not db_skill:
        return False
    db.delete(db_skill)
    db.commit()
    return True
