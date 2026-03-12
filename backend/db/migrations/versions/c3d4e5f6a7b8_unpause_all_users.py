"""unpause all users

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-12

"""
from alembic import op

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET is_paused = false WHERE is_paused = true")


def downgrade() -> None:
    pass
