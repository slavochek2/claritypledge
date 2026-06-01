"""
Supabase storage: write transcripts, update voice profiles, manage job status.

Uses service role key to bypass RLS (service-only writes by design).
"""

import logging
from typing import Optional

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

# Lazy-loaded client
_client = None


def _get_client():
    """Get Supabase client with service role key (lazy singleton)."""
    global _client
    if _client is None:
        from supabase import create_client
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase client initialized for %s", SUPABASE_URL)
    return _client


def store_transcript(
    session_id: str,
    session_code: str,
    segments: list[dict],
    speaker_map: dict,
    language: str,
    model_version: str,
    processing_time_ms: int,
) -> str:
    """
    Store transcript in session_transcripts table.

    Returns the transcript ID.
    """
    client = _get_client()

    data = {
        "session_id": session_id,
        "session_code": session_code,
        "language": language,
        "segments": segments,
        "speaker_map": speaker_map,
        "model_version": model_version,
        "processing_time_ms": processing_time_ms,
    }

    result = client.table("session_transcripts").insert(data).execute()

    if result.data:
        transcript_id = result.data[0]["id"]
        logger.info("Stored transcript %s for session %s", transcript_id, session_code)
        return transcript_id

    raise RuntimeError(f"Failed to store transcript: {result}")


def update_voice_profiles(
    speaker_map: dict,
    embeddings: dict[str, list[float]],
    session_id: str,
) -> None:
    """
    Upsert voice profiles for mapped speakers.

    Running average of embeddings, increment session_count.
    Only updates for speakers with a user_id.
    """
    client = _get_client()

    for speaker_id, info in speaker_map.items():
        user_id = info.get("user_id")
        if not user_id:
            continue

        embedding = embeddings.get(speaker_id)
        if not embedding:
            continue

        display_name = info.get("display_name", "Unknown")

        # Check if profile exists
        existing = (
            client.table("user_voice_profiles")
            .select("id, embedding, session_count")
            .eq("user_id", user_id)
            .execute()
        )

        if existing.data:
            # Update: running average of embeddings
            profile = existing.data[0]
            old_count = profile["session_count"]
            old_embedding = profile.get("embedding")

            if old_embedding and len(old_embedding) == len(embedding):
                # Running average: new_avg = (old_avg * count + new) / (count + 1)
                new_count = old_count + 1
                new_embedding = [
                    (old_e * old_count + new_e) / new_count
                    for old_e, new_e in zip(old_embedding, embedding)
                ]
            else:
                new_embedding = embedding
                new_count = 1

            client.table("user_voice_profiles").update({
                "display_name": display_name,
                "embedding": new_embedding,
                "session_count": new_count,
                "last_session_id": session_id,
            }).eq("user_id", user_id).execute()

            logger.info("Updated voice profile for %s (session_count=%d)", display_name, new_count)
        else:
            # Insert new profile
            client.table("user_voice_profiles").insert({
                "user_id": user_id,
                "display_name": display_name,
                "embedding": embedding,
                "session_count": 1,
                "last_session_id": session_id,
            }).execute()

            logger.info("Created voice profile for %s", display_name)


def update_job_status(
    job_id: str,
    status: str,
    error_message: Optional[str] = None,
    only_if_status: Optional[str] = None,
) -> None:
    """Update transcription job status.

    error_message is also used for progress tracking during processing:
    set to "step: <name> (<elapsed>s)" at each pipeline stage.
    Cleared (set to None) on successful completion.

    P858: every write now bumps `updated_at` (the previous version never did — so the
    stale-reset compared against the row's INSERT-time default; see reset_stale_jobs).
    `only_if_status` adds a `WHERE status = <only_if_status>` guard so a transition can
    be made race-safe — used by the claim path to mark an EXHAUSTED-but-still-pending row
    'failed' WITHOUT clobbering a row a concurrent dispatcher already flipped to
    'processing' (Cloud Tasks at-least-once redelivery).
    """
    from datetime import datetime, timezone

    client = _get_client()

    now_iso = datetime.now(timezone.utc).isoformat()
    data = {"status": status, "updated_at": now_iso}
    if status == "completed":
        data["completed_at"] = now_iso
    # Always write error_message (including None to clear it on success)
    data["error_message"] = error_message

    query = client.table("transcription_jobs").update(data).eq("id", job_id)
    if only_if_status is not None:
        query = query.eq("status", only_if_status)
    query.execute()
    logger.info("Job %s → %s%s%s", job_id, status,
                f" ({error_message})" if error_message else "",
                f" [guard status={only_if_status}]" if only_if_status else "")


STALE_JOB_MINUTES = 30


