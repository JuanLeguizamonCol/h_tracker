"""
Central configuration for PDF invoice generation.

To add a new signatory:
  1. Add their signature PNG to /assets/signatures/
  2. Add an entry to SIGNATURE_FILES below.
  3. Add them to COMPANY_SIGNATORIES under the correct company.
  4. Rebuild the backend container.
"""

import os

# ── Asset paths ──────────────────────────────────────────────────────────────
# In the Docker container, assets are mounted at /app/assets.
# In local dev (running directly), fall back to a sibling /assets/ directory.
_HERE = os.path.dirname(__file__)
ASSETS_DIR = os.environ.get("ASSETS_DIR") or os.path.join(_HERE, "../../assets")
SIGNATURES_DIR = os.path.join(ASSETS_DIR, "signatures")
LOGOS_DIR = os.path.join(ASSETS_DIR, "logos")
LOGO_FILE = os.path.join(LOGOS_DIR, "logo_ipc.png")  # legacy / default

# ── Signatory → filename mapping (all companies) ─────────────────────────────
SIGNATURE_FILES: dict[str, str] = {
    "Claus Johann Mayer": "signature_claus.png",
    "Jorge Castellote":   "signature_jorge.png",
    "Jose Mino":          "signature_jose.png",
    "Craig Harwerth":     "signature_craig.png",
    "Tim Dunworth":       "signature_tim.png",
}

# ── Per-company signatory lists ───────────────────────────────────────────────
COMPANY_SIGNATORIES: dict[str, list[dict]] = {
    "IPC": [
        {"name": "Claus Johann Mayer", "title": "Managing Partner"},
        {"name": "Jorge Castellote",   "title": "Managing Partner"},
        {"name": "Craig Harwerth",     "title": "Senior Partner"},
        {"name": "Tim Dunworth",       "title": "Partner"},
    ],
    "PI": [
        {"name": "Jose Mino", "title": "Managing Director"},
    ],
}

# Flat list of all signatory names (for backwards compat)
SIGNATORIES: list[str] = list(SIGNATURE_FILES.keys())

# ── Company profiles ──────────────────────────────────────────────────────────
COMPANY_PROFILES: dict[str, dict] = {
    "IPC": {
        "name":           "Impact Point Co.",
        "legal_name":     "Impact Point Co., LLC",
        "address":        "104 Crandon Blvd., Suite #404",
        "city_state_zip": "Key Biscayne, FL, 33149",
        "phone":          "+1 (786) 208 - 0588",
        "logo_file":      os.path.join(LOGOS_DIR, "logo_ipc.png"),
        "bank": {
            "bank_name":      "Capital One",
            "aba":            "065000090",
            "account_name":   "Impact Point Co., LLC",
            "account_number": "3316971352",
        },
    },
    "PI": {
        "name":           "Pegasus Insights",
        "legal_name":     "Pegasus Insights LLC",
        "address":        "",
        "city_state_zip": "",
        "phone":          "",
        # Pegasus has no separate logo file — both companies bill under the
        # same Impact Point logo.
        "logo_file":      LOGO_FILE,
        "bank": {
            "bank_name":      "",
            "aba":            "",
            "account_name":   "Pegasus Insights LLC",
            "account_number": "",
        },
    },
}

# ── Legacy aliases (kept for backwards compatibility) ─────────────────────────
COMPANY_INFO: dict[str, str] = COMPANY_PROFILES["IPC"]
BANK_INFO: dict[str, str] = COMPANY_PROFILES["IPC"]["bank"]
