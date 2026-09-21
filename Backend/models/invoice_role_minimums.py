from config.database import Base
from sqlalchemy import Column, String, Numeric, ForeignKey, UniqueConstraint
import uuid


class InvoiceRoleMinimum(Base):
    """Per-invoice override of a Managed Services role's minimum hours / basis.

    Edited from the invoice's Managed Services panel; when absent the role's own
    `min_hours` / `min_hours_basis` (project configuration) apply.
    """

    __tablename__ = "invoice_role_minimums"
    __table_args__ = (UniqueConstraint("invoice_id", "role_id", name="uq_invoice_role_minimum"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(String, ForeignKey("project_roles.id", ondelete="CASCADE"), nullable=False)
    min_hours = Column(Numeric(10, 2), nullable=True)   # None = no minimum
    basis = Column(String(10), nullable=False)          # week | month | period
