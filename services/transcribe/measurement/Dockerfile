# P1236 Step-1 measurement image — throwaway, deleted after the numbers are recorded.
#
# Layered on the EXACT production image so the timings come from the same Whisper
# build and CUDA stack that runs in prod. Nothing here is imported by the pipeline.
FROM gcr.io/gen-lang-client-0869694595/transcribe-session:p858-cutover-3
USER root
COPY measure_chunks.py measure_server.py /app/
RUN chown appuser:appuser /app/measure_chunks.py /app/measure_server.py
USER appuser
WORKDIR /app
ENV PORT=8080
CMD ["python", "measure_server.py"]
