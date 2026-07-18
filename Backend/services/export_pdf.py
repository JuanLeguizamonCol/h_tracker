"""
PDF invoice generator using xhtml2pdf (HTML → PDF).

Produces a 2-page PDF:
  Page 1 — Cover letter with logo, client address, body text, and signature.
  Page 2 — Invoice detail: period, fees table, total-due box, ACH instructions.
"""

import base64
import logging
import os
import re
from io import BytesIO
from datetime import date, datetime
from typing import Optional

from xhtml2pdf import pisa

from services.invoice_config import (
    ASSETS_DIR, SIGNATURES_DIR, LOGOS_DIR, LOGO_FILE,
    SIGNATURE_FILES, COMPANY_INFO, BANK_INFO, COMPANY_PROFILES,
)

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_currency(value: float) -> str:
    """Format as $1,234.56 — negative values as ($1,234.56)."""
    if value < 0:
        return f"(${abs(value):,.2f})"
    return f"${value:,.2f}"


def _format_date_long(d) -> str:
    """Format as 'December 30, 2025' (no leading zero on day)."""
    if not d:
        return ""
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d)
        except ValueError:
            return d
    if isinstance(d, (date, datetime)):
        # %-d removes leading zero on Linux; %#d on Windows — use lstrip
        return d.strftime("%B {day}, %Y").replace("{day}", str(d.day))
    return str(d)


def _sanitize_filename(name: str) -> str:
    """Make a string safe for use in file/path names."""
    return re.sub(r'[^\w\-]', '_', name).strip('_')


def _get_image_base64(filepath: str) -> Optional[str]:
    """Read an image file and return a base64 data-URI string, or None if missing."""
    try:
        if not os.path.isfile(filepath):
            return None
        with open(filepath, "rb") as f:
            data = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(filepath)[1].lstrip(".").lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/png")
        return f"data:{mime};base64,{data}"
    except Exception as exc:
        logger.warning("Could not read image %s: %s", filepath, exc)
        return None


def _get_signature_base64(signatory_name: str) -> Optional[str]:
    """Look up the signature file for a signatory and return base64 data-URI."""
    filename = SIGNATURE_FILES.get(signatory_name)
    if filename:
        path = os.path.join(SIGNATURES_DIR, filename)
        result = _get_image_base64(path)
        if result:
            return result
    # Fallback
    fallback = os.path.join(SIGNATURES_DIR, "signature_default.png")
    return _get_image_base64(fallback)


# ── HTML Template ─────────────────────────────────────────────────────────────

_INVOICE_HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice {invoice_number}</title>
  <style>
    @page {{
      size: letter;
      margin: 0.75in;
    }}

    body {{
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      color: #000;
      line-height: 1.4;
    }}

    .page {{
      page-break-after: always;
    }}

    .page-last {{
      page-break-after: avoid;
    }}

    .logo-img img {{
      height: 45pt;
    }}

    .address-cell {{
      font-size: 9pt;
      color: #666;
      line-height: 1.6;
    }}

    .invoice-title {{
      text-align: center;
      font-family: Arial, sans-serif;
      font-size: 11pt;
      font-weight: bold;
      margin: 20pt 0 8pt 0;
    }}

    .invoice-date {{
      text-align: center;
      font-size: 11pt;
      margin-bottom: 25pt;
    }}

    .client-info {{
      margin-bottom: 20pt;
      line-height: 1.6;
    }}

    .greeting {{
      margin-bottom: 18pt;
    }}

    .body-text {{
      margin-bottom: 15pt;
    }}

    .signature-section {{
      margin-top: 25pt;
    }}

    .sincerely {{
      margin-bottom: 12pt;
    }}

    .signature-img img {{
      height: 40pt;
    }}

    .signature-name {{
      margin-top: 12pt;
    }}

    .total-box {{
      font-weight: bold;
      background-color: #FFFFCC;
      border-top: 1pt solid #000;
      border-bottom: 2pt solid #000;
      padding: 5pt 8pt;
    }}

    .ach-section {{
      margin-top: 50pt;
    }}

    .ach-title {{
      font-style: italic;
      font-size: 10pt;
      margin-bottom: 15pt;
    }}

    .text-right {{
      text-align: right;
    }}
  </style>
</head>
<body>

