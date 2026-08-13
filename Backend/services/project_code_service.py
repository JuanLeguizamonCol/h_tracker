"""
Project code generation service.

Format: "{client_number}-{consecutive}", e.g. "12-1" (client #12's 1st project),
"12-2" (its 2nd), and so on. The consecutive is derived from the highest number
already used by that client's existing project codes — so the first project of a
client defaults to "{client_number}-1".

Requires the client to have a `client_number`. Returns None when it doesn't, in
which case the caller leaves the code blank (it can still be typed manually).
"""
import re
from sqlalchemy.orm import Session

from models.projects import Project
from models.clients import Client

# Captures the trailing "-<digits>" consecutive part of a code.
_CONSECUTIVE_RE = re.compile(r"-(\d+)$")


def _next_consecutive(db: Session, client_id: str, client_number: str) -> int:
    """Highest consecutive already used by this client's project codes, plus one."""
    prefix = f"{client_number}-"
    rows = db.query(Project.project_code).filter(
        Project.client_id == client_id,
        Project.project_code.isnot(None),
    ).all()
    max_n = 0
    for (code,) in rows:
        if code and code.startswith(prefix):
            m = _CONSECUTIVE_RE.search(code)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def preview_project_code(db: Session, client_id: str) -> str | None:
    """Next code for the client without reserving it. None if no client number."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client or not client.client_number:
        return None
    return f"{client.client_number}-{_next_consecutive(db, client_id, client.client_number)}"


# Generation and preview are the same derivation — the code is computed from
# existing project codes, so there is no separate counter to increment.
generate_project_code = preview_project_code
