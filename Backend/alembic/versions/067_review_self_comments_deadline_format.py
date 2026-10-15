"""067 - Self evaluation goes comments-only, gets a deadline; review format field

- `self_due_date`: hard deadline for the self-assessment stage (nullable —
  existing reviews get no deadline, so nothing retroactively locks).
- `evaluation_format`: which review format/template this review uses — only
  "standard" exists today; the field exists now so the picker (chosen at
  assignment time) has somewhere to persist to.
- `self_section_comments`: one free-text comment per criterion, replacing
  per-item self scores (self_scores is kept, unused, for reviews that were
  already scored under the old format).

Revision ID: 067
Revises: 066
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = '067'
down_revision = '066'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('performance_reviews', sa.Column('self_due_date', sa.Date(), nullable=True))
    op.add_column('performance_reviews', sa.Column('evaluation_format', sa.String(), nullable=False, server_default='standard'))
    op.add_column('performance_reviews', sa.Column('self_section_comments', sa.JSON(), nullable=False, server_default='{}'))


def downgrade():
    op.drop_column('performance_reviews', 'self_section_comments')
    op.drop_column('performance_reviews', 'evaluation_format')
    op.drop_column('performance_reviews', 'self_due_date')
