"""Time entries — add an optional work location (state or country), for
tax purposes when an employee travels for a day or more.

Revision ID: 043
Revises: 042
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = '043'
down_revision = '042'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('time_entries', sa.Column('location', sa.String(), nullable=True))


def downgrade():
    op.drop_column('time_entries', 'location')
