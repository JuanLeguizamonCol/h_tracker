FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libjpeg-dev libpng-dev libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY Backend/requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

COPY Backend/ .
# assets/ (invoice logos, legacy signature fallbacks) lives at the repo root,
# a sibling of Backend/ — baked in here so it's actually present in the built
# image. Locally, docker-compose's `./assets:/app/assets:ro` volume shadows
# this with the live host copy so edits don't need a rebuild; in Azure there
# is no such mount, so without this COPY the image would have no assets/ dir
# at all and every invoice's logo would silently fall back to plain text.
COPY assets/ ./assets/

# invoice_config.py falls back to computing ASSETS_DIR as two directories up
# from its own file (services/../../assets) — correct when running from the
# repo source tree (Backend/services/../../ = repo root), but wrong in this
# image: `COPY Backend/ .` flattens Backend/'s contents straight into /app,
# so services/ ends up only one level below /app, not two below the repo
# root. That relative math then lands on /assets (doesn't exist) instead of
# the /app/assets copied above — silently falling back to text instead of
# the logo in every invoice PDF. Set it explicitly so the container never
# depends on that path arithmetic.
ENV ASSETS_DIR=/app/assets

RUN mkdir -p /app/uploads

EXPOSE 8000

# --proxy-headers + --forwarded-allow-ips=*: trust the Container Apps HTTPS
# ingress so uvicorn honours X-Forwarded-Proto. Without this, FastAPI's
# trailing-slash redirects (e.g. /user-roles -> /user-roles/) are emitted as
# http:// and the browser blocks them as mixed content on the https frontend.
CMD ["sh", "-c", "python -m jobs.init_db && python -m jobs.bootstrap_admin && uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
