"""
Database initialization — runs once at container startup, BEFORE the app.

Why this exists instead of a plain `alembic upgrade head`:
  The migration chain is NOT self-sufficient from an empty database. Migration
  002 drops the core tables (invoices, employees, …) expecting SQLAlchemy's
  create_all to rebuild them, and later migrations ALTER those tables. So
  `alembic upgrade head` against a brand-new DB fails at 003
  ("relation invoices does not exist"). That would break the very first deploy
  against a fresh Azure PostgreSQL.

Strategy:
  - DB already tracked by Alembic (has alembic_version) → `alembic upgrade head`
    (normal incremental path; no-op when already at head).
  - Otherwise (fresh DB) → build the current schema from the models via
    create_all, then `alembic stamp head` so future migrations apply cleanly.

Run:
    python -m jobs.init_db
"""
import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("init_db")


def run() -> int:
    from config.database import engine, Base
    import models  # noqa: F401 — registers every table on Base.metadata

    cfg = Config("alembic.ini")
    tables = set(inspect(engine).get_table_names())

    try:
        if "alembic_version" in tables:
            logger.info("Existing DB (Alembic-tracked) → upgrade head")
            command.upgrade(cfg, "head")
        else:
            # Fresh DB (or legacy create_all DB with no version table): the chain
            # can't build from zero, so materialize the model schema and mark it
            # as being at head.
            logger.info("Fresh DB → create_all + stamp head")
            Base.metadata.create_all(bind=engine)
            command.stamp(cfg, "head")
        logger.info("DB init complete.")
        return 0
    except Exception as e:
        logger.error("DB init failed: %s", e)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(run())
