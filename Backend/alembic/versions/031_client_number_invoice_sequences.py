"""Add client_number to clients + per-client invoice sequences

Invoice numbering changes from company+year based to per-client:
  new format is "{client_number}-{sequence for that client}", e.g. "12-3".

Revision ID: 031
Revises: 030
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('clients', sa.Column('client_number', sa.String(20), nullable=True))
    op.create_unique_constraint('uq_clients_client_number', 'clients', ['client_number'])

    op.create_table(
        'client_invoice_sequences',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('client_id', sa.String(), nullable=False),
        sa.Column('last_sequence', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('client_id', name='uq_client_invoice_seq_client'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    )


def downgrade():
    op.drop_table('client_invoice_sequences')
    op.drop_constraint('uq_clients_client_number', 'clients', type_='unique')
    op.drop_column('clients', 'client_number')
