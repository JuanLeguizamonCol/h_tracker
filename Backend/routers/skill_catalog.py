from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from config.database import get_db
from services.skills import list_skill_catalog, get_or_create_skill_catalog
from schemas.skills import SkillCatalogCreate, SkillCatalogOut
from utils.roles import require_manager_or_admin

skill_catalog_router = APIRouter(prefix="/skill-catalog", tags=["skill-catalog"])


@skill_catalog_router.get("/", response_model=List[SkillCatalogOut])
def list_skills(search: Optional[str] = None, db: Session = Depends(get_db)):
    return list_skill_catalog(db, search=search)


@skill_catalog_router.post(
    "/",
    response_model=SkillCatalogOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_manager_or_admin)],
)
def create_skill(skill_in: SkillCatalogCreate, db: Session = Depends(get_db)):
    # Only managers/admins can add new catalog entries — employees pick from
    # the existing list, to avoid typo'd/duplicate skill names piling up.
    return get_or_create_skill_catalog(db, skill_in.name, skill_in.category)
