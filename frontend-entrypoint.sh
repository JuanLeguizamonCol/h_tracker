#!/bin/sh
# =============================================================================
# nginx startup hook (runs from /docker-entrypoint.d/ before nginx starts).
# Regenerates /config.js from the BACKEND_URL env var so the static bundle can
# target the correct backend without being rebuilt. BACKEND_URL is set by the
# Bicep template to the backend Container App's ingress FQDN.
# When BACKEND_URL is empty (e.g. local docker-compose), the app falls back to
# the relative /api path proxied by nginx.
#
# NOTE: this is a hook, not the entrypoint — it must NOT start nginx itself.
# The base image's entrypoint runs it, then starts nginx via the default CMD.
# =============================================================================
set -e

: "${BACKEND_URL:=}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__ENV__ = { API_URL: "${BACKEND_URL}" };
EOF

echo "[config] config.js written with API_URL=\"${BACKEND_URL}\""