def reset_stale_jobs() -> int:
    """Reset jobs stuck in 'processing' for >STALE_JOB_MINUTES back to 'pending'.

    P858 (Decision 8): extracted out of the old get_pending_job() so the SWEEPER runs
    it every cycle — deleting the 5-min poll deleted the only caller of the stale-reset,
    and given the historical crash rate a job whose instance is killed mid-'processing'
    (before the `except` writes 'failed') would otherwise jam the queue forever.

    The 30-min cutoff is now meaningful because update_job_status writes `updated_at` on
    every write (the P858 fix) — so the window measures LAST ACTIVITY, not INSERT time.
    Returns the number of rows reset.
    """
    from datetime import datetime, timezone, timedelta

    client = _get_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_MINUTES)).isoformat()
    stale = (
        client.table("transcription_jobs")
        .select("id, session_code")
        .eq("status", "processing")
        .lt("updated_at", cutoff)
        .execute()
    )

    reset = 0
    for job in (stale.data or []):
        logger.warning("Resetting stale job %s (session %s) — stuck in processing >%d min",
                        job["id"], job.get("session_code"), STALE_JOB_MINUTES)
        # Leaves `attempts` intact: a crash mid-processing DID consume an attempt, so the
        # next claim continues the count rather than resetting it.
        client.table("transcription_jobs").update(
            {"status": "pending", "error_message": None}
        ).eq("id", job["id"]).execute()
        reset += 1
    return reset


def claim_pending_job(job_id: Optional[str] = None) -> Optional[dict]:
    """Atomically claim a pending transcription job (P858, Decision 6).

    Calls the claim_pending_job(p_job_id) DB function (FOR UPDATE SKIP LOCKED conditional
    UPDATE) via RPC — NOT a PostgREST .update(), which cannot express SKIP LOCKED and would
    reintroduce double-dispatch. The DB flips pending→processing, increments `attempts`, and
    RETURNs the DB-sourced session fields (mitigation #3: the caller trusts only these, never
    a task payload).

    Args:
        job_id: None → claim the oldest pending row (sweeper path).
                set  → claim only that row if still eligible (trigger path).

    Returns:
        The claimed row dict (id, session_code, session_id, attempts) on a won claim, or
        None when nothing was claimed (clean no-op — NOT an error). A None return means:
        the queue is empty (sweeper), the row is already owned by another dispatcher
        (race), or the row is exhausted.
    """
    client = _get_client()

    result = client.rpc("claim_pending_job", {"p_job_id": job_id}).execute()
    rows = getattr(result, "data", None) or []
    if rows:
        return rows[0]

    # Nothing claimed. For a by-id claim (trigger), distinguish the two zero-row causes:
    #   - EXHAUSTED: row is still 'pending' but attempts >= max_attempts (gate excluded it)
    #     → must be transitioned to 'failed' so it stops being re-dispatched.
    #   - LOST RACE: a concurrent dispatcher already flipped it to 'processing'
    #     → must NOT be touched.
    # The only_if_status='pending' guard makes the fail-marking a no-op in the race case,
    # so this is safe to attempt unconditionally. Best-effort: a transient DB error here
    # must not turn a clean no-op into a raised exception for the caller.
    if job_id is not None:
        try:
            update_job_status(
                job_id, "failed",
                error_message="retry attempts exhausted",
                only_if_status="pending",
            )
        except Exception as e:
            logger.warning("claim: could not fail exhausted job %s: %s", job_id, e)
    return None


def route_failed_job(job_id: str, error_message: str, retryable: bool) -> None:
    """Route a failed processing attempt onto the SAME job row (P858, Decision 5).

    retryable=True  → status='pending' (cleared error) so the sweeper re-dispatches; the
                      next claim increments `attempts` — bounded by max_attempts.
    retryable=False → status='failed' (permanent; no retry, no attempt consumed beyond
                      the one already counted at claim time).

    `attempts` is never touched here — the single increment point is the atomic claim.

    Both writes are guarded with only_if_status='processing': route_failed_job is called by
    the worker that owns the row (it set the row to 'processing' at claim time), so only
    transition a row that is STILL 'processing'. This prevents resurrecting a row that a
    stale-reset already returned to 'pending' and another dispatcher re-claimed — at which
    point this orphaned worker must not mutate it. (Note: it cannot fully resolve the
    >30-min reclaim race where the new owner is also 'processing'; the spec deliberately
    rejected a claimed_by lease column, so that residual window is accepted and bounded by
    the 3600s request timeout.)
    """
    if retryable:
        update_job_status(job_id, "pending", error_message=None, only_if_status="processing")
    else:
        update_job_status(job_id, "failed", error_message=error_message, only_if_status="processing")


def get_pending_job() -> Optional[dict]:
    """Get the oldest pending transcription job (SELECT only).

    P858: the inline stale-reset that used to live here was EXTRACTED into
    reset_stale_jobs() (Decision 8) and removed from this function, so the old
    `updated_at`-broken reset can never run again via the dormant /poll path. The
    atomic claim_pending_job() supersedes this read for all live dispatch; this remains
    only for the decommissioned /poll endpoint and is removed with /poll at Phase B.
    """
    client = _get_client()

    result = (
        client.table("transcription_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]
    return None


def get_voice_profiles(user_ids: list[str]) -> list[dict]:
    """Fetch voice profiles for given user IDs."""
    if not user_ids:
        return []

    client = _get_client()

    result = (
        client.table("user_voice_profiles")
        .select("user_id, display_name, embedding")
        .in_("user_id", user_ids)
        .execute()
    )

    return result.data or []
