"""
Invoice number generation service.

Format: "{prefix}{client_number}-{sequence for that client, zero-padded to 3
  digits}", e.g. client #888888's 12th invoice -> "888888-012".

`prefix` is empty for Impact Point (IPC) invoices and "P" for Pegasus Insights
(owner_company == "PI") invoices — so the same client's 5th invoice reads
"888888-005" for IPC and "P888888-005" for Pegasus. The sequence itself is
shared per client (it is cumulative and never resets), only the leading "P"
differs. Padding is a minimum width — a sequence past 999 just grows to 4+
digits ("1000"), never truncates.

Sequence is cumulative per client — never resets, does not depend on year.
Counter stored in client_invoice_sequences, one row per client.
Counter is incremented ONLY on actual invoice creation, never on previews.
"""
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text


def company_prefix(owner_company: str | None) -> str:
    """Leading letter for the invoice number based on the owning company.

    Pegasus Insights (PI) invoices are prefixed with "P"; Impact Point (IPC)
    and anything else have no prefix.
    """
    return "P" if (owner_company or "").upper() == "PI" else ""


def preview_next_number_for_client(
    db: Session, client_id: str, client_number: str, owner_company: str | None = None
) -> str:
    """Non-destructive preview — does NOT increment the counter."""
    row = db.execute(
        text("SELECT last_sequence FROM client_invoice_sequences WHERE client_id = :cid"),
        {"cid": client_id},
    ).scalar()
    seq = (int(row) if row is not None else 0) + 1
    return f"{company_prefix(owner_company)}{client_number}-{seq:03d}"


def atomic_generate_number_for_client(
    db: Session, client_id: str, client_number: str, owner_company: str | None = None
) -> str:
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
    return f"{company_prefix(owner_company)}{client_number}-{int(result):03d}"
