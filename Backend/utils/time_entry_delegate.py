"""Time-entry delegates — see models/time_entry_delegates.py."""
from sqlalchemy.orm import Session

from models.time_entry_delegates import TimeEntryDelegate


def is_active_delegate_for(db: Session, delegate_user_id: str, target_user_id: str) -> bool:
    return (
        db.query(TimeEntryDelegate)
        .filter(
            TimeEntryDelegate.delegate_user_id == delegate_user_id,
            TimeEntryDelegate.target_user_id == target_user_id,
            TimeEntryDelegate.revoked_at.is_(None),
        )
        .first()
        is not None
    )


def get_delegate_target_ids(db: Session, delegate_user_id: str) -> set[str]:
    """Every employee_id `delegate_user_id` may currently also log time for,
    in addition to themselves."""
    rows = (
        db.query(TimeEntryDelegate.target_user_id)
        .filter(
            TimeEntryDelegate.delegate_user_id == delegate_user_id,
            TimeEntryDelegate.revoked_at.is_(None),
        )
        .all()
    )
    return {r[0] for r in rows}
