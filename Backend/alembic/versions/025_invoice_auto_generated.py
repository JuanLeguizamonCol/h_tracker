"""Add auto_generated flag + partial unique index for scheduled invoices

Guarantees a project+period can be auto-invoiced at most once, even under
concurrent runs, by way of a partial unique index on
(project_id, period_start, period_end) WHERE auto_generated.

Revision ID: 025
Revises: 024
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa

revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None

INDEX_NAME = 'uq_invoices_auto_project_period'


def upgrade():
    op.add_column(
        'invoices',
        sa.Column('auto_generated', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Partial unique index — applies only to auto-generated invoices, so manual
    # invoices for the same project/period remain unrestricted.
    op.create_index(
        INDEX_NAME,
        'invoices',
        ['project_id', 'period_start', 'period_end'],
        unique=True,
        postgresql_where=sa.text('auto_generated'),
    )


def downgrade():
    op.drop_index(INDEX_NAME, table_name='invoices')
    op.drop_column('invoices', 'auto_generated')
