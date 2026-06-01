"""
FastAPI app for the transcription pipeline service.

Endpoints:
  POST /transcribe-async — event-driven trigger landing (Cloud Tasks): atomic claim,
                           return 202, process in the background (P858 — primary path)
  POST /sweep            — janitor (Cloud Scheduler, ~2h): reset stale rows, drain pending
  POST /transcribe       — synchronous single-session run (manual / debug only)
  POST /poll             — DEPRECATED: old Cloud Scheduler batch drain, retained dormant
                           for rollback; no scheduler hits it (P858 Decision 9)
  GET  /health           — health check
"""

import asyncio
import logging
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from config import PORT
from pipeline import transcribe_session
from audio import validate_session_code
from storage import (
    update_job_status,
    claim_pending_job,
    reset_stale_jobs,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ClarityPledge Transcription Service",
    description="Transcribes live session audio with speaker diarization",
    version="1.0.0",
)


class TranscribeRequest(BaseModel):
    session_code: str
    session_id: str
    job_id: Optional[str] = None


class TranscribeAsyncRequest(BaseModel):
    """Cloud Tasks trigger payload. Only `job_id` is TRUSTED (mitigation #3) — the claim
    re-fetches session_code/session_id from the DB row. `session_code`/`session_id` are
    accepted for payload compatibility but are IGNORED; never pass them to the pipeline."""
    job_id: str
    session_code: Optional[str] = None
    session_id: Optional[str] = None


class TranscribeResponse(BaseModel):
    transcript_id: str
    segment_count: int
    language: str
    processing_time_ms: int
    speakers: list[str]


class JobResult(BaseModel):
    job_id: str
    session_code: str
    result: Optional[TranscribeResponse] = None
    error: Optional[str] = None


class PollResponse(BaseModel):
    processed: int
    jobs: list[JobResult] = []


MAX_JOBS_PER_POLL = 10


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "transcribe"}


# Strong references to in-flight background tasks. asyncio only holds a WEAK reference to
# a task, so a fire-and-forget create_task() can be garbage-collected mid-job if nothing
# else references it — silently abandoning a claimed job. Keep the handle until it finishes.
_BACKGROUND_TASKS: set = set()


async def _run_job_in_background(session_code: str, session_id: str, job_id: str) -> None:
    """Run the GPU-bound pipeline OFF the event loop so /health and the keepalive stay
    responsive. transcribe_session does its own failure routing (storage.route_failed_job);
    this except is the backstop log for the re-raise."""
    try:
        await asyncio.to_thread(
            transcribe_session,
            session_code=session_code,
            session_id=session_id,
            job_id=job_id,
        )
    except Exception as e:
        logger.error("Background transcription failed for job %s: %s", job_id, e, exc_info=True)


@app.post("/transcribe-async")
async def transcribe_async(req: TranscribeAsyncRequest):
    """Event-driven trigger landing endpoint (P858 Decisions 2, 3).

    Fire-and-forget: atomically CLAIM the job, return 202 immediately, and process in the
    background. The HTTP response must NOT wait for the multi-minute job — otherwise the
    Cloud Tasks dispatch deadline elapses, the task is redelivered, and the job is processed
    twice. Doing the claim BEFORE returning means a 202 is a real guarantee the job is owned.
    """
    logger.info("transcribe-async: claim request for job %s", req.job_id)

    # Mitigation #3: trust ONLY job_id from the payload. The claim's RETURNING supplies the
    # DB-sourced session fields; payload session_code/session_id are never used.
    claimed = claim_pending_job(job_id=req.job_id)
    if claimed is None:
        # Lost race / already owned / exhausted → clean no-op. Spin NO GPU (cost backstop).
        logger.info("transcribe-async: job %s not claimed (no-op)", req.job_id)
        return JSONResponse(status_code=200, content={"claimed": False})

    session_code = claimed["session_code"]
    session_id = claimed["session_id"]

    # Mitigation #4: validate the DB-sourced code before any GCS prefix is built.
    if not validate_session_code(session_code):
        logger.error("transcribe-async: job %s has invalid session_code %r — failing",
                     claimed["id"], session_code)
        # only_if_status='processing': this instance just won the claim, so the row is ours
        # and 'processing' — fail it without clobbering a row some other state owns.
        update_job_status(claimed["id"], "failed",
                          error_message=f"invalid session_code: {session_code!r}",
                          only_if_status="processing")
        return JSONResponse(status_code=400,
                            content={"claimed": True, "error": "invalid session_code"})

    # Schedule the job off the event loop and return 202 NOW (keepalive-agnostic skeleton;
    # the exact keepalive wiring of Decision 3 is pinned after the UAT-0 disproof experiment).
    # Retain a strong reference so the loop doesn't GC the task before it completes.
    task = asyncio.create_task(_run_job_in_background(session_code, session_id, claimed["id"]))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    logger.info("transcribe-async: job %s claimed (attempt %s) → 202, processing in background",
                claimed["id"], claimed.get("attempts"))
    return JSONResponse(status_code=202, content={"claimed": True, "job_id": claimed["id"]})


