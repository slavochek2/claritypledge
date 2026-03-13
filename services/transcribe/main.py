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


class PollResponse(BaseModel):
    processed: bool
    job_id: Optional[str] = None
    session_code: Optional[str] = None
    result: Optional[TranscribeResponse] = None
    error: Optional[str] = None


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
    Cloud Scheduler entry point: query for pending transcription jobs
    and process the oldest one.

    Returns immediately if no pending jobs.
    """
    logger.info("Poll: checking for pending jobs...")

    job = get_pending_job()
    if not job:
        logger.info("Poll: no pending jobs")
        return PollResponse(processed=False)

    job_id = job["id"]
    session_code = job["session_code"]
    session_id = job["session_id"]

    logger.info("Poll: processing job %s (session %s)", job_id, session_code)

    try:
        result = transcribe_session(
            session_code=session_code,
            session_id=session_id,
            job_id=job_id,
        )
        return PollResponse(
            processed=True,
            job_id=job_id,
            session_code=session_code,
            result=TranscribeResponse(**result),
        )
    except Exception as e:
        logger.error("Poll: job %s failed: %s", job_id, e)
        return PollResponse(
            processed=True,
            job_id=job_id,
            session_code=session_code,
            error=str(e),
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
