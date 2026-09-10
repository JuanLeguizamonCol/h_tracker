"""Shared HTML wrapper for outbound notification emails (utils/email.py::send_email).
Keeps every notifier's markup consistent without each one re-declaring the same
font/width/footer boilerplate. All notification emails are in English.
"""
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")


def wrap_email(heading: str, body_html: str) -> str:
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;">
      <h2 style="margin-bottom:4px;">{heading}</h2>
      {body_html}
      <p style="color:#999;font-size:12px;margin-top:32px;">Automated notification from Horas+ (Impact Point).</p>
    </div>
    """


def action_button(label: str, path: str) -> str:
    """A button linking into the app (e.g. '/invoices/123/edit'). Renders nothing
    if FRONTEND_URL isn't configured, since a relative link would be dead in an
    email client."""
    if not FRONTEND_URL:
        return ""
    url = f"{FRONTEND_URL}{path}"
    return (
        f'<p style="margin-top:20px;">'
        f'<a href="{url}" style="background:#111;color:#fff;padding:10px 18px;'
        f'border-radius:6px;text-decoration:none;font-size:14px;">{label}</a>'
        f"</p>"
    )
