"""Monthly time-entry close and its admin-grantable per-employee override —
utils/time_entry_lock.py.
"""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.employees import Employee
from models.time_entry_lock_overrides import TimeEntryLockOverride
from utils.time_entry_lock import has_active_lock_override, is_period_locked, lock_date_for


def test_lock_date_is_the_6th_of_the_following_month():
    assert lock_date_for(date(2026, 9, 15)) == date(2026, 10, 6)
    assert lock_date_for(date(2026, 12, 20)) == date(2027, 1, 6)


def test_is_period_locked_at_the_boundary():
    assert not is_period_locked(date(2026, 9, 1), today=date(2026, 10, 5))
    assert is_period_locked(date(2026, 9, 1), today=date(2026, 10, 6))


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_employee(db, emp_id="e1"):
    emp = Employee(id=emp_id, user_id=emp_id, name="Test", email=f"{emp_id}@x.com")
    db.add(emp)
    db.commit()
    return emp


def test_no_override_row_means_locked(db):
    _make_employee(db)
    assert has_active_lock_override(db, "e1") is False


def test_active_override_within_window(db):
    _make_employee(db)
    now = datetime.now(timezone.utc)
    db.add(TimeEntryLockOverride(
        id="o1", employee_id="e1", granted_by="admin1",
        granted_at=now, expires_at=now + timedelta(hours=2),
    ))
    db.commit()
    assert has_active_lock_override(db, "e1") is True


def test_expired_override_does_not_count(db):
    _make_employee(db)
    now = datetime.now(timezone.utc)
    db.add(TimeEntryLockOverride(
        id="o1", employee_id="e1", granted_by="admin1",
        granted_at=now - timedelta(hours=3), expires_at=now - timedelta(hours=1),
    ))
    db.commit()
    assert has_active_lock_override(db, "e1") is False


def test_revoked_override_does_not_count_even_if_not_yet_expired(db):
    _make_employee(db)
    now = datetime.now(timezone.utc)
    db.add(TimeEntryLockOverride(
        id="o1", employee_id="e1", granted_by="admin1",
        granted_at=now, expires_at=now + timedelta(hours=2), revoked_at=now,
    ))
    db.commit()
    assert has_active_lock_override(db, "e1") is False


def test_override_does_not_leak_to_another_employee(db):
    _make_employee(db, "e1")
    _make_employee(db, "e2")
    now = datetime.now(timezone.utc)
    db.add(TimeEntryLockOverride(
        id="o1", employee_id="e1", granted_by="admin1",
        granted_at=now, expires_at=now + timedelta(hours=2),
    ))
    db.commit()
    assert has_active_lock_override(db, "e1") is True
    assert has_active_lock_override(db, "e2") is False
