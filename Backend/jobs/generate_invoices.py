"""
Scheduled invoice-generation job.

Runs as an Azure Container Apps Job (cron trigger, single replica) — NOT inside
the web process. For each active, non-internal project whose billing config says
"today is the invoice day", it generates one draft invoice for the current cycle.

Idempotency is guaranteed by the DB: the partial unique index
`uq_invoices_auto_project_period` makes it impossible to auto-invoice the same
project+period twice, so a duplicate run (or an overlap with the manual endpoint)
can never create a duplicate invoice.

Run:
    python -m jobs.generate_invoices

Exit code: 0 on success, 1 if any project errored (surfaced to Container Apps).
"""
import logging
import sys
import uuid
from datetime import date, datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("invoice_job")


def run() -> int:
    from config.database import SessionLocal
    from services.invoice_generator import generate_invoice_for_project_period
    from services.billing_periods import next_invoice_date, period_bounds_for_project
    from models.projects import Project
    from models.scheduler_log import SchedulerLog

    db = SessionLocal()
    today = date.today()
    generated = 0
    skipped = 0
    errors: list[str] = []

    try:
        active_projects = db.query(Project).filter(
            Project.is_active == True,  # noqa: E712
            Project.is_internal == False,  # noqa: E712
        ).all()

        for project in active_projects:
            try:
                if next_invoice_date(project) != today:
                    skipped += 1
                    continue

                period_start, period_end = period_bounds_for_project(project, today)
                result = generate_invoice_for_project_period(db, project, period_start, period_end)
                if result["generated"]:
                    generated += 1
                    logger.info(
                        f"Generated invoice for project {project.name} "
                        f"({period_start} -> {period_end})"
                    )
                else:
                    skipped += 1
            except Exception as e:  # per-project isolation — one bad project can't abort the run
                db.rollback()
                errors.append(f"{project.id}: {e}")
                logger.error(f"Error for project {project.id}: {e}")

        db.add(SchedulerLog(
            id=str(uuid.uuid4()),
            run_at=datetime.now(timezone.utc),
            period_start=str(today),
            period_end=str(today),
            invoices_generated=generated,
            invoices_skipped=skipped,
            status="success" if not errors else "error",
            error_message="; ".join(errors) if errors else None,
        ))
        db.commit()

        logger.info(
            f"Invoice job complete: {generated} generated, {skipped} skipped, {len(errors)} errors"
        )
        return 0 if not errors else 1

    except Exception as e:
        logger.error(f"Fatal error in invoice job: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(run())
