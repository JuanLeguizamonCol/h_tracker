"""060 - Self / manager / joint evaluations per performance review

Every review now scores the same criteria three times: the employee's self
evaluation, the manager's (reviewer's) evaluation and the agreed joint one —
only the joint scores count toward the official/annual averages.

- `scores` (the reviewer's scores until now) is renamed to `manager_scores`.
- New `self_scores`, `joint_scores`, `joint_notes`, `manager_submitted_at`.
- New status `joint_review` between `in_review` and `completed`.
- Reviews already `completed` get their manager scores copied into
  `joint_scores`, so their existing result keeps counting.

Revision ID: 060
Revises: 059
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = '060'
down_revision = '059'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('performance_reviews', 'scores', new_column_name='manager_scores')
    op.add_column('performance_reviews', sa.Column('self_scores', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('performance_reviews', sa.Column('joint_scores', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('performance_reviews', sa.Column('joint_notes', sa.Text(), nullable=True))
    op.add_column('performance_reviews', sa.Column('manager_submitted_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE performance_reviews SET joint_scores = manager_scores WHERE status = 'completed'")


def downgrade():
    op.execute("UPDATE performance_reviews SET status = 'in_review' WHERE status = 'joint_review'")
    op.drop_column('performance_reviews', 'manager_submitted_at')
    op.drop_column('performance_reviews', 'joint_notes')
    op.drop_column('performance_reviews', 'joint_scores')
    op.drop_column('performance_reviews', 'self_scores')
    op.alter_column('performance_reviews', 'manager_scores', new_column_name='scores')
