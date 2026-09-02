import os
from typing import List, Optional
from sqlalchemy.orm import Session

from models.announcements import Announcement
from models.employees import Employee
from schemas.announcements import AnnouncementCreate, AnnouncementUpdate
from utils import blob_storage
import uuid

VALID_VISIBILITY = ("all", "locations", "roles", "pegasus_contractors")


def _is_pegasus_contractor(employee: Employee) -> bool:
    """Fixed audience — not user-selectable like locations/roles, so it needs
    no extra column: an employee is a 'Pegasus contractor' when their profile
    has business_unit=Pegasus and employment_type=Contractor."""
    return (
        (employee.business_unit or "").strip().lower() == "pegasus"
        and (employee.employment_type or "").strip().lower() == "contractor"
    )


def _list_to_str(values: Optional[List[str]]) -> Optional[str]:
    if not values:
        return None
    cleaned = [v.strip() for v in values if v and v.strip()]
    return ",".join(cleaned) if cleaned else None


def _str_to_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [v for v in value.split(",") if v]


def _serialize(db: Session, a: Announcement) -> dict:
    poster = db.query(Employee).filter(Employee.id == a.posted_by).first()
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "visibility": a.visibility,
        "locations": _str_to_list(a.locations),
        "roles": _str_to_list(a.roles),
        "posted_by": a.posted_by,
        "posted_by_name": poster.name if poster else "Unknown",
        "created_at": a.created_at,
        "attachments": a.attachments,
    }


def create_announcement(db: Session, posted_by: str, data: AnnouncementCreate) -> dict:
    visibility = data.visibility if data.visibility in VALID_VISIBILITY else "all"
    db_a = Announcement(
        id=str(uuid.uuid4()),
        title=data.title,
        body=data.body,
        visibility=visibility,
        locations=_list_to_str(data.locations) if visibility == "locations" else None,
        roles=_list_to_str(data.roles) if visibility == "roles" else None,
        posted_by=posted_by,
    )
    db.add(db_a)
    db.commit()
    db.refresh(db_a)
    return _serialize(db, db_a)


def list_announcements(db: Session, viewer: Employee, viewer_role: str, is_privileged: bool) -> List[dict]:
    """Admin/manager see every announcement (to manage the board). Employees
    only see 'all' announcements plus 'locations'/'roles'/'pegasus_contractors'
    ones matching their own Employee.location / assigned role / contractor
    status — enforced here, not just hidden in the UI."""
    rows = db.query(Announcement).order_by(Announcement.created_at.desc()).all()
    if is_privileged:
        return [_serialize(db, a) for a in rows]

    location = (viewer.location or "").strip()
    is_pegasus_contractor = _is_pegasus_contractor(viewer)
    visible = []
    for a in rows:
        if a.visibility == "all":
            visible.append(a)
        elif a.visibility == "locations" and location and location in _str_to_list(a.locations):
            visible.append(a)
        elif a.visibility == "roles" and viewer_role in _str_to_list(a.roles):
            visible.append(a)
        elif a.visibility == "pegasus_contractors" and is_pegasus_contractor:
            visible.append(a)
    return [_serialize(db, a) for a in visible]


def get_announcement(db: Session, announcement_id: str) -> Optional[Announcement]:
    return db.query(Announcement).filter(Announcement.id == announcement_id).first()


def update_announcement(db: Session, announcement_id: str, data: AnnouncementUpdate) -> Optional[dict]:
    db_a = get_announcement(db, announcement_id)
    if not db_a:
        return None
    updates = data.model_dump(exclude_unset=True)
    locations = updates.pop("locations", None)
    roles = updates.pop("roles", None)
    for field, value in updates.items():
        setattr(db_a, field, value)
    if db_a.visibility == "locations":
        if locations is not None:
            db_a.locations = _list_to_str(locations)
        db_a.roles = None
    elif db_a.visibility == "roles":
        if roles is not None:
            db_a.roles = _list_to_str(roles)
        db_a.locations = None
    else:
        db_a.locations = None
        db_a.roles = None
    db.commit()
    db.refresh(db_a)
    return _serialize(db, db_a)


def delete_announcement(db: Session, announcement_id: str, upload_dir: str = "") -> bool:
    db_a = get_announcement(db, announcement_id)
    if not db_a:
        return False
    for att in db_a.attachments:
        if att.file_name:
            if blob_storage.blob_enabled():
                blob_storage.delete_blob(att.file_name)
            elif upload_dir:
                file_path = os.path.join(upload_dir, att.file_name)
                if os.path.exists(file_path):
                    os.remove(file_path)
    db.delete(db_a)
    db.commit()
    return True
