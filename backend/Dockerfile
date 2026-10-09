# PlugOrbit Admin API: build with `docker build -t plugorbit-admin-api backend/`
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Never bake credentials into the image: on Cloud Run use workload identity (no key file) or mount the
# key from Secret Manager and set FIREBASE_CREDENTIALS_PATH.
ENV ENVIRONMENT=production DATA_BACKEND=firestore ADMIN_DEV_AUTH=false

RUN useradd --system --uid 10001 api
USER api

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
