# Build context is the REPO ROOT, not api/, because the package is imported as
# `api.main` and needs to sit under a directory of that name:
#
#   docker build -f api/Dockerfile -t geovision-api .

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Dependencies first, so code changes do not invalidate the install layer.
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api ./api

# Artifacts belong on a mounted volume; without one they vanish on redeploy.
ENV GEOVISION_STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage
VOLUME ["/data/storage"]

EXPOSE 8000

# Shell form on purpose, so ${PORT} expands. Render (and most container hosts)
# inject the port to listen on; the exec form would pass the literal string.
# Bind all interfaces: inside a container 127.0.0.1 is unreachable from outside.
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}
