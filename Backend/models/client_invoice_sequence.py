from config.database import Base
from sqlalchemy import Column, String, Integer, UniqueConstraint, ForeignKey
import uuid


class ClientInvoiceSequence(Base):
    __tablename__ = "client_invoice_sequences"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = Column(String, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    last_sequence = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint('client_id', name='uq_client_invoice_seq_client'),
    )
