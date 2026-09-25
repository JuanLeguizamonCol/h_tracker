from config.database import Base
from sqlalchemy import Column, String, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class InvoiceLine(Base):

    __tablename__ = "invoice_lines"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False, index=True)
    user_id = Column(String, nullable=True)  # nullable — no FK, allows manual lines without an employee
    employee_name = Column(String, nullable=False)
    role_name = Column(String, nullable=True)
    # The ProjectRole this line was billed at, if any — lets a rate fix made
    # in the invoice panel be pushed back onto the project (see patch_invoice).
    role_id = Column(String, ForeignKey("project_roles.id"), nullable=True)
    hours = Column(Numeric(10, 2), nullable=False)
    rate_snapshot = Column(Numeric(10, 2), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    discount_type = Column(String, nullable=True)
    discount_value = Column(Numeric(10, 2), nullable=False, default=0)
    # A fixed-fee line (its role bills a flat 'week' / 'month' / 'project' fee):
    # `amount` IS the fee, `rate_snapshot` is 0 and `hours` are for reference,
    # and fee_unit_amount is the per-period rate the amount was priced from.
    fee_period = Column(String(10), nullable=True)
    fee_unit_amount = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    invoice = relationship("Invoice", back_populates="lines")
