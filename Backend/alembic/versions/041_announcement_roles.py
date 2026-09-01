"""Announcements — add role-based visibility (admin/manager/employee)

Revision ID: 041
Revises: 040
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('announcements', sa.Column('roles', sa.String(), nullable=True))


def downgrade():
    op.drop_column('announcements', 'roles')
