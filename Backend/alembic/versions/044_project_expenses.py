"""Project expenses — ad hoc expenses logged from Weekly Log against a
project (date, category, amount), independent of any invoice until one
picks them up (invoice_id, set by pull_unbilled_expenses_into_invoice).

Revision ID: 044
Revises: 043
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'project_expenses',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('amount_usd', sa.Numeric(12, 2), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('invoice_id', sa.String(), sa.ForeignKey('invoices.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_project_expenses_project_id', 'project_expenses', ['project_id'])


def downgrade():
    op.drop_index('ix_project_expenses_project_id', table_name='project_expenses')
    op.drop_table('project_expenses')
