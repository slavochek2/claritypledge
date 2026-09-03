"""
P1236 Step-1 measurement service — NOT the transcription pipeline.

Cloud Run *jobs* have no GPU flag in gcloud 581 (checked 2026-09-03), so the L4
measurement has to run behind an HTTP surface. This is a throwaway service:
deploy it, POST /measure, GET /result, record the numbers, delete it. It is
deployed under its own name so `transcribe-session` is never touched.

The measurement outlives its HTTP request on purpose. First attempt lost a
completed run twice over: `gcloud run services proxy` drops the connection at
60s, and the pipeline's service account is (correctly) read-only on the audio
bucket, so the result could not be persisted there either. So: POST starts a
background thread and returns immediately, GET /result collects it, and the
whole JSON is also written to stdout — Cloud Logging is then a third copy that
survives the instance.

Deployed with --no-allow-unauthenticated; callers need an identity token.
"""

import json
import logging
import os
import threading

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from measure_chunks import fetch_gcs, run_measurement

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="P1236 measurement", version="0.2.0")

_STATE: dict = {"status": "idle", "result": None, "error": None}
_LOCK = threading.Lock()


class MeasureRequest(BaseModel):
    gcs_wav: str
    chunk_seconds: int = 4
    apply_vad: bool = False


def _run(gcs_wav: str, chunk_seconds: int, apply_vad: bool) -> None:
    try:
        wav = fetch_gcs(gcs_wav)
        result = run_measurement(wav, chunk_seconds, apply_vad=apply_vad)
        # Log before storing: if the instance dies holding the only in-memory
        # copy, the log line is still the record.
        logger.info("P1236_RESULT_BEGIN %s P1236_RESULT_END", json.dumps(result))
        with _LOCK:
            _STATE.update(status="done", result=result, error=None)
    except Exception as e:
        logger.error("measure failed: %s", e, exc_info=True)
        with _LOCK:
            _STATE.update(status="failed", error=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "p1236-measure"}


@app.post("/measure")
async def measure(req: MeasureRequest):
    with _LOCK:
        if _STATE["status"] == "running":
            return {"status": "running", "note": "a measurement is already in flight"}
        _STATE.update(status="running", result=None, error=None)
    logger.info("measure: %s chunk_seconds=%s apply_vad=%s",
                req.gcs_wav, req.chunk_seconds, req.apply_vad)
    threading.Thread(target=_run,
                     args=(req.gcs_wav, req.chunk_seconds, req.apply_vad),
                     daemon=True).start()
    return {"status": "running", "chunk_seconds": req.chunk_seconds,
            "apply_vad": req.apply_vad}


@app.get("/result")
async def result():
    with _LOCK:
        return dict(_STATE)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
