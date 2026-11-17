"""Removing a person's line from an invoice — the inverse of add_employee_to_
invoice (Backend/routers/invoice.py). Calls the router functions directly
(same pattern as test_performance_reviews.py), bypassing FastAPI's dependency
injection since they're plain functions underneath.
"""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.database import Base
import models  # noqa: F401 - registers every model on Base.metadata
from models.clients import Client
from models.employees import Employee
from models.employee_projects import EmployeeProject
from models.invoice import Invoice
from models.invoice_lines import InvoiceLine
from models.invoice_line_weeks import InvoiceLineWeek
from models.invoice_time_entries import InvoiceTimeEntry
from models.projects import Project
from models.project_roles import ProjectRole
from models.time_entries import TimeEntry
from routers.invoice import add_employee_to_invoice, remove_invoice_line
from schemas.invoice import AddEmployeeToInvoiceBody


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    admin = Employee(id="admin", user_id="admin", name="Jane Admin", email="jane@x.com")
    worker = Employee(id="emp1", user_id="emp1", name="Alex Worker", email="alex@x.com")
    session.add_all([admin, worker, Client(id="cli", name="Acme")])
    session.flush()
    session.add(Project(id="prj", client_id="cli", name="Website", owner_id="admin"))
    session.flush()
    session.add(ProjectRole(id="role1", project_id="prj", name="Dev", hourly_rate_usd=100))
    session.add(EmployeeProject(id="ep1", user_id="emp1", project_id="prj", role_id="role1"))
    session.add_all([
        TimeEntry(id="t1", user_id="emp1", project_id="prj", date=date(2026, 1, 5), hours=10, billable=True, status="normal"),
        TimeEntry(id="t2", user_id="emp1", project_id="prj", date=date(2026, 1, 12), hours=8, billable=True, status="normal"),
    ])
    session.add(Invoice(id="inv1", project_id="prj", status="draft"))
    session.commit()
    yield session
    session.close()


def _add_emp1(db):
    return add_employee_to_invoice(
        "inv1", AddEmployeeToInvoiceBody(user_id="emp1"), db=db, current_employee=db.get(Employee, "admin"),
    )


def test_removing_a_line_unlinks_its_hours_and_recalculates_totals(db):
    data = _add_emp1(db)
    assert data.invoice.subtotal == 1800.0 and data.invoice.total == 1800.0
    line = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == "inv1", InvoiceLine.user_id == "emp1").first()
    assert line is not None
    assert db.query(InvoiceTimeEntry).filter(InvoiceTimeEntry.invoice_id == "inv1").count() == 2

    data = remove_invoice_line("inv1", line.id, db=db, current_employee=db.get(Employee, "admin"))

    assert data.invoice.subtotal == 0.0 and data.invoice.total == 0.0
    assert db.query(InvoiceLine).filter(InvoiceLine.id == line.id).first() is None
    # The hours are unlinked, not deleted — available for a future invoice.
    assert db.query(InvoiceTimeEntry).filter(InvoiceTimeEntry.invoice_id == "inv1").count() == 0
    assert db.query(TimeEntry).filter(TimeEntry.id.in_(["t1", "t2"])).count() == 2


def test_removing_a_line_also_drops_its_saved_time_detail_weeks(db):
    _add_emp1(db)
    line = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == "inv1", InvoiceLine.user_id == "emp1").first()
    db.add(InvoiceLineWeek(id="w1", invoice_line_id=line.id, week_start=date(2026, 1, 5), hours=10))
    db.commit()

    remove_invoice_line("inv1", line.id, db=db, current_employee=db.get(Employee, "admin"))

    assert db.query(InvoiceLineWeek).filter(InvoiceLineWeek.invoice_line_id == line.id).count() == 0


def test_cannot_remove_a_line_from_a_paid_invoice(db):
    _add_emp1(db)
    line = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == "inv1").first()
    invoice = db.get(Invoice, "inv1")
    invoice.status = "paid"
    db.commit()

    with pytest.raises(HTTPException) as exc:
        remove_invoice_line("inv1", line.id, db=db, current_employee=db.get(Employee, "admin"))
    assert exc.value.status_code == 400


def test_removing_an_unknown_line_404s(db):
    with pytest.raises(HTTPException) as exc:
        remove_invoice_line("inv1", "nope", db=db, current_employee=db.get(Employee, "admin"))
    assert exc.value.status_code == 404
