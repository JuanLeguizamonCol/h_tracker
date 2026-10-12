from config.database import Base
from sqlalchemy import Column, String, Boolean, DateTime, Text, Numeric, Date, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid


class Client(Base):

    __tablename__ = "clients"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    manager_name = Column(String, nullable=True)
    manager_email = Column(String, nullable=True)
    manager_phone = Column(String, nullable=True)
    # Extended billing fields
    client_code = Column(String, nullable=True)
    client_number = Column(String(20), nullable=True, unique=True)
    salutation = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    middle_initial = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    main_phone = Column(String, nullable=True)
    work_phone = Column(String, nullable=True)
    mobile = Column(String, nullable=True)
    main_email = Column(String, nullable=True)
    street_address_1 = Column(String, nullable=True)
    street_address_2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    zip = Column(String, nullable=True)
    country = Column(String, nullable=True)
    rep = Column(String, nullable=True)
    payment_terms = Column(String, nullable=True)
    team_member = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    # New fields
    industry = Column(String, nullable=True)
    website = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    referral_source = Column(String, nullable=True)
    referred_by = Column(String, nullable=True)
    acquisition_date = Column(Date, nullable=True)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    billing_rate = Column(Numeric(10, 2), nullable=True)
    billing_currency = Column(String, nullable=True)
    billing_email = Column(String, nullable=True)
    # Default ACH/bank instructions this client's invoices should bill to —
    # e.g. an in-country or client-specific account that differs from the
    # owner company's standard profile. Set once here (or from any of this
    # client's invoices — see patch_invoice) and every new/existing invoice
    # for them defaults to it instead of the generic company bank profile.
    bank_name = Column(String, nullable=True)
    bank_aba = Column(String, nullable=True)
    bank_account_name = Column(String, nullable=True)
    bank_account_number = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    # FreshSales CRM integration
    freshsales_id = Column(BigInteger, nullable=True, unique=True)
    crm_synced_at = Column(DateTime, nullable=True)
    crm_created_at = Column(DateTime, nullable=True)
    crm_updated_at = Column(DateTime, nullable=True)
    crm_source = Column(String(50), nullable=True, default='freshsales')

    projects = relationship("Project", back_populates="client")
