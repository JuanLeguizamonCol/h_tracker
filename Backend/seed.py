"""
Seed script: creates tables and loads dummy data into PostgreSQL.
"""
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

from config.database import engine, Base, SessionLocal
from utils.auth_jwt import hash_password

DEFAULT_PASSWORD = hash_password("Impact2026!")

import models  # imports all via __init__
from models.employees import Employee
from models.clients import Client
from models.projects import Project
from models.project_roles import ProjectRole
from models.user_roles import UserRole
from models.employee_projects import EmployeeProject
from models.time_entries import TimeEntry
from models.invoice import Invoice
from models.invoice_lines import InvoiceLine
from models.invoice_manual_lines import InvoiceManualLine
from models.invoice_fees import InvoiceFee
from models.invoice_time_entries import InvoiceTimeEntry


def uid():
    return str(uuid.uuid4())


def seed():
    Base.metadata.create_all(bind=engine)
    print("Tables verified.")

    db = SessionLocal()

    try:
        if db.query(Employee).first() is not None:
            print("[seed] Data already exists, skipping.")
            return

        # EMPLOYEES
        emp_admin = Employee(id=uid(), user_id="admin-001", name="Juan Leguizamon", email="juan@impactpoint.com", is_active=True, password_hash=DEFAULT_PASSWORD)
        emp_laura = Employee(id=uid(), user_id=uid(), name="Laura Garcia", email="laura@impactpoint.com", is_active=True, password_hash=DEFAULT_PASSWORD)
        emp_carlos = Employee(id=uid(), user_id=uid(), name="Carlos Rodriguez", email="carlos@impactpoint.com", is_active=True, password_hash=DEFAULT_PASSWORD)
        emp_maria = Employee(id=uid(), user_id=uid(), name="Maria Fernandez", email="maria@impactpoint.com", is_active=True, password_hash=DEFAULT_PASSWORD)
        emp_diego = Employee(id=uid(), user_id=uid(), name="Diego Lopez", email="diego@impactpoint.com", is_active=True, password_hash=DEFAULT_PASSWORD)
        employees = [emp_admin, emp_laura, emp_carlos, emp_maria, emp_diego]
        db.add_all(employees)
        db.flush()
        print(f"  {len(employees)} employees inserted.")

        # USER ROLES
        user_roles = [
            UserRole(id=uid(), user_id=emp_admin.id, role="admin"),
            UserRole(id=uid(), user_id=emp_laura.id, role="employee"),
            UserRole(id=uid(), user_id=emp_carlos.id, role="employee"),
            UserRole(id=uid(), user_id=emp_maria.id, role="employee"),
            UserRole(id=uid(), user_id=emp_diego.id, role="admin"),
        ]
        db.add_all(user_roles)
        db.flush()
        print(f"  {len(user_roles)} user roles inserted.")

        # CLIENTS
        cl_acme = Client(id=uid(), name="Acme Corporation", email="info@acme.com", phone="+1 305 555 0100", manager_name="John Smith", manager_email="jsmith@acme.com", manager_phone="+1 305 555 0101")
        cl_globex = Client(id=uid(), name="Globex Industries", email="info@globex.com", phone="+1 212 555 0200", manager_name="Sarah Connor", manager_email="sconnor@globex.com", manager_phone="+1 212 555 0201")
        cl_initech = Client(id=uid(), name="Initech Solutions", email="info@initech.com", phone="+1 415 555 0300", manager_name="Bill Lumbergh", manager_email="bill@initech.com")
        cl_wayne = Client(id=uid(), name="Wayne Enterprises", email="info@wayne.com", phone="+1 312 555 0400", manager_name="Lucius Fox", manager_email="lfox@wayne.com")
        cl_inactive = Client(id=uid(), name="Old Client LLC", email="old@client.com", is_active=False)
        clients = [cl_acme, cl_globex, cl_initech, cl_wayne, cl_inactive]
        db.add_all(clients)
        db.flush()
        print(f"  {len(clients)} clients inserted.")

        # PROJECTS
        prj_acme_web = Project(id=uid(), client_id=cl_acme.id, name="Portal Web Corporativo", description="Corporate web portal for Acme", is_active=True)
        prj_acme_mobile = Project(id=uid(), client_id=cl_acme.id, name="App Movil Ventas", description="Mobile sales app", is_active=True)
        prj_globex_erp = Project(id=uid(), client_id=cl_globex.id, name="Sistema ERP", description="ERP system implementation", is_active=True)
        prj_globex_bi = Project(id=uid(), client_id=cl_globex.id, name="Dashboard BI", description="Business intelligence dashboard", is_active=True)
        prj_initech_api = Project(id=uid(), client_id=cl_initech.id, name="API REST Microservicios", description="Microservices REST API", is_active=True)
        prj_wayne_sec = Project(id=uid(), client_id=cl_wayne.id, name="Plataforma Seguridad", description="Security platform", is_active=True)
        prj_inactive = Project(id=uid(), client_id=cl_inactive.id, name="Proyecto Antiguo", is_active=False)
        projects = [prj_acme_web, prj_acme_mobile, prj_globex_erp, prj_globex_bi, prj_initech_api, prj_wayne_sec, prj_inactive]
        db.add_all(projects)
        db.flush()
        print(f"  {len(projects)} projects inserted.")

        # PROJECT ROLES
        roles = []
        for prj, role_data in [
            (prj_acme_web, [("Senior Developer", 85), ("Frontend Developer", 65), ("QA Engineer", 55)]),
            (prj_acme_mobile, [("Mobile Developer", 90), ("UI Designer", 70)]),
            (prj_globex_erp, [("Backend Developer", 100), ("DevOps Engineer", 95)]),
            (prj_globex_bi, [("Data Analyst", 80), ("Frontend Developer", 75)]),
            (prj_initech_api, [("Backend Developer", 95), ("Senior Developer", 110)]),
            (prj_wayne_sec, [("Security Engineer", 110), ("Backend Developer", 100)]),
        ]:
            for rname, rate in role_data:
                roles.append(ProjectRole(id=uid(), project_id=prj.id, name=rname, hourly_rate_usd=Decimal(str(rate))))
        db.add_all(roles)
        db.flush()
        print(f"  {len(roles)} project roles inserted.")

        # Helper: get first role for a project
        def first_role(prj):
            return next((r for r in roles if r.project_id == prj.id), None)

        # EMPLOYEE PROJECTS (assignments)
        assignments = [
            EmployeeProject(id=uid(), user_id=emp_admin.id, project_id=prj_acme_web.id, role_id=first_role(prj_acme_web).id),
            EmployeeProject(id=uid(), user_id=emp_admin.id, project_id=prj_globex_erp.id, role_id=first_role(prj_globex_erp).id),
            EmployeeProject(id=uid(), user_id=emp_admin.id, project_id=prj_wayne_sec.id, role_id=first_role(prj_wayne_sec).id),
            EmployeeProject(id=uid(), user_id=emp_laura.id, project_id=prj_acme_web.id, role_id=roles[1].id),  # Frontend Developer
            EmployeeProject(id=uid(), user_id=emp_laura.id, project_id=prj_acme_mobile.id, role_id=first_role(prj_acme_mobile).id),
            EmployeeProject(id=uid(), user_id=emp_laura.id, project_id=prj_globex_bi.id, role_id=first_role(prj_globex_bi).id),
            EmployeeProject(id=uid(), user_id=emp_carlos.id, project_id=prj_globex_erp.id, role_id=first_role(prj_globex_erp).id),
            EmployeeProject(id=uid(), user_id=emp_carlos.id, project_id=prj_initech_api.id, role_id=first_role(prj_initech_api).id),
            EmployeeProject(id=uid(), user_id=emp_maria.id, project_id=prj_initech_api.id, role_id=roles[-3].id),  # Senior Developer
            EmployeeProject(id=uid(), user_id=emp_maria.id, project_id=prj_wayne_sec.id, role_id=first_role(prj_wayne_sec).id),
            EmployeeProject(id=uid(), user_id=emp_diego.id, project_id=prj_wayne_sec.id, role_id=first_role(prj_wayne_sec).id),
            EmployeeProject(id=uid(), user_id=emp_diego.id, project_id=prj_acme_mobile.id, role_id=first_role(prj_acme_mobile).id),
        ]
        db.add_all(assignments)
        db.flush()
        print(f"  {len(assignments)} project assignments inserted.")

        # TIME ENTRIES (daily, spread across Jan-Feb 2026)
        time_entries = []
        def te(emp, prj, d, hours, billable=True, notes=None):
            r = first_role(prj)
            time_entries.append(TimeEntry(
                id=uid(), user_id=emp.id, project_id=prj.id,
                role_id=r.id if r else None,
                date=d, hours=Decimal(str(hours)), billable=billable, notes=notes,
            ))

        # Week of Jan 5-9
        for d in range(5, 10):
            te(emp_admin, prj_acme_web, date(2026, 1, d), 6.5)
            te(emp_laura, prj_acme_web, date(2026, 1, d), 4)
            te(emp_carlos, prj_globex_erp, date(2026, 1, d), 8)
        te(emp_admin, prj_globex_erp, date(2026, 1, 5), 1.5)
        te(emp_laura, prj_acme_mobile, date(2026, 1, 6), 4)
        te(emp_laura, prj_acme_mobile, date(2026, 1, 7), 4)
        te(emp_maria, prj_initech_api, date(2026, 1, 5), 7)
        te(emp_maria, prj_initech_api, date(2026, 1, 6), 7)
        te(emp_maria, prj_initech_api, date(2026, 1, 7), 7)
        te(emp_maria, prj_initech_api, date(2026, 1, 8), 7)
        te(emp_maria, prj_initech_api, date(2026, 1, 9), 7)
        te(emp_diego, prj_wayne_sec, date(2026, 1, 5), 6)
        te(emp_diego, prj_wayne_sec, date(2026, 1, 6), 6)
        te(emp_diego, prj_wayne_sec, date(2026, 1, 7), 6)
        te(emp_diego, prj_wayne_sec, date(2026, 1, 8), 6)
        te(emp_diego, prj_wayne_sec, date(2026, 1, 9), 6)
        te(emp_diego, prj_acme_mobile, date(2026, 1, 8), 2)

        # Week of Jan 12-16
        for d in range(12, 17):
            te(emp_admin, prj_acme_web, date(2026, 1, d), 5)
            te(emp_laura, prj_globex_bi, date(2026, 1, d), 8)
            te(emp_diego, prj_wayne_sec, date(2026, 1, d), 8)
        te(emp_admin, prj_wayne_sec, date(2026, 1, 12), 3)
        te(emp_carlos, prj_initech_api, date(2026, 1, 12), 8)
        te(emp_carlos, prj_initech_api, date(2026, 1, 13), 8)
        te(emp_carlos, prj_initech_api, date(2026, 1, 14), 8)
        te(emp_carlos, prj_initech_api, date(2026, 1, 15), 8)
        te(emp_carlos, prj_globex_erp, date(2026, 1, 16), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 1, 12), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 1, 13), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 1, 14), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 1, 15), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 1, 16), 8)

        # Week of Feb 2-6
        for d in range(2, 7):
            te(emp_admin, prj_acme_web, date(2026, 2, d), 6)
            te(emp_laura, prj_globex_bi, date(2026, 2, d), 7)
            te(emp_diego, prj_wayne_sec, date(2026, 2, d), 6.5)
        te(emp_admin, prj_wayne_sec, date(2026, 2, 2), 2)
        te(emp_laura, prj_acme_web, date(2026, 2, 3), 1)
        te(emp_carlos, prj_globex_erp, date(2026, 2, 2), 5)
        te(emp_carlos, prj_globex_erp, date(2026, 2, 3), 5)
        te(emp_carlos, prj_globex_erp, date(2026, 2, 4), 5)
        te(emp_carlos, prj_globex_erp, date(2026, 2, 5), 5)
        te(emp_carlos, prj_initech_api, date(2026, 2, 6), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 2, 2), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 2, 3), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 2, 4), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 2, 5), 8)
        te(emp_maria, prj_wayne_sec, date(2026, 2, 6), 8)
        te(emp_diego, prj_acme_mobile, date(2026, 2, 4), 1.5)

        db.add_all(time_entries)
        db.flush()
        print(f"  {len(time_entries)} time entries inserted.")

        # INVOICES
        inv_acme = Invoice(
            id=uid(), project_id=prj_acme_web.id, status="sent",
            invoice_number="INV-2026-001", issue_date=date(2026, 2, 1),
            subtotal=Decimal("15470.00"), discount=Decimal("0"), total=Decimal("15470.00"),
        )
        inv_globex = Invoice(
            id=uid(), project_id=prj_globex_erp.id, status="draft",
            invoice_number="INV-2026-002", issue_date=date(2026, 2, 1),
            subtotal=Decimal("12240.00"), discount=Decimal("0"), total=Decimal("12240.00"),
        )
        invoices = [inv_acme, inv_globex]
        db.add_all(invoices)
        db.flush()
        print(f"  {len(invoices)} invoices inserted.")

        # INVOICE LINES
        invoice_lines = [
            InvoiceLine(id=uid(), invoice_id=inv_acme.id, user_id=emp_admin.id,
                       employee_name="Juan Leguizamon", role_name="Senior Developer",
                       hours=Decimal("57"), rate_snapshot=Decimal("85.00"), amount=Decimal("4845.00")),
            InvoiceLine(id=uid(), invoice_id=inv_acme.id, user_id=emp_laura.id,
                       employee_name="Laura Garcia", role_name="Frontend Developer",
                       hours=Decimal("44"), rate_snapshot=Decimal("65.00"), amount=Decimal("2860.00")),
            InvoiceLine(id=uid(), invoice_id=inv_globex.id, user_id=emp_carlos.id,
                       employee_name="Carlos Rodriguez", role_name="Backend Developer",
                       hours=Decimal("48"), rate_snapshot=Decimal("100.00"), amount=Decimal("4800.00")),
        ]
        db.add_all(invoice_lines)
        db.flush()
        print(f"  {len(invoice_lines)} invoice lines inserted.")

        # INVOICE MANUAL LINE (sample)
        manual_line = InvoiceManualLine(
            id=uid(), invoice_id=inv_acme.id, person_name="External Consultant",
            hours=Decimal("10"), rate_usd=Decimal("120.00"),
            description="External security audit", line_total=Decimal("1200.00"),
        )
        db.add(manual_line)
        db.flush()
        print("  1 invoice manual line inserted.")

        # INVOICE FEE (sample)
        fee = InvoiceFee(
            id=uid(), invoice_id=inv_acme.id, label="Cloud hosting",
            quantity=Decimal("1"), unit_price_usd=Decimal("500.00"),
            description="Monthly AWS hosting fee", fee_total=Decimal("500.00"),
        )
        db.add(fee)
        db.flush()
        print("  1 invoice fee inserted.")

        db.commit()
        print("\nSeed completed successfully!")
        print(f"\nSummary:")
        print(f"  Employees:      {len(employees)}")
        print(f"  User Roles:     {len(user_roles)}")
        print(f"  Clients:        {len(clients)}")
        print(f"  Projects:       {len(projects)}")
        print(f"  Project Roles:  {len(roles)}")
        print(f"  Assignments:    {len(assignments)}")
        print(f"  Time Entries:   {len(time_entries)}")
        print(f"  Invoices:       {len(invoices)}")
        print(f"  Invoice Lines:  {len(invoice_lines)}")

    except Exception as e:
        db.rollback()
        print(f"\nError during seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
