from config.database import Base
from sqlalchemy import Column, String, Date, DateTime, Numeric, ForeignKey, Boolean, Index, text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class Invoice(Base):

    __tablename__ = "invoices"

    # Partial unique index: an active project+period can be auto-invoiced only
    # once. Declared here (not just in migration 025) so create_all builds it on
    # a fresh DB too — keeping the fresh-deploy and migrated schemas identical.
    __table_args__ = (
        Index(
            "uq_invoices_auto_project_period",
            "project_id", "period_start", "period_end",
            unique=True,
            postgresql_where=text("auto_generated"),
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="draft", index=True)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    discount = Column(Numeric(12, 2), nullable=False, default=0)
    total = Column(Numeric(12, 2), nullable=False, default=0)
    cap_amount = Column(Numeric(12, 2), nullable=True)
    notes = Column(String, nullable=True)
    invoice_number = Column(String, unique=True, nullable=True)
    issue_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    # True when created by the scheduled invoice job (vs. manually by a user).
    # Backed by a partial unique index on (project_id, period_start, period_end)
    # so the same project+period can never be auto-invoiced twice.
    auto_generated = Column(Boolean, nullable=False, default=False)
    signatory_name = Column(String, nullable=True)
    signatory_title = Column(String, nullable=True)
    owner_company = Column(String(10), nullable=True, default='IPC')
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    manual_lines = relationship("InvoiceManualLine", back_populates="invoice", cascade="all, delete-orphan")
    fees = relationship("InvoiceFee", back_populates="invoice", cascade="all, delete-orphan")
    time_entry_links = relationship("InvoiceTimeEntry", back_populates="invoice", cascade="all, delete-orphan")
    expenses = relationship("InvoiceExpense", back_populates="invoice", cascade="all, delete-orphan")
    hours_on_hold = relationship("InvoiceHoursOnHold", back_populates="invoice", cascade="all, delete-orphan")
