"""Internal-project location scoping for auto-assignment

Adds projects.location — for internal projects, restricts who gets
auto-assigned (see routers/employees.py::_auto_assign_internal_projects) to
employees at that location. Null = everyone (unchanged default behavior).
Meaningless for client projects, which are always staffed explicitly.

Revision ID: 040
Revises: 039
Create Date: 2026-08-29
"""
from alembic import op
import sqlalchemy as sa

revision = '040'
down_revision = '039'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('location', sa.String(), nullable=True))


def downgrade():
    op.drop_column('projects', 'location')
