"""
P1307 Decision 5: every database read and write the room pass makes, service role only.

Nothing here logs transcript text or display names — job ids, member ids and counts only
(Security Review, Data Protection).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import MAX_ATTEMPTS, STALE_PROCESSING_MINUTES, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)

_client = None

JOBS = "transcribe_room_transcription_jobs"
TRANSCRIPTS = "transcribe_room_transcripts"


def _db():
    global _client
    if _client is None:
        from supabase import create_client

        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def claim_job(job_id: str) -> Optional[dict]:
    """Atomic pending → processing. None when another delivery already owns it."""
    rows = _db().rpc("claim_room_transcription_job", {"p_job_id": job_id}).execute().data or []
    return rows[0] if rows else None


def oldest_pending_job_id() -> Optional[str]:
    rows = (
        _db().table(JOBS).select("id").eq("status", "pending")
        .order("created_at").limit(1).execute().data or []
    )
    return rows[0]["id"] if rows else None


def reset_stale_processing() -> int:
    """Crash recovery: a job claimed long ago and never finished goes back to pending, or to
    failed once it has used its attempts. Conditional on status, so it never touches a job that
    finished in the meantime."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_PROCESSING_MINUTES)).isoformat()
    stale = (
        _db().table(JOBS).select("id, attempts").eq("status", "processing")
        .lt("claimed_at", cutoff).execute().data or []
    )
    for row in stale:
        exhausted = (row.get("attempts") or 0) >= MAX_ATTEMPTS
        _db().table(JOBS).update({
            "status": "failed" if exhausted else "pending",
            "error": "stale_processing" if exhausted else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", row["id"]).eq("status", "processing").execute()
    if stale:
        logger.info("reset %d stale processing job(s)", len(stale))
    return len(stale)


def load_context(job: dict) -> dict:
    """The member and room this job is about, read from the DB — never from the task payload."""
    member = (
        _db().table("transcribe_room_members")
        .select("id, room_id, display_name, joined_at, last_seen_at, capture_ended_at")
        .eq("id", job["member_id"]).single().execute().data
    )
    room = _db().table("transcribe_rooms").select("id, code, ended_at").eq("id", job["room_id"]).single().execute().data
    if member["room_id"] != room["id"]:
        raise ValueError("job member does not belong to job room")
    return {"member": member, "room": room}


def finish_job(job_id: str, error: Optional[str] = None, retryable: bool = False, attempts: int = 0) -> None:
    now = datetime.now(timezone.utc).isoformat()
    if error is None:
        update = {"status": "completed", "error": None, "completed_at": now, "updated_at": now}
    elif retryable and attempts < MAX_ATTEMPTS:
        update = {"status": "pending", "error": error, "updated_at": now}
    else:
        update = {"status": "failed", "error": error, "updated_at": now}
    _db().table(JOBS).update(update).eq("id", job_id).eq("status", "processing").execute()


def read_transcript(room_id: str) -> Optional[dict]:
    rows = (
        _db().table(TRANSCRIPTS)
        .select("room_id, segments, speaker_map, incomplete_member_ids, de_duplication_note, updated_at")
        .eq("room_id", room_id).limit(1).execute().data or []
    )
    return rows[0] if rows else None


def insert_transcript(row: dict) -> bool:
    """False when another member's job inserted the row first (the caller re-reads and retries)."""
    try:
        _db().table(TRANSCRIPTS).insert(row).execute()
        return True
    except Exception as err:  # unique violation on room_id
        if "23505" in str(err) or "duplicate key" in str(err):
            return False
        raise


def update_transcript_if_unchanged(room_id: str, expected_updated_at: str, row: dict) -> bool:
    """Optimistic concurrency: two members' jobs for one room can finish together. The update
    applies only if nobody else wrote since this job read; otherwise the caller retries."""
    result = (
        _db().table(TRANSCRIPTS).update(row)
        .eq("room_id", room_id).eq("updated_at", expected_updated_at).execute()
    )
    return bool(result.data)
