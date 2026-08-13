"""Add owner_id to projects

The project owner is the only employee allowed to invoice the project (owners
are Admins). Distinct from manager_id (operational manager — any Manager/Admin).

Revision ID: 034
Revises: 033
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = '034'
down_revision = '033'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('owner_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_projects_owner_id_employees',
        'projects', 'employees',
        ['owner_id'], ['id'],
    )


def downgrade():
    op.drop_constraint('fk_projects_owner_id_employees', 'projects', type_='foreignkey')
    op.drop_column('projects', 'owner_id')
