import os
from typing import List, Optional
from sqlalchemy.orm import Session

from models.announcements import Announcement
from models.employees import Employee
from schemas.announcements import AnnouncementCreate, AnnouncementUpdate
from utils import blob_storage
import uuid

VALID_VISIBILITY = ("all", "locations")


def _locations_to_str(locations: Optional[List[str]]) -> Optional[str]:
    if not locations:
        return None
    cleaned = [l.strip() for l in locations if l and l.strip()]
    return ",".join(cleaned) if cleaned else None


def _locations_to_list(locations: Optional[str]) -> List[str]:
    if not locations:
        return []
    return [l for l in locations.split(",") if l]


def _serialize(db: Session, a: Announcement) -> dict:
    poster = db.query(Employee).filter(Employee.id == a.posted_by).first()
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "visibility": a.visibility,
        "locations": _locations_to_list(a.locations),
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
        locations=_locations_to_str(data.locations) if visibility == "locations" else None,
        posted_by=posted_by,
    )
    db.add(db_a)
    db.commit()
    db.refresh(db_a)
    return _serialize(db, db_a)


def list_announcements(db: Session, viewer: Employee, is_privileged: bool) -> List[dict]:
    """Admin/manager see every announcement (to manage the board). Employees
    only see 'all' announcements plus 'locations' ones matching their own
    Employee.location — enforced here, not just hidden in the UI."""
    rows = db.query(Announcement).order_by(Announcement.created_at.desc()).all()
    if is_privileged:
        return [_serialize(db, a) for a in rows]

    location = (viewer.location or "").strip()
    visible = []
    for a in rows:
        if a.visibility == "all":
            visible.append(a)
        elif a.visibility == "locations" and location and location in _locations_to_list(a.locations):
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
    for field, value in updates.items():
        setattr(db_a, field, value)
    if db_a.visibility == "locations":
        if locations is not None:
            db_a.locations = _locations_to_str(locations)
    else:
        db_a.locations = None
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
