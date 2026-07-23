FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libjpeg-dev libpng-dev libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["sh", "-c", "python -m jobs.init_db && python -m jobs.bootstrap_admin && uvicorn main:app --host 0.0.0.0 --port 8000"]
