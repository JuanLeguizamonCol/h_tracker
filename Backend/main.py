import os
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from utils.auth_jwt import get_current_employee

# Import routers
from routers.auth import auth_router
from routers.clients import clients_router
from routers.employees import employees_router
from routers.projects import projects_router
from routers.project_roles import project_roles_router
from routers.user_roles import user_roles_router
from routers.employee_projects import employee_projects_router
from routers.time_entries import time_entries_router
from routers.invoice import invoice_router
from routers.invoice_lines import invoice_lines_router
from routers.invoice_manual_lines import invoice_manual_lines_router
from routers.invoice_fees import invoice_fees_router
from routers.invoice_fee_attachments import invoice_fee_attachments_router
from routers.invoice_time_entries import invoice_time_entries_router
from routers.invoice_expenses import invoice_expenses_router
from routers.expensify import expensify_router
from routers.freshsales import freshsales_router
from routers.skill_catalog import skill_catalog_router
from routers.notifications import notifications_router
from routers.invoice_hours_on_hold import on_hold_router
from routers.profile import profile_router

# Import all models so Base.metadata sees them
import models  # noqa - imports all models via __init__.py

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Impact Point Hours Tracker", version="0.0.2")

# CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# JWT auth dependency applied to all protected routers
auth_deps = [Depends(get_current_employee)]

# ---------- Routers ----------
app.include_router(auth_router)  # public — login / register
app.include_router(clients_router, dependencies=auth_deps)
app.include_router(employees_router, dependencies=auth_deps)
app.include_router(projects_router, dependencies=auth_deps)
app.include_router(project_roles_router, dependencies=auth_deps)
app.include_router(user_roles_router, dependencies=auth_deps)
app.include_router(employee_projects_router, dependencies=auth_deps)
app.include_router(time_entries_router, dependencies=auth_deps)
app.include_router(invoice_router, dependencies=auth_deps)
app.include_router(invoice_lines_router, dependencies=auth_deps)
app.include_router(invoice_manual_lines_router, dependencies=auth_deps)
app.include_router(invoice_fees_router, dependencies=auth_deps)
app.include_router(invoice_fee_attachments_router, dependencies=auth_deps)
app.include_router(invoice_time_entries_router, dependencies=auth_deps)
app.include_router(invoice_expenses_router, dependencies=auth_deps)
app.include_router(expensify_router, dependencies=auth_deps)
app.include_router(freshsales_router, dependencies=auth_deps)
app.include_router(skill_catalog_router, dependencies=auth_deps)
app.include_router(notifications_router, dependencies=auth_deps)
app.include_router(on_hold_router, dependencies=auth_deps)
app.include_router(profile_router, dependencies=auth_deps)


# ---------- Health check ----------
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


# NOTE: Schema creation/migration is handled at startup by `jobs/init_db.py`
# (see backend.Dockerfile CMD), which runs before this module is imported.
# We intentionally do NOT call Base.metadata.create_all here — that ran on every
# import and could silently mask a missing migration.

# NOTE: Scheduled invoice generation no longer runs in this web process.
# It runs as a standalone Azure Container Apps Job (single replica, cron trigger)
# via `python -m jobs.generate_invoices`. Running it here would execute once per
# replica and risk duplicate invoices under horizontal scaling.
