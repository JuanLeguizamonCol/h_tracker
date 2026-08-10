"""
Validation of Microsoft Entra ID (Azure AD) id_tokens for the Impact Point tenant.

Used only by POST /auth/login/entra (routers/auth.py) as a one-time credential
check at login: once the id_token is verified, we issue our own internal JWT
(create_access_token) and everything downstream (get_current_employee, roles,
etc.) works exactly as it does for password login.
"""
import os
import time
import logging

import httpx
from fastapi import HTTPException, status
from jose import jwt, JWTError
from jose.exceptions import JWTClaimsError

logger = logging.getLogger(__name__)

ENTRA_TENANT_ID = os.getenv("ENTRA_TENANT_ID", "")
ENTRA_CLIENT_ID = os.getenv("ENTRA_CLIENT_ID", "")

_JWKS_URL_TMPL = "https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
_JWKS_TTL_SECONDS = 24 * 60 * 60

_jwks_cache: dict | None = None
_jwks_cached_at: float = 0.0


def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cached_at
    now = time.time()
    if _jwks_cache is None or (now - _jwks_cached_at) > _JWKS_TTL_SECONDS:
        url = _JWKS_URL_TMPL.format(tenant=ENTRA_TENANT_ID)
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cached_at = now
    return _jwks_cache


def verify_entra_id_token(id_token: str) -> dict:
    """Verify signature, issuer, audience and expiry of an Entra ID id_token.

    Returns the decoded claims on success, raises HTTPException(401) otherwise.
    """
    if not ENTRA_TENANT_ID or not ENTRA_CLIENT_ID:
        logger.error("ENTRA_TENANT_ID / ENTRA_CLIENT_ID are not configured.")
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft sign-in is not configured on this server",
        )

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Microsoft sign-in token",
    )

    try:
        unverified_header = jwt.get_unverified_header(id_token)
    except JWTError:
        raise unauthorized

    kid = unverified_header.get("kid")
    jwks = _get_jwks()
    key_dict = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key_dict is None:
        # Keys may have rotated — force a refresh once and retry before giving up.
        global _jwks_cache
        _jwks_cache = None
        jwks = _get_jwks()
        key_dict = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if key_dict is None:
            raise unauthorized

    try:
        claims = jwt.decode(
            id_token,
            key_dict,
            algorithms=["RS256"],
            audience=ENTRA_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0",
        )
    except (JWTError, JWTClaimsError):
        raise unauthorized

    return claims
