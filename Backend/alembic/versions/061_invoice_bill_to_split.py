"""061 - Split Invoice's Bill To address into Client-shaped columns

`bill_to_address`/`bill_to_city_state_zip` were combined display strings that
didn't match Client's actual split columns (street_address_1/2, city, state,
zip), making it impossible to cleanly sync an edit here back onto the Client
record. Replaces them with 5 columns mirroring Client's shape 1:1, with a
best-effort backfill (this field is rarely populated — it's an explicit
"fix one wrong field" escape hatch, see models/invoice.py) — lossy splitting
is an acceptable tradeoff for the handful of rows that have it set.

Revision ID: 061
Revises: 060
Create Date: 2026-10-09
"""
import re

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column, String

revision = '061'
down_revision = '060'
branch_labels = None
depends_on = None

# "City, ST zip" or "City, ST, zip" or "City, ST" or "City" — same shape
# services/export_pdf.py builds (plus the double-comma variant some static
# profiles use), tolerant of a trailing comma after the state.
_CITY_STATE_ZIP_RE = re.compile(r"^\s*(?P<city>[^,]*?)\s*(?:,\s*(?P<state>\S+?),?)?(?:\s+(?P<zip>\S+))?\s*$")


def upgrade():
    op.add_column('invoices', sa.Column('bill_to_street_address_1', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_street_address_2', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_city', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_state', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_zip', sa.String(), nullable=True))

    invoices_t = table(
        'invoices', column('id', String),
        column('bill_to_address', String), column('bill_to_city_state_zip', String),
        column('bill_to_street_address_1', String), column('bill_to_street_address_2', String),
        column('bill_to_city', String), column('bill_to_state', String), column('bill_to_zip', String),
    )
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(invoices_t.c.id, invoices_t.c.bill_to_address, invoices_t.c.bill_to_city_state_zip)
        .where(sa.or_(invoices_t.c.bill_to_address.isnot(None), invoices_t.c.bill_to_city_state_zip.isnot(None)))
    ).fetchall()
    for row in rows:
        values = {}
        if row.bill_to_address:
            values['bill_to_street_address_1'] = row.bill_to_address
        if row.bill_to_city_state_zip:
            m = _CITY_STATE_ZIP_RE.match(row.bill_to_city_state_zip)
            if m:
                if m.group('city'):
                    values['bill_to_city'] = m.group('city')
                if m.group('state'):
                    values['bill_to_state'] = m.group('state')
                if m.group('zip'):
                    values['bill_to_zip'] = m.group('zip')
        if values:
            conn.execute(invoices_t.update().where(invoices_t.c.id == row.id).values(**values))

    op.drop_column('invoices', 'bill_to_address')
    op.drop_column('invoices', 'bill_to_city_state_zip')


def downgrade():
    op.add_column('invoices', sa.Column('bill_to_address', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_city_state_zip', sa.String(), nullable=True))

    invoices_t = table(
        'invoices', column('id', String),
        column('bill_to_address', String), column('bill_to_city_state_zip', String),
        column('bill_to_street_address_1', String), column('bill_to_street_address_2', String),
        column('bill_to_city', String), column('bill_to_state', String), column('bill_to_zip', String),
    )
    conn = op.get_bind()
    rows = conn.execute(
        sa.select(
            invoices_t.c.id, invoices_t.c.bill_to_street_address_1, invoices_t.c.bill_to_street_address_2,
            invoices_t.c.bill_to_city, invoices_t.c.bill_to_state, invoices_t.c.bill_to_zip,
        )
    ).fetchall()
    for row in rows:
        values = {}
        addr_parts = [p for p in [row.bill_to_street_address_1, row.bill_to_street_address_2] if p]
        if addr_parts:
            values['bill_to_address'] = ", ".join(addr_parts)
        csz = ", ".join(p for p in [row.bill_to_city, row.bill_to_state] if p)
        if row.bill_to_zip:
            csz = f"{csz} {row.bill_to_zip}".strip(", ")
        if csz:
            values['bill_to_city_state_zip'] = csz
        if values:
            conn.execute(invoices_t.update().where(invoices_t.c.id == row.id).values(**values))

    op.drop_column('invoices', 'bill_to_street_address_1')
    op.drop_column('invoices', 'bill_to_street_address_2')
    op.drop_column('invoices', 'bill_to_city')
    op.drop_column('invoices', 'bill_to_state')
    op.drop_column('invoices', 'bill_to_zip')
