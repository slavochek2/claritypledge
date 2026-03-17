"""
FastAPI app for the transcription pipeline service.

Endpoints:
  POST /transcribe — process a single session by session_code
  POST /poll       — Cloud Scheduler entry: query pending jobs, process one
  GET  /health     — health check
"""

import logging
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import PORT
from pipeline import transcribe_session
from storage import get_pending_job, update_job_status

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
    Cloud Scheduler entry point: process up to MAX_JOBS_PER_POLL pending
    transcription jobs in one request. Amortizes GPU cold start across
    the batch — one cold start instead of one per job.

    Returns immediately if no pending jobs.
    """
    logger.info("Poll: checking for pending jobs...")

    jobs_processed: list[JobResult] = []

    for i in range(MAX_JOBS_PER_POLL):
        job = get_pending_job()
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
