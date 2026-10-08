"""058 - Project performance reviews

`performance_reviews` holds one evaluation per employee × project in the
Impact Point review format (project details + self-assessment by the
employee, scored criteria + notes by the reviewer). Sub-criterion scores live
in a JSON column keyed by the fixed template in
services/performance_reviews.py::REVIEW_TEMPLATE. No rows are seeded.

Revision ID: 058
Revises: 057
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa

revision = '058'
down_revision = '057'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'performance_reviews',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('employee_id', sa.String(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reviewer_id', sa.String(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('created_by', sa.String(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('review_date', sa.Date(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=True),
        sa.Column('period_end', sa.Date(), nullable=True),
        sa.Column('duration_hours', sa.Numeric(10, 2), nullable=True),
        sa.Column('project_description', sa.Text(), nullable=True),
        sa.Column('employee_role', sa.Text(), nullable=True),
        sa.Column('self_strengths', sa.Text(), nullable=True),
        sa.Column('self_improvement', sa.Text(), nullable=True),
        sa.Column('self_development', sa.Text(), nullable=True),
        sa.Column('reviewer_strengths_notes', sa.Text(), nullable=True),
        sa.Column('reviewer_improvement_notes', sa.Text(), nullable=True),
        sa.Column('reviewer_development_notes', sa.Text(), nullable=True),
        sa.Column('scores', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(), nullable=False, server_default='self_assessment'),
        sa.Column('self_submitted_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_performance_reviews_project_id', 'performance_reviews', ['project_id'])
    op.create_index('ix_performance_reviews_employee_id', 'performance_reviews', ['employee_id'])
    op.create_index('ix_performance_reviews_reviewer_id', 'performance_reviews', ['reviewer_id'])
    op.create_index('ix_performance_reviews_status', 'performance_reviews', ['status'])


def downgrade():
    op.drop_index('ix_performance_reviews_status', table_name='performance_reviews')
    op.drop_index('ix_performance_reviews_reviewer_id', table_name='performance_reviews')
    op.drop_index('ix_performance_reviews_employee_id', table_name='performance_reviews')
    op.drop_index('ix_performance_reviews_project_id', table_name='performance_reviews')
    op.drop_table('performance_reviews')
