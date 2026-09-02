import uuid
from typing import List, Optional
from sqlalchemy.orm import Session

from models.project_expenses import ProjectExpense
from models.employees import Employee
from models.invoice import Invoice
from models.invoice_expenses import InvoiceExpense
from schemas.project_expenses import ProjectExpenseCreate


def create_project_expense(db: Session, expense_in: ProjectExpenseCreate) -> ProjectExpense:
    db_expense = ProjectExpense(**expense_in.model_dump())
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense


def get_project_expenses(
    db: Session,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[ProjectExpense]:
    query = db.query(ProjectExpense)
    if project_id is not None:
        query = query.filter(ProjectExpense.project_id == project_id)
    if user_id is not None:
        query = query.filter(ProjectExpense.user_id == user_id)
    return query.order_by(ProjectExpense.date.desc()).all()


def get_project_expenses_with_employee(
    db: Session,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[dict]:
    query = db.query(ProjectExpense, Employee.name).join(Employee, ProjectExpense.user_id == Employee.id)
    if project_id is not None:
        query = query.filter(ProjectExpense.project_id == project_id)
    if user_id is not None:
        query = query.filter(ProjectExpense.user_id == user_id)
    rows = query.order_by(ProjectExpense.date.desc()).all()
    return [
        {
            "id": e.id,
            "project_id": e.project_id,
            "user_id": e.user_id,
            "employee_name": name,
            "date": e.date,
            "category": e.category,
            "amount_usd": float(e.amount_usd),
            "description": e.description,
            "invoice_id": e.invoice_id,
            "created_at": e.created_at,
        }
        for e, name in rows
    ]


def get_project_expense(db: Session, expense_id: str) -> Optional[ProjectExpense]:
    return db.query(ProjectExpense).filter(ProjectExpense.id == expense_id).first()


def delete_project_expense(db: Session, expense_id: str) -> bool:
    db_expense = get_project_expense(db, expense_id)
    if not db_expense:
        return False
    db.delete(db_expense)
    db.commit()
    return True


def pull_unbilled_expenses_into_invoice(db: Session, invoice: Invoice) -> float:
    """Converts every not-yet-invoiced ProjectExpense for this invoice's
    project into an InvoiceExpense on this invoice, so expenses logged from
    Weekly Log actually make it onto the bill instead of sitting unused.

    Scoped to the invoice's period when it has one (the auto-generation job
    and /generate-monthly always set period_start/period_end); otherwise —
    a manual/ad-hoc invoice with no period — every unbilled expense for the
    project is pulled in, matching how the manual flow also pulls in every
    unlinked billable time entry regardless of date.

    Does not commit — caller owns the transaction. Returns the total dollar
    amount pulled in, informational only: like expenses added manually in
    the invoice editor, these do NOT get added to invoice.subtotal/total.
    """
    query = db.query(ProjectExpense).filter(
        ProjectExpense.project_id == invoice.project_id,
        ProjectExpense.invoice_id.is_(None),
    )
    if invoice.period_start and invoice.period_end:
        query = query.filter(
            ProjectExpense.date >= invoice.period_start,
            ProjectExpense.date <= invoice.period_end,
        )
    expenses = query.all()
    if not expenses:
        return 0.0

    employee_ids = {e.user_id for e in expenses}
    names = dict(
        db.query(Employee.id, Employee.name).filter(Employee.id.in_(employee_ids)).all()
    ) if employee_ids else {}

    total = 0.0
    for pe in expenses:
        db.add(InvoiceExpense(
            id=str(uuid.uuid4()),
            invoice_id=invoice.id,
            date=pe.date,
            professional=names.get(pe.user_id),
            description=pe.description,
            category=pe.category,
            amount_usd=pe.amount_usd,
            notes="Logged from Weekly Log",
        ))
        pe.invoice_id = invoice.id
        total += float(pe.amount_usd)
    return total


def has_unbilled_expenses(db: Session, project_id: str, period_start=None, period_end=None) -> bool:
    """Cheap existence check — used so a project with expenses but no hours
    this period still gets an invoice generated."""
    query = db.query(ProjectExpense.id).filter(
        ProjectExpense.project_id == project_id,
        ProjectExpense.invoice_id.is_(None),
    )
    if period_start and period_end:
        query = query.filter(ProjectExpense.date >= period_start, ProjectExpense.date <= period_end)
    return query.first() is not None
