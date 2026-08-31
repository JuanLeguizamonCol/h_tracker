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

RUN mkdir -p /app/uploads

EXPOSE 8000

# --proxy-headers + --forwarded-allow-ips=*: trust the Container Apps HTTPS
# ingress so uvicorn honours X-Forwarded-Proto. Without this, FastAPI's
# trailing-slash redirects (e.g. /user-roles -> /user-roles/) are emitted as
# http:// and the browser blocks them as mixed content on the https frontend.
CMD ["sh", "-c", "python -m jobs.init_db && python -m jobs.bootstrap_admin && uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
