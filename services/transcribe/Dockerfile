# Multi-stage build for the transcription pipeline service
# GPU-capable base image for production; works on CPU for local dev

# Stage 1: Dependencies (cached layer)
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04 AS deps

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

# Install Python dependencies (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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

CMD ["python", "main.py"]
