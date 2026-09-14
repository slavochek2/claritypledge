# P1307: transcribe-room-batch — CPU-only. ffmpeg decodes the archived WebM runs; Gemini does
# the transcription over HTTPS, so there is no model to bake into the image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

ENV PORT=8080
EXPOSE 8080

RUN useradd -r -m -d /home/appuser -s /bin/false appuser && chown -R appuser:appuser /app
USER appuser

CMD ["python", "main.py"]
