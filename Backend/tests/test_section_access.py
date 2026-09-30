"""Per-employee section-access overrides — utils/section_access.py.

Uses a throwaway in-memory sqlite DB rather than mocking, since the real
logic here is the SQL round-trip (override row present/absent, NULL fields
falling back to the role default).
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.employees import Employee
from models.user_roles import UserRole
from models.employee_section_access import EmployeeSectionAccess
from utils.section_access import get_section_access, SECTIONS


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_employee(db, role="employee"):
    emp = Employee(id="e1", user_id="e1", name="Test", email="t@x.com")
    db.add(emp)
    db.add(UserRole(id="r1", user_id="e1", role=role))
    db.commit()
    return emp


def test_role_default_with_no_override_row(db):
    _make_employee(db, role="employee")
    assert get_section_access(db, "e1", "invoices") == (False, False)
    assert get_section_access(db, "e1", "timesheet") == (True, True)


def test_override_wins_over_role_default(db):
    _make_employee(db, role="employee")
    db.add(EmployeeSectionAccess(id="o1", employee_id="e1", section="invoices", can_view=True, can_edit=None))
    db.commit()
    # can_view overridden to True; can_edit is NULL -> falls back to the employee default (False)
    assert get_section_access(db, "e1", "invoices") == (True, False)


def test_override_can_also_revoke_a_default_grant(db):
    _make_employee(db, role="manager")
    db.add(EmployeeSectionAccess(id="o1", employee_id="e1", section="employees", can_view=False, can_edit=False))
    db.commit()
    assert get_section_access(db, "e1", "employees") == (False, False)


def test_unknown_section_rejected(db):
    _make_employee(db)
    with pytest.raises(ValueError):
        get_section_access(db, "e1", "not-a-real-section")


def test_every_section_has_a_label():
    assert all(isinstance(label, str) and label for label in SECTIONS.values())
