"""059 - Per-project "has performance reviews" flag

`projects.performance_review_enabled` marks which projects run performance
reviews (toggled from the Reviews panel). Defaults to false for every existing
project, except ones that already have a review from 058.

Revision ID: 059
Revises: 058
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = '059'
down_revision = '058'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'projects',
        sa.Column('performance_review_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        "UPDATE projects SET performance_review_enabled = TRUE "
        "WHERE id IN (SELECT DISTINCT project_id FROM performance_reviews)"
    )


def downgrade():
    op.drop_column('projects', 'performance_review_enabled')
