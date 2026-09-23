"""053 - Weekly hours/discount editing for invoice lines

`invoice_line_weeks` lets the invoice editor's "Time Detail" panel bill an
employee's hours and discount per week instead of one lump sum for the whole
invoice — edited from the panel that used to be read-only, and printed as
Attachment II on the PDF (services/invoice_time_detail.py). Once a line has
rows here, they're its source of truth: the line's hours/discount_type/
discount_value on `invoice_lines` become just their sum (see
routers/invoice.py::patch_invoice). A line with no rows here still shows a
derived per-week split (unchanged from before this migration) until someone
actually edits and saves one.

Revision ID: 053
Revises: 052
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = '053'
down_revision = '052'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'invoice_line_weeks',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('invoice_line_id', sa.String(), sa.ForeignKey('invoice_lines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('discount_type', sa.String(10), nullable=False, server_default='amount'),
        sa.Column('discount_value', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.UniqueConstraint('invoice_line_id', 'week_start', name='uq_invoice_line_week'),
    )
    op.create_index('ix_invoice_line_weeks_invoice_line_id', 'invoice_line_weeks', ['invoice_line_id'])


def downgrade():
    op.drop_index('ix_invoice_line_weeks_invoice_line_id', table_name='invoice_line_weeks')
    op.drop_table('invoice_line_weeks')
