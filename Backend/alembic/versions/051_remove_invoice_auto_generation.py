"""051 - Remove invoice auto-generation

Invoice auto-generation (the Container Apps Job, the manual bulk
`/invoices/generate-monthly` endpoint, and the billing-schedule fields that
fed them) has been removed entirely. Manual invoice creation (POST
/invoices/, one project at a time) is unaffected and unrelated to any of
this. This migration drops what's left with no remaining code reference:
  - `scheduler_log` — only ever written by the job and the bulk endpoint.
  - `projects.billing_period` / `billing_day_of_period` /
    `billing_anchor_date` / `custom_period_days` — only ever read by
    `services/billing_periods.py` to compute "is today the billing day",
    which no longer exists. `is_fixed_fee` / `is_managed_services` and their
    amount/min-hours fields are a separate, unrelated concept (how an
    invoice's total is computed) and are NOT touched here.

`invoices.auto_generated` and its partial unique index are also left alone —
historical invoices already carry that flag, and no code sets it going
forward, so nothing further needs cleaning up there.

Revision ID: 051
Revises: 050
Create Date: 2026-09-19
"""
from alembic import op
import sqlalchemy as sa

revision = '051'
down_revision = '050'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('scheduler_log')
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_column('billing_period')
        batch_op.drop_column('billing_day_of_period')
        batch_op.drop_column('billing_anchor_date')
        batch_op.drop_column('custom_period_days')


def downgrade():
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('billing_period', sa.String(20), nullable=False, server_default='monthly'))
        batch_op.add_column(sa.Column('billing_day_of_period', sa.Integer(), nullable=True, server_default='3'))
        batch_op.add_column(sa.Column('billing_anchor_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('custom_period_days', sa.Integer(), nullable=True))

    op.create_table(
        'scheduler_log',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('run_at', sa.DateTime(), nullable=False),
        sa.Column('period_start', sa.String(), nullable=False),
        sa.Column('period_end', sa.String(), nullable=False),
        sa.Column('invoices_generated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('invoices_skipped', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(), nullable=False, server_default='success'),
        sa.Column('error_message', sa.String(), nullable=True),
    )
