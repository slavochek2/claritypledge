# Multi-stage build for the transcription pipeline service
# GPU-capable base image for production; works on CPU for local dev

# Stage 1: Dependencies (cached layer)
# Base pinned by index digest (nvidia/cuda:12.1.0-runtime-ubuntu22.04 as resolved 2026-10-25; the amd64
# manifest is selected from it). Bump deliberately: docker buildx imagetools inspect <tag>
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04@sha256:402700b179eb764da6d60d99fe106aa16c36874f7d7fb3e122251ff6aea8b2f7 AS deps

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps: Python 3.11 + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Make python3.11 the default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

WORKDIR /app

# Install Python dependencies (cached unless requirements.txt changes).
# requirements.txt is the hash-locked file generated from requirements.in for Python 3.11 / linux x86_64
# (scripts/lock-python-services.sh); --require-hashes makes pip refuse any package or file not listed.
# python3.11 -m pip names the interpreter explicitly instead of trusting what `pip` resolves to.
# build-requirements.txt (pip, setuptools, wheel; hash-locked) goes first: openai-whisper and docopt exist
# only as source archives, and Ubuntu 22.04's pip 22.0.2 cannot build the former in an isolated env.
# With the hashed tools installed, --no-build-isolation builds them without fetching unhashed build deps.
COPY build-requirements.txt requirements.txt ./
RUN python3.11 -m pip install --no-cache-dir --require-hashes -r build-requirements.txt \
    && python3.11 -m pip install --no-cache-dir --require-hashes --no-build-isolation -r requirements.txt

# Pre-download Whisper model at build time to avoid fragile runtime downloads.
# Without this, every cold start downloads 1.5GB from HuggingFace CDN,
# which fails intermittently (SHA256 checksum mismatch).
RUN python -c "import whisper; whisper.load_model('large-v3-turbo', download_root='/app/models')"
ENV WHISPER_CACHE_DIR=/app/models

# Stage 2: Application code
FROM deps AS app

WORKDIR /app

# Copy pre-downloaded model from deps stage
COPY --from=deps /app/models /app/models
ENV WHISPER_CACHE_DIR=/app/models

# Copy application code
COPY *.py ./

# Cloud Run expects port 8080
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

# Create non-root user (with a real home dir — HF/pyannote write model caches
# under $HOME; `useradd -r` alone registers the home path but never creates it,
# which fails at runtime with Errno 13 once the container stopped running as root)
RUN useradd -r -m -d /home/appuser -s /bin/false appuser && chown -R appuser:appuser /app
USER appuser

CMD ["python", "main.py"]
