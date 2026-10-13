"""064 - Per-invoice toggle to hide the Time Detail attachment page

Some clients only want the invoice summary, not the Attachment II weekly
hours-per-employee breakdown. `hide_time_detail_page` skips that page in the
PDF export — the underlying weekly data (and the on-screen Time Detail panel
where it's edited) is untouched.

Revision ID: 064
Revises: 063
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = '064'
down_revision = '063'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('invoices', sa.Column('hide_time_detail_page', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('invoices', 'hide_time_detail_page')
