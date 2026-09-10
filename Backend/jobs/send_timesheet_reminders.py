"""
Scheduled timesheet-reminder job.

Runs as an Azure Container Apps Job (weekly cron trigger, single replica) —
NOT inside the web process, same pattern as jobs/generate_invoices.py. Emails
every active employee who hasn't logged any hours in the trailing 7 days.

Run:
    python -m jobs.send_timesheet_reminders

Exit code: 0 on success, 1 on a fatal error (surfaced to Container Apps).
"""
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("timesheet_reminder_job")


def run() -> int:
    from config.database import SessionLocal
    from services.timesheet_reminders import send_timesheet_reminders

    db = SessionLocal()
    try:
        result = send_timesheet_reminders(db)
        logger.info(
            f"Timesheet reminder job complete: {result['sent']} sent, "
            f"{result['skipped']} skipped, {result['candidates']} candidates"
        )
        return 0
    except Exception as e:
        logger.error(f"Fatal error in timesheet reminder job: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(run())
