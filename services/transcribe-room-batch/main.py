"""
P1307 Decision 5: transcribe-room-batch — the whole-recording pass for transcribe rooms.

A small CPU-only Cloud Run service, dispatched exactly like transcribe-session (P858/P902):
transcribe_room_transcription_jobs INSERT → pg_net → enqueue-room-transcription → Cloud Tasks →
OIDC → POST /process. Access is Cloud Run IAM (the tx-task-invoker service account); there is
no unauthenticated route that does work.

POST /process claims the job atomically BEFORE returning 202 and processes in the background,
so the Cloud Tasks dispatch deadline never causes a second delivery of a job in flight.
POST /sweep is the janitor (Cloud Scheduler): resets stale claims and drains pending jobs that
a lost trigger or a transient failure left behind.
"""

import asyncio
import logging

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import storage
from config import PORT
from pipeline import process_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ClarityPledge Room Transcription Service", version="1.0.0")

# asyncio holds only a weak reference to a task; keep in-flight jobs referenced until they end.
_BACKGROUND_TASKS: set = set()


class ProcessRequest(BaseModel):
    job_id: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "transcribe-room-batch"}


@app.post("/process")
async def process(req: ProcessRequest):
    claimed = storage.claim_job(req.job_id)
    if claimed is None:
        logger.info("process: job %s not claimed (no-op)", req.job_id)
        return JSONResponse(status_code=200, content={"claimed": False})

    task = asyncio.create_task(asyncio.to_thread(process_job, claimed))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    logger.info("process: job %s claimed (attempt %s) → 202", claimed["id"], claimed.get("attempts"))
    return JSONResponse(status_code=202, content={"claimed": True, "job_id": claimed["id"]})


@app.post("/sweep")
async def sweep():
    storage.reset_stale_processing()
    processed: list[str] = []
    seen: set = set()
    while True:
        job_id = storage.oldest_pending_job_id()
        if job_id is None or job_id in seen:
            # A job routed back to pending by a transient failure waits for the next sweep
            # rather than being retried back-to-back.
            break
        seen.add(job_id)
        claimed = storage.claim_job(job_id)
        if claimed is None:
            continue
        await asyncio.to_thread(process_job, claimed)
        processed.append(job_id)
    logger.info("sweep: processed %d job(s)", len(processed))
    return {"processed": len(processed), "jobs": processed}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
