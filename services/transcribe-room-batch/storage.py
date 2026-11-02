"""
P1307 Decision 5: every database read and write the room pass makes, service role only.

Nothing here logs transcript text or display names — job ids, member ids and counts only
(Security Review, Data Protection).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import MAX_ATTEMPTS, retry_delay_s, STALE_PROCESSING_MINUTES, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

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


# --- P1592 quiet swap reads and the one write -------------------------------------------------

def read_member_live_rows(room_id: str, member_id: str) -> list[dict]:
    """This member's live transcription rows in the room, spoken order. chat_message_id is NULL
    for rows that were never posted to chat."""
    return (
        _db().table("transcribe_messages").select("id, text, spoken_at, chat_message_id")
        .eq("room_id", room_id).eq("member_id", member_id)
        .order("spoken_at").execute().data or []
    )


def read_chat_messages(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    return (
        _db().table("chat_messages")
        .select("id, body, edited_at, deleted_at, thread_root_id, conversation_id")
        .in_("id", ids).execute().data or []
    )


def apply_transcription_swap(room_id: str, member_id: str, updates: list[dict]) -> int:
    """ONE call. The RPC re-checks every guard server-side (edited, deleted, author, length)."""
    return _db().rpc("apply_transcription_swap", {
        "p_room_id": room_id, "p_member_id": member_id, "p_updates": updates,
    }).execute().data


# --- P1596 clean round jobs (table transcribe_round_clean_jobs; ids and counts only in logs) ---------

ROUND_JOBS = "transcribe_round_clean_jobs"


def claim_round_job(job_id: str) -> Optional[dict]:
    """Atomic pending -> processing, only once not_before has passed. None when not due or already owned."""
    rows = _db().rpc("claim_round_clean_job", {"p_job_id": job_id}).execute().data or []
    return rows[0] if rows else None


def clean_enabled() -> bool:
    """The P1592 kill switch (transcribe_channel_posting.enabled). Off: nothing is claimed, swept or sent."""
    rows = _db().table("transcribe_channel_posting").select("enabled").eq("singleton", True).limit(1).execute().data or []
    return bool(rows and rows[0].get("enabled"))


def oldest_due_round_job_id(exclude: list[str] | None = None) -> Optional[str]:
    now = datetime.now(timezone.utc).isoformat()
    q = _db().table(ROUND_JOBS).select("id").eq("status", "pending").lte("not_before", now)
    if exclude:
        q = q.not_.in_("id", exclude)
    rows = q.order("not_before").limit(1).execute().data or []
    return rows[0]["id"] if rows else None


def reset_stale_round_jobs() -> int:
    """ONE service-only SQL call (a single UPDATE): stale processing -> pending (dispatched_at cleared, so the tick
    sends it again), or failed once MAX_ATTEMPTS is used. Returns how many rows it changed."""
    data = _db().rpc("reset_stale_round_jobs", {
        "p_stale_minutes": STALE_PROCESSING_MINUTES, "p_max_attempts": MAX_ATTEMPTS}).execute().data
    return int(data or 0)


def load_room_codes(room_ids: list[str]) -> dict[str, str]:
    if not room_ids:
        return {}
    rows = _db().table("transcribe_rooms").select("id, code").in_("id", room_ids).execute().data or []
    return {r["id"]: r["code"] for r in rows}


def load_capture_ended(member_ids: list[str]) -> dict[str, Optional[str]]:
    """member id -> capture_ended_at (None while they are still capturing)."""
    if not member_ids:
        return {}
    rows = _db().table("transcribe_room_members").select("id, capture_ended_at").in_("id", member_ids).execute().data or []
    return {r["id"]: r.get("capture_ended_at") for r in rows}


def finish_round_job(job_id: str, attempts: int, error: Optional[str] = None, retryable: bool = False,
                     completed: bool = False) -> None:
    """Record the outcome of the claim that had `attempts`. Fenced on it: a worker whose claim was reset (and
    maybe re-claimed) updates nothing. completed=True with an error is a finished job: 'partial_table' posted what existed, others posted nothing."""
    now = datetime.now(timezone.utc)
    if error is None or completed:
        update = {"status": "completed", "error": error, "completed_at": now.isoformat()}
    elif retryable and attempts < MAX_ATTEMPTS:
        update = {"status": "pending", "error": error, "dispatched_at": None,
                  "not_before": (now + timedelta(seconds=retry_delay_s())).isoformat()}
    else:
        update = {"status": "failed", "error": error}
    update["updated_at"] = now.isoformat()
    _db().table(ROUND_JOBS).update(update).eq("id", job_id).eq("status", "processing").eq("attempts", attempts).execute()


def defer_round_job(job_id: str, attempts: int, not_before_iso: str) -> None:
    """Back to pending WITHOUT using the attempt this claim took (not ready yet, or the switch is off)."""
    _db().table(ROUND_JOBS).update({
        "status": "pending", "attempts": max(attempts - 1, 0), "not_before": not_before_iso,
        "dispatched_at": None, "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).eq("status", "processing").eq("attempts", attempts).execute()


def post_clean_round(job_id: str, attempt: int, items: list[dict], partial: bool = False) -> int:
    """ONE transaction for the whole job. Refused (raises) for a stale attempt; on any failure nothing is posted."""
    return _db().rpc("post_clean_round", {"p_job_id": job_id, "p_attempt": attempt, "p_items": items, "p_partial": partial}).execute().data
