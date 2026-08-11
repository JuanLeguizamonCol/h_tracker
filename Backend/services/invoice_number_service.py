"""
Invoice number generation service.

Format: "{client_number}-{sequence for that client}", e.g. "12-3"
  (client #12's 3rd invoice).

Sequence is cumulative per client — never resets, does not depend on year.
Counter stored in client_invoice_sequences, one row per client.
Counter is incremented ONLY on actual invoice creation, never on previews.
"""
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text


def preview_next_number_for_client(db: Session, client_id: str, client_number: str) -> str:
    """Non-destructive preview — does NOT increment the counter."""
    row = db.execute(
        text("SELECT last_sequence FROM client_invoice_sequences WHERE client_id = :cid"),
        {"cid": client_id},
    ).scalar()
    seq = (int(row) if row is not None else 0) + 1
    return f"{client_number}-{seq}"


def atomic_generate_number_for_client(db: Session, client_id: str, client_number: str) -> str:
    """
    Atomically increment the per-client counter and return the locked invoice number.
    Called ONCE at invoice creation — never called again for the same invoice.
    Does NOT commit — caller owns the transaction.
    Thread-safe via INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
    """
    result = db.execute(
        text("""
            INSERT INTO client_invoice_sequences (id, client_id, last_sequence)
            VALUES (:id, :client_id, 1)
            ON CONFLICT (client_id) DO UPDATE
                SET last_sequence = client_invoice_sequences.last_sequence + 1
            RETURNING last_sequence
        """),
        {"id": str(uuid.uuid4()), "client_id": client_id},
    ).scalar()
    return f"{client_number}-{int(result)}"
