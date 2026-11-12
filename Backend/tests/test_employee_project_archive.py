"""Staffing "Remove" archives an assignment instead of deleting it, so the
role/allocation/window history stays in the database — see
services/employee_projects.py::delete_employee_project.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.employees import Employee
from models.clients import Client
from models.projects import Project
from models.employee_projects import EmployeeProject
import services.employee_projects as svc


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed(db):
    db.add(Client(id="cli", name="Acme"))
    db.add(Project(id="prj", client_id="cli", name="Website"))
    db.add(Employee(id="emp", user_id="emp", name="Ana", email="ana@x.com"))
    ep = EmployeeProject(id="ep1", user_id="emp", project_id="prj", allocation_percentage=50)
    db.add(ep)
    db.commit()
    return ep


def test_default_delete_archives_the_row_instead_of_removing_it(db):
    _seed(db)
    assert svc.delete_employee_project(db, "ep1") is True
    # Still in the database...
    row = db.query(EmployeeProject).filter(EmployeeProject.id == "ep1").first()
    assert row is not None
    assert row.is_active is False
    # ...but excluded from the default (current) listings.
    assert svc.get_employee_projects(db, user_id="emp") == []
    assert svc.get_all_assignments_with_details(db) == []
    # Visible again when history is explicitly asked for.
    assert len(svc.get_employee_projects(db, user_id="emp", include_archived=True)) == 1
    archived = svc.get_all_assignments_with_details(db, include_archived=True)
    assert len(archived) == 1 and archived[0]["is_active"] is False


def test_permanent_delete_actually_removes_the_row(db):
    _seed(db)
    assert svc.delete_employee_project(db, "ep1", permanent=True) is True
    assert db.query(EmployeeProject).filter(EmployeeProject.id == "ep1").first() is None
    assert svc.get_all_assignments_with_details(db, include_archived=True) == []


def test_delete_of_a_missing_row_returns_false(db):
    _seed(db)
    assert svc.delete_employee_project(db, "nope") is False
    assert svc.delete_employee_project(db, "nope", permanent=True) is False
