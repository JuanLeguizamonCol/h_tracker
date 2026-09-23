from config.database import Base
from sqlalchemy import Column, String, Numeric, Date, ForeignKey, UniqueConstraint
import uuid


class InvoiceLineWeek(Base):
    """A weekly split of one InvoiceLine's hours/discount — lets the editor
    bill an employee's hours and discount per week instead of one lump sum
    for the whole invoice. Once a line has any rows here, they're its source
    of truth: the line's own `hours`/`discount_type`/`discount_value` become
    just the sum, kept in sync by PATCH /invoices/{id} (see
    routers/invoice.py::patch_invoice). Feeds both the "Time Detail" panel in
    the editor and the "Attachment II" page(s) of the PDF (see
    services/invoice_time_detail.py), and the Managed Services minimum-hours
    calculation when the role's minimum is measured weekly/monthly (see
    services/managed_services_breakdown.py::role_entries_by_role).
    """

    __tablename__ = "invoice_line_weeks"
    __table_args__ = (UniqueConstraint("invoice_line_id", "week_start", name="uq_invoice_line_week"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_line_id = Column(String, ForeignKey("invoice_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start = Column(Date, nullable=False)
    hours = Column(Numeric(10, 2), nullable=False, default=0)
    discount_type = Column(String(10), nullable=False, default="amount")
    discount_value = Column(Numeric(10, 2), nullable=False, default=0)
