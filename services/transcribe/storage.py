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
) -> None:
    """Update transcription job status."""
    client = _get_client()

    data = {"status": status}
    if status == "completed":
        from datetime import datetime, timezone
        data["completed_at"] = datetime.now(timezone.utc).isoformat()
    if error_message:
        data["error_message"] = error_message

    client.table("transcription_jobs").update(data).eq("id", job_id).execute()
    logger.info("Job %s → %s", job_id, status)


STALE_JOB_MINUTES = 30


def get_pending_job() -> Optional[dict]:
    """Get the oldest pending transcription job.

    Also resets jobs stuck in 'processing' for >30 min back to 'pending'
    (instance crashed without updating status).
    """
    client = _get_client()

    # Reset stale processing jobs
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_MINUTES)).isoformat()
    stale = (
        client.table("transcription_jobs")
        .select("id, session_code")
        .eq("status", "processing")
        .lt("updated_at", cutoff)
        .execute()
    )
    for job in (stale.data or []):
        logger.warning("Resetting stale job %s (session %s) — stuck in processing >%d min",
                        job["id"], job["session_code"], STALE_JOB_MINUTES)
        client.table("transcription_jobs").update(
            {"status": "pending", "error_message": None}
        ).eq("id", job["id"]).execute()

    # Get oldest pending job
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
