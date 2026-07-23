"""
Send a "set your password" invitation email to an employee.

Builds a signed set-password token, embeds it in a link to the frontend
(/set-password?token=...) and emails it via the Graph API. Best-effort: any
failure is logged and returns False so it never blocks the caller (e.g. user
creation still succeeds even if the mail can't be sent).
"""
import logging
import os

from models.employees import Employee
from utils.auth_jwt import create_password_setup_token
from utils.graph_email import send_email, email_configured

logger = logging.getLogger("invitations")


def _frontend_base_url() -> str:
    # Set by the deploy pipeline to the frontend FQDN; falls back to localhost.
    return (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def _build_html(name: str, link: str) -> str:
    safe_name = name or "there"
    return f"""\
<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">
  <p>Hola {safe_name},</p>
  <p>Se ha creado tu cuenta en <strong>Horas+</strong> (Impact Point Hours Tracker).</p>
  <p>Para activarla, define tu contraseña haciendo clic en el siguiente enlace:</p>
  <p style="margin:24px 0">
    <a href="{link}"
       style="background:#0d6efd;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">
      Establecer mi contraseña
    </a>
  </p>
  <p style="color:#666;font-size:13px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
    <a href="{link}">{link}</a>
  </p>
  <p style="color:#666;font-size:13px">Este enlace expira en 72 horas. Si no esperabas este correo, puedes ignorarlo.</p>
</div>"""


def send_password_setup_invitation(emp: Employee) -> bool:
    """Email the employee a link to set their password. Returns True if sent."""
    if not email_configured():
        logger.warning("Email not configured — invitation for %s not sent.", emp.email)
        return False
    token = create_password_setup_token(emp.id)
    link = f"{_frontend_base_url()}/set-password?token={token}"
    return send_email(
        to_email=emp.email,
        subject="Activa tu cuenta en Horas+ — establece tu contraseña",
        html_body=_build_html(emp.name, link),
        to_name=emp.name,
    )
