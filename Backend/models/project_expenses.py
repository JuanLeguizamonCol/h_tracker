from config.database import Base
from sqlalchemy import Column, String, Date, DateTime, Numeric, ForeignKey
from datetime import datetime, timezone
import uuid


class ProjectExpense(Base):
    """An ad hoc expense logged against a project — e.g. from the Weekly Log
    while entering hours, when someone traveled for that project. Independent
    of Invoices while unbilled: unlike InvoiceExpense (which always belongs to
    a specific invoice), this just records that the expense happened on a
    project/date. `invoice_id` is null until an invoice for that project gets
    generated/created — see services/project_expenses.py::
    pull_unbilled_expenses_into_invoice, called from both the auto-generation
    job and manual invoice creation — at which point it's set and a matching
    InvoiceExpense is created on that invoice."""

    __tablename__ = "project_expenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    amount_usd = Column(Numeric(12, 2), nullable=False)
    description = Column(String, nullable=True)
    # Set once this expense has been pulled into an invoice — null = still
    # unbilled, eligible to be picked up next time an invoice is generated.
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