@app.post("/sweep")
async def sweep():
    """Janitor (P858 Decision 7). Runs on a ~2h Cloud Scheduler — interval ≫ the ~15-min
    idle window, so it cannot keep the GPU warm (it is NOT a 5-min work-poll). It (a) resets
    stale 'processing' rows (crash recovery — the only caller of the stale-reset now the poll
    is gone), then (b) drains every remaining 'pending' job via the atomic claim: lost-trigger
    leftovers and transient-failure auto-retry rows."""
    logger.info("sweep: reset stale jobs, then drain pending")
    reset_stale_jobs()

    processed = 0
    jobs: list[str] = []
    seen: set = set()
    while True:
        claimed = claim_pending_job()  # oldest pending, atomic
        if claimed is None:
            break
        job_id = claimed["id"]
        # Process each row at most once per sweep. If a transient failure routes a row back
        # to 'pending' (Decision 5), the next claim could re-surface it — defer that retry to
        # the NEXT 2h cycle (retry latency is sweeper-bounded, not burned back-to-back).
        if job_id in seen:
            break
        seen.add(job_id)
        try:
            await asyncio.to_thread(
                transcribe_session,
                session_code=claimed["session_code"],
                session_id=claimed["session_id"],
                job_id=job_id,
            )
            processed += 1
            jobs.append(job_id)
        except Exception as e:
            logger.error("sweep: job %s failed: %s", job_id, e)

    logger.info("sweep: processed %d job(s)", processed)
    return {"processed": processed, "jobs": jobs}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest):
    """
    Transcribe a single session.

    Provide session_code and session_id. Optionally provide job_id
    to update an existing transcription_jobs row.
    """
    logger.info("Received transcribe request for session %s", req.session_code)
    try:
        result = transcribe_session(
            session_code=req.session_code,
            session_id=req.session_id,
            job_id=req.job_id,
        )
        return TranscribeResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Transcription failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/poll", response_model=PollResponse)
async def poll():
    """
    DEPRECATED (P858 Decision 9): the old Cloud Scheduler batch-drain entry point. The
    5-min `transcribe-poll` schedule that drove it held the GPU warm 24/7 (~€659/mo at 0
    jobs) — it is DISABLED and retained only as a rollback path until the event-driven
    path is verified in prod, then deleted (Phase B). No scheduler hits this endpoint.

    Drains via the ATOMIC claim_pending_job() (same synchronization point as
    /transcribe-async and /sweep), so even if this dormant endpoint is invoked it cannot
    double-dispatch a row another path is processing. Removed entirely with the scheduler
    at Phase B.

    Returns immediately if no pending jobs.
    """
    logger.info("Poll: checking for pending jobs...")

    jobs_processed: list[JobResult] = []

    for i in range(MAX_JOBS_PER_POLL):
        job = claim_pending_job()  # atomic claim — flips pending→processing, increments attempts
        if not job:
            break

        job_id = job["id"]
        session_code = job["session_code"]
        session_id = job["session_id"]

        logger.info("Poll: processing job %d/%d — %s (session %s)",
                     i + 1, MAX_JOBS_PER_POLL, job_id, session_code)

        try:
            result = transcribe_session(
                session_code=session_code,
                session_id=session_id,
                job_id=job_id,
            )
            jobs_processed.append(JobResult(
                job_id=job_id,
                session_code=session_code,
                result=TranscribeResponse(**result),
            ))
        except Exception as e:
            logger.error("Poll: job %s failed: %s", job_id, e)
            jobs_processed.append(JobResult(
                job_id=job_id,
                session_code=session_code,
                error=str(e),
            ))

    if not jobs_processed:
        logger.info("Poll: no pending jobs")

    logger.info("Poll: processed %d jobs", len(jobs_processed))
    return PollResponse(processed=len(jobs_processed), jobs=jobs_processed)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
