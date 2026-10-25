# P1307: transcribe-room-batch — CPU-only. ffmpeg decodes the archived WebM runs; Gemini does
# the transcription over HTTPS, so there is no model to bake into the image.
# Base pinned by index digest (python:3.12-slim as resolved 2026-10-25; multi-arch, so Cloud Run's amd64
# image is selected from it). Bump deliberately: docker buildx imagetools inspect python:3.12-slim
FROM python:3.12-slim@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# requirements.txt is the hash-locked file generated from requirements.in (scripts/lock-python-services.sh);
# --require-hashes makes pip refuse any package or file whose hash is not listed.
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY *.py ./

ENV PORT=8080
EXPOSE 8080

RUN useradd -r -m -d /home/appuser -s /bin/false appuser && chown -R appuser:appuser /app
USER appuser

CMD ["python", "main.py"]
