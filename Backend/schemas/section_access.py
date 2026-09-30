# schemas/section_access.py
from pydantic import BaseModel
from typing import List, Optional


class SectionAccessOut(BaseModel):
    section: str
    label: str
    can_view: bool
    can_edit: bool
    # True when this field is a per-employee override rather than the role default.
    view_overridden: bool
    edit_overridden: bool


class SectionAccessPatch(BaseModel):
    section: str
    can_view: Optional[bool] = None
    can_edit: Optional[bool] = None


class SectionAccessUpdate(BaseModel):
    # Replaces every override this employee has. An entry with both fields
    # None (or a section simply left out) means "use the role default."
    overrides: List[SectionAccessPatch] = []