<!-- PAGE 1: COVER LETTER -->
<div class="page">

  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:30pt;">
    <tr>
      <td align="left" valign="top" class="logo-img">{logo_img}</td>
      <td align="right" valign="top" class="address-cell">
        {company_address}<br/>
        {company_city_state_zip}<br/>
        {company_phone}
      </td>
    </tr>
  </table>

  <div class="invoice-title">Invoice {invoice_number}</div>
  <div class="invoice-date">{invoice_date}</div>

  <div class="client-info">
    {client_contact}<br/>
    {client_title}<br/>
    {client_company}<br/>
    {client_address}<br/>
    {client_city_state_zip}
  </div>

  <div class="greeting">Dear {greeting}</div>

  <div class="body-text">
    Attached, please find our invoice for services rendered during the period from {period_from} through {period_to}.
  </div>

  <div class="body-text">
    Please do not hesitate to contact me with any questions.
  </div>

  <div class="signature-section">
    <div class="sincerely">Sincerely,</div>
    <div class="signature-img">{signature_img}</div>
    <div class="signature-name">{signatory_name}</div>
    <div>{signatory_title}</div>
  </div>

</div>

<!-- PAGE 2: INVOICE DETAIL -->
<div class="page-last">

  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:30pt;">
    <tr>
      <td align="left" valign="top" class="logo-img">{logo_img}</td>
      <td align="right" valign="top" class="address-cell">
        {company_address}<br/>
        {company_city_state_zip}<br/>
        {company_phone}
      </td>
    </tr>
  </table>

  <div class="invoice-title">Invoice {invoice_number}</div>
  <div class="invoice-date">{invoice_date}</div>

  <div class="client-info">
    {client_contact}<br/>
    {client_title}<br/>
    {client_company}<br/>
    {client_address}<br/>
    {client_city_state_zip}
  </div>

  <table width="100%" border="0" cellpadding="3" cellspacing="0" style="margin-bottom:25pt;">
    <tr>
      <td width="15%" align="left">for the period</td>
      <td width="85%" align="center">{period_from}</td>
    </tr>
    <tr>
      <td width="15%" align="left">through</td>
      <td width="85%" align="center">{period_to}</td>
    </tr>
  </table>

  <!-- FEES TABLE con anchos HTML directos -->
  <table width="100%" border="0" cellpadding="6" cellspacing="0">
    <tr style="border-bottom:1pt solid #000;">
      <th width="32%" align="left" style="border-bottom:1pt solid #000;">Fees:</th>
      <th width="12%" align="center" style="border-bottom:1pt solid #000;">Hourly Rate</th>
      <th width="10%" align="center" style="border-bottom:1pt solid #000;">Hours</th>
      <th width="15%" align="right" style="border-bottom:1pt solid #000;">Subtotal</th>
      <th width="15%" align="right" style="border-bottom:1pt solid #000;">Discount</th>
      <th width="16%" align="right" style="border-bottom:1pt solid #000;">Total</th>
    </tr>
    {professional_rows}
    <tr>
      <td colspan="6" style="border-bottom:1.5pt solid #000; padding-top:10pt;"></td>
    </tr>
    <tr>
      <td width="32%" align="left" style="padding-left:15pt; padding-top:10pt;">Total Fees Due</td>
      <td width="12%"></td>
      <td width="10%"></td>
      <td width="15%" align="right" style="padding-top:10pt;">{total_fees}</td>
      <td width="15%" align="right" style="padding-top:10pt;">{total_discount}</td>
      <td width="16%" align="right" style="padding-top:10pt;">{total_after_discount}</td>
    </tr>
    {cap_row}
    <tr>
      <td width="32%"></td>
      <td width="12%"></td>
      <td width="10%"></td>
      <td width="15%"></td>
      <td width="15%" align="right" style="font-weight:bold; padding-top:15pt;">TOTAL DUE UPON RECEIPT</td>
      <td width="16%" align="right" class="total-box" style="padding-top:15pt;">{total_due}</td>
    </tr>
  </table>

  <div class="ach-section">
    <div class="ach-title">ACH Instructions</div>
    <table width="100%" border="0" cellpadding="3" cellspacing="0">
      <tr>
        <td width="50%"></td>
        <td width="25%" align="right" style="font-weight:bold;">Bank:</td>
        <td width="25%" align="left">{bank_name}</td>
      </tr>
      <tr>
        <td width="50%"></td>
        <td width="25%" align="right" style="font-weight:bold;">ABA:</td>
        <td width="25%" align="left">{bank_aba}</td>
      </tr>
      <tr>
        <td width="50%"></td>
        <td width="25%" align="right" style="font-weight:bold;">Account Name:</td>
        <td width="25%" align="left">{bank_account_name}</td>
      </tr>
      <tr>
        <td width="50%"></td>
        <td width="25%" align="right" style="font-weight:bold;">Account Number:</td>
        <td width="25%" align="left">{bank_account_number}</td>
      </tr>
    </table>
  </div>

