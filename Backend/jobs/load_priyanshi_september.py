"""One-off: load Priyanshi Shah's September 2026 hours directly into the DB,
bypassing the monthly-close lock (September is already locked as of 2026-10-06
and the normal API will reject these). Run once, against production.

Deletes 4 pre-existing entries for 2026-09-03/04 that don't match the real
source data (3.75h/day TPGS - Pegasus + 0.63h/day H2O Care), then creates the
25 real entries transcribed from the user's table (H2O Care 13h, TPGS -
Pegasus 90.5h, LJM 2.5h = 106h total).

Usage (from the Backend directory, with DATABASE_URL pointing at production):
    python -m jobs.load_priyanshi_september
"""
import uuid
from datetime import date

from config.database import SessionLocal
from models.time_entries import TimeEntry

PRIYANSHI = "d2ea27cf-17fb-4fce-90c3-f76dc5fc36e8"
TPGS_PEGASUS = "3edafa96-d39a-4b3f-b965-20bc547e8b30"
H2O_CARE = "4b918bbb-a2a6-462a-aa56-e76762ba395d"
LJM = "2121e5cb-4ec4-4e7e-9ed6-2495898c1cd7"

ENTRIES = [
    (date(2026, 9, 3), H2O_CARE, 1),
    (date(2026, 9, 4), TPGS_PEGASUS, 5),
    (date(2026, 9, 4), H2O_CARE, 0.5),
    (date(2026, 9, 8), TPGS_PEGASUS, 2),
    (date(2026, 9, 8), H2O_CARE, 5),
    (date(2026, 9, 9), TPGS_PEGASUS, 3),
    (date(2026, 9, 9), H2O_CARE, 4),
    (date(2026, 9, 10), TPGS_PEGASUS, 8),
    (date(2026, 9, 11), TPGS_PEGASUS, 5),
    (date(2026, 9, 14), TPGS_PEGASUS, 2),
    (date(2026, 9, 15), TPGS_PEGASUS, 2),
    (date(2026, 9, 16), TPGS_PEGASUS, 7),
    (date(2026, 9, 17), TPGS_PEGASUS, 8),
    (date(2026, 9, 18), TPGS_PEGASUS, 5),
    (date(2026, 9, 21), TPGS_PEGASUS, 3),
    (date(2026, 9, 21), LJM, 2),
    (date(2026, 9, 22), TPGS_PEGASUS, 5),
    (date(2026, 9, 23), TPGS_PEGASUS, 9),
    (date(2026, 9, 23), LJM, 0.5),
    (date(2026, 9, 24), H2O_CARE, 2.5),
    (date(2026, 9, 24), TPGS_PEGASUS, 10),
    (date(2026, 9, 25), TPGS_PEGASUS, 5),
    (date(2026, 9, 28), TPGS_PEGASUS, 1),
    (date(2026, 9, 29), TPGS_PEGASUS, 1.5),
    (date(2026, 9, 30), TPGS_PEGASUS, 9),
]

assert abs(sum(e[2] for e in ENTRIES) - 106) < 1e-9, "totals don't match the table"


def run():
    db = SessionLocal()
    try:
        old = db.query(TimeEntry).filter(
            TimeEntry.user_id == PRIYANSHI,
            TimeEntry.project_id.in_([TPGS_PEGASUS, H2O_CARE]),
            TimeEntry.date.in_([date(2026, 9, 3), date(2026, 9, 4)]),
        ).all()
        print(f"Deleting {len(old)} pre-existing (incorrect) entries for 09-03/09-04")
        for o in old:
            db.delete(o)
        db.flush()

        for d, project_id, hours in ENTRIES:
            db.add(TimeEntry(
                id=str(uuid.uuid4()),
                user_id=PRIYANSHI,
                project_id=project_id,
                role_id=None,
                date=d,
                hours=hours,
                billable=True,
                status="normal",
            ))
        db.commit()
        print(f"Created {len(ENTRIES)} entries, {sum(e[2] for e in ENTRIES)}h total.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
