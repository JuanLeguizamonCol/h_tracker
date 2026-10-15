"""066 - Multiple reviewers per performance review

A review used to have exactly one reviewer (`performance_reviews.reviewer_id`
+ a single `manager_scores`/`manager_submitted_at`/`reviewer_*_notes` set on
the review row itself). It can now have any number of reviewers, each filling
their own independent evaluation — so those fields move off the review row
and into a new `performance_review_reviewers` child table, one row per
(review, reviewer). Existing single-reviewer data is backfilled into exactly
one child row per review that had a reviewer_id set.

Revision ID: 066
Revises: 065
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = '066'
down_revision = '065'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'performance_review_reviewers',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('review_id', sa.String(), sa.ForeignKey('performance_reviews.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reviewer_id', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('scores', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('strengths_notes', sa.Text(), nullable=True),
        sa.Column('improvement_notes', sa.Text(), nullable=True),
        sa.Column('development_notes', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('review_id', 'reviewer_id', name='uq_review_reviewer'),
    )
    op.create_index('ix_performance_review_reviewers_review_id', 'performance_review_reviewers', ['review_id'])
    op.create_index('ix_performance_review_reviewers_reviewer_id', 'performance_review_reviewers', ['reviewer_id'])

    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO performance_review_reviewers
            (id, review_id, reviewer_id, scores, strengths_notes, improvement_notes, development_notes, submitted_at, created_at)
        SELECT
            gen_random_uuid()::text, id, reviewer_id,
            COALESCE(manager_scores, '{}'::json),
            reviewer_strengths_notes, reviewer_improvement_notes, reviewer_development_notes,
            manager_submitted_at, created_at
        FROM performance_reviews
        WHERE reviewer_id IS NOT NULL
    """))

    op.drop_column('performance_reviews', 'reviewer_id')
    op.drop_column('performance_reviews', 'manager_scores')
    op.drop_column('performance_reviews', 'manager_submitted_at')
    op.drop_column('performance_reviews', 'reviewer_strengths_notes')
    op.drop_column('performance_reviews', 'reviewer_improvement_notes')
    op.drop_column('performance_reviews', 'reviewer_development_notes')


def downgrade():
    op.add_column('performance_reviews', sa.Column('reviewer_id', sa.String(), sa.ForeignKey('employees.id'), nullable=True))
    op.add_column('performance_reviews', sa.Column('manager_scores', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('performance_reviews', sa.Column('manager_submitted_at', sa.DateTime(), nullable=True))
    op.add_column('performance_reviews', sa.Column('reviewer_strengths_notes', sa.Text(), nullable=True))
    op.add_column('performance_reviews', sa.Column('reviewer_improvement_notes', sa.Text(), nullable=True))
    op.add_column('performance_reviews', sa.Column('reviewer_development_notes', sa.Text(), nullable=True))

    # Lossy: a review with more than one reviewer can only keep one on the
    # way back down — picks the earliest-added reviewer row per review.
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE performance_reviews pr SET
            reviewer_id = x.reviewer_id,
            manager_scores = x.scores,
            manager_submitted_at = x.submitted_at,
            reviewer_strengths_notes = x.strengths_notes,
            reviewer_improvement_notes = x.improvement_notes,
            reviewer_development_notes = x.development_notes
        FROM (
            SELECT DISTINCT ON (review_id) review_id, reviewer_id, scores, submitted_at,
                   strengths_notes, improvement_notes, development_notes
            FROM performance_review_reviewers
            ORDER BY review_id, created_at ASC
        ) x
        WHERE pr.id = x.review_id
    """))

    op.drop_index('ix_performance_review_reviewers_reviewer_id', table_name='performance_review_reviewers')
    op.drop_index('ix_performance_review_reviewers_review_id', table_name='performance_review_reviewers')
    op.drop_table('performance_review_reviewers')