</div>

</body>
</html>
'''


# ── Template data builder ─────────────────────────────────────────────────────

def _build_professional_rows(lines: list) -> tuple[str, float, float, float]:
    """
    Build HTML <tr> rows for the fees table.
    Returns (html_rows, total_subtotal, total_discount_dollars, total_after_discount).
    """
    rows_html = []
    total_subtotal = 0.0
    total_discount = 0.0
    total_net = 0.0

    for line in lines:
        hours = float(line.get("hours", 0) or 0)
        rate = float(line.get("hourly_rate", 0) or line.get("rate_snapshot", 0) or 0)
        subtotal = hours * rate

        disc_type = line.get("discount_type") or "amount"
        disc_val = float(line.get("discount_value", 0) or 0)
        disc_dollars = (subtotal * disc_val / 100) if disc_type == "percent" else disc_val
        net = max(0.0, subtotal - disc_dollars)

        total_subtotal += subtotal
        total_discount += disc_dollars
        total_net += net

        name = line.get("employee_name") or line.get("person_name") or "—"
        role = line.get("title") or line.get("role_name") or ""
        name_cell = f"{name}" + (f"<br/><small style='color:#555'>{role}</small>" if role else "")

        disc_label = _format_currency(disc_dollars) if disc_dollars > 0 else "—"

        rows_html.append(
            f"<tr>"
            f"<td width='32%'>{name_cell}</td>"
            f"<td width='12%' align='center'>{_format_currency(rate)}</td>"
            f"<td width='10%' align='center'>{hours:.2f}</td>"
            f"<td width='15%' align='right'>{_format_currency(subtotal)}</td>"
            f"<td width='15%' align='right'>{disc_label}</td>"
            f"<td width='16%' align='right'><b>{_format_currency(net)}</b></td>"
            f"</tr>"
        )

    return "".join(rows_html), total_subtotal, total_discount, total_net


def generate_invoice_html(edit_data: dict) -> str:
    """Fill the HTML template with invoice data and return the complete HTML string."""
    invoice = edit_data.get("invoice", {})
    client = edit_data.get("client") or {}
    lines = edit_data.get("lines", [])
    expenses = edit_data.get("expenses", [])

    # ── Invoice fields ────────────────────────────────────────────────────────
    invoice_number = invoice.get("invoice_number") or invoice.get("id", "")[:8]
    invoice_date = _format_date_long(invoice.get("issue_date"))
    period_from = _format_date_long(invoice.get("period_start")) or invoice_date
    period_to = _format_date_long(invoice.get("period_end")) or _format_date_long(invoice.get("due_date")) or invoice_date

    signatory_name = invoice.get("signatory_name") or ""
    signatory_title = invoice.get("signatory_title") or ""

    # ── Client fields ─────────────────────────────────────────────────────────
    client_company = client.get("name") or "—"
    client_contact = client.get("manager_name") or client.get("name") or "—"
    client_title = client.get("job_title") or client.get("manager_title") or ""

    addr1 = client.get("street_address_1") or ""
    addr2 = client.get("street_address_2") or ""
    client_address = ", ".join(part for part in [addr1, addr2] if part) or client.get("address") or ""
    city = client.get("city") or ""
    state = client.get("state") or ""
    zip_ = client.get("zip") or ""
    client_city_state_zip = ", ".join(part for part in [city, state] if part)
    if zip_:
        client_city_state_zip = f"{client_city_state_zip} {zip_}".strip(", ")

    # Salutation: contact name + colon  →  "Dear John Smith:"
    greeting = f"{client_contact}:"

    # ── Company profile ───────────────────────────────────────────────────────
    owner_company = invoice.get("owner_company") or "IPC"
    profile = COMPANY_PROFILES.get(owner_company, COMPANY_PROFILES["IPC"])
    bank = profile["bank"]

    company_address = profile["address"]
    company_city_state_zip = profile["city_state_zip"]
    company_phone = profile["phone"]

    # ── Logo ──────────────────────────────────────────────────────────────────
    logo_file = profile.get("logo_file") or LOGO_FILE
    logo_uri = _get_image_base64(logo_file)
    if logo_uri is None and owner_company != "IPC":
        logger.warning("⚠️ %s not found in assets/logos/ — using text fallback", logo_file)
    if logo_uri:
        logo_img = f'<img src="{logo_uri}" alt="Logo"/>'
    else:
        logo_img = f'<span style="font-weight:bold; font-size:12pt;">{profile["name"]}</span>'

    # ── Signature ─────────────────────────────────────────────────────────────
    sig_uri = _get_signature_base64(signatory_name) if signatory_name else None
    signature_img = f'<img src="{sig_uri}" alt="Signature"/>' if sig_uri else ""

    # ── Fee rows ──────────────────────────────────────────────────────────────
    all_lines = list(lines)
    # Also include manual lines if present
    for ml in edit_data.get("manual_lines", []):
        all_lines.append({
            "employee_name": ml.get("person_name") or ml.get("employee_name") or "—",
            "title": ml.get("description") or "",
            "hours": ml.get("hours") or 0,
            "hourly_rate": ml.get("rate_usd") or ml.get("rate_snapshot") or 0,
            "discount_value": 0,
        })

    professional_rows, total_fees, total_discount, total_net = _build_professional_rows(all_lines)
    if not professional_rows:
        professional_rows = "<tr><td colspan='6' style='text-align:center;color:#999'>No line items</td></tr>"

    # Total including expenses
    total_expenses = sum(float(e.get("amount_usd", 0) or 0) for e in expenses)
    cap = invoice.get("cap_amount")
    capped_fees = min(total_net, float(cap)) if cap is not None else total_net
    total_due_val = capped_fees + total_expenses

    # ── Cap row (only shown when a cap actually reduces the fees) ───────────────
    if cap is not None and float(cap) < total_net:
        cap_row = (
            '<tr>'
            '<td width="32%" align="left" style="padding-left:15pt;">Fees Capped At</td>'
            '<td width="12%"></td>'
            '<td width="10%"></td>'
            '<td width="15%"></td>'
            '<td width="15%"></td>'
            f'<td width="16%" align="right">{_format_currency(capped_fees)}</td>'
            '</tr>'
        )
    else:
        cap_row = ""

    return _INVOICE_HTML_TEMPLATE.format(
        # Header / logo + company
        logo_img=logo_img,
        company_address=company_address,
        company_city_state_zip=company_city_state_zip,
        company_phone=company_phone,
        # Invoice meta
        invoice_number=invoice_number,
        invoice_date=invoice_date or "—",
        period_from=period_from or "—",
        period_to=period_to or "—",
        # Client
        client_company=client_company,
        client_contact=client_contact,
        client_title=client_title,
        client_address=client_address,
        client_city_state_zip=client_city_state_zip,
        greeting=greeting,
        # Signature
        signature_img=signature_img,
        signatory_name=signatory_name or "—",
        signatory_title=signatory_title or "—",
        # Fees
        professional_rows=professional_rows,
        total_fees=_format_currency(total_fees + total_discount),
        total_discount=_format_currency(total_discount),
        total_after_discount=_format_currency(total_net),
        cap_row=cap_row,
        total_due=_format_currency(total_due_val),
        # ACH
        bank_name=bank["bank_name"],
        bank_aba=bank["aba"],
        bank_account_name=bank["account_name"],
        bank_account_number=bank["account_number"],
    )


def html_to_pdf(html_content: str) -> bytes:
    """Convert an HTML string to PDF bytes using xhtml2pdf."""
    buf = BytesIO()
    result = pisa.CreatePDF(html_content, dest=buf, encoding="UTF-8")
    if result.err:
        raise RuntimeError(f"xhtml2pdf error code {result.err}")
    return buf.getvalue()


def generate_invoice_pdf(edit_data: dict) -> bytes:
    """
    Entry point called by the router.
    Accepts the edit_data dict from _build_edit_data() and returns PDF bytes.
    """
    html = generate_invoice_html(edit_data)
    return html_to_pdf(html)
