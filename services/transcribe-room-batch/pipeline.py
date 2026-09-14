"""
P1307 Decision 5: process one claimed room job — one member's whole recording.

  1. Read the member and room from the DB (the task payload is trusted for job_id only).
  2. List and download that member's archive chunks; detect gaps and orphaned chunks.
  3. Decode each MediaRecorder run and cut it into ≤5-minute segments (RQ5).
  4. Transcribe each segment in its own Gemini request, audio only.
  5. Merge the member's sentences into the room's one timeline, labelling cross-member
     near-duplicates, and write it with optimistic concurrency.
  6. Mark the job completed, or pending/failed on error.

Completeness is REPORTED, never assumed: a gap in the chunk sequence, a run without its header,
or a capture ended by the sweep's staleness rule (the tab most likely died, and its final chunk
with it) puts the member in incomplete_member_ids.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

import audio
import storage
from config import (
    CHUNK_SECONDS,
    DUPLICATE_MIN_SIMILARITY,
    DUPLICATE_WINDOW_MS,
    GCS_BUCKET,
    SEGMENT_SECONDS,
    STALE_MINUTES,
)
from gemini_client import TranscriptionError, transcribe_segment
from merge import Entry, remerge_member, sentences_with_times

logger = logging.getLogger(__name__)

WRITE_RETRIES = 5


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def ended_by_staleness(member: dict) -> bool:
    """True when the sweep, not the member, stamped capture_ended_at."""
    ended = _parse_ts(member.get("capture_ended_at"))
    seen = _parse_ts(member.get("last_seen_at")) or _parse_ts(member.get("joined_at"))
    if ended is None or seen is None:
        return False
    return (ended - seen).total_seconds() >= STALE_MINUTES * 60


def transcribe_member(room_code: str, member_id: str) -> tuple[list[Entry], bool, dict]:
    """Returns (entries, incomplete, stats). Stats are counts only — safe to log."""
    objects = audio.list_room_objects(GCS_BUCKET, room_code)
    refs = audio.select_member_chunks(objects, room_code, member_id)
    missing = audio.missing_chunk_numbers([r.number for r in refs])
    chunks = audio.download_objects(GCS_BUCKET, refs)
    runs, orphaned = audio.split_into_runs(chunks)

    entries: list[Entry] = []
    segment_count = 0
    for run in runs:
        pcm = audio.decode_run_to_pcm(run)
        start_ms = audio.run_start_ms(run[0][0], CHUNK_SECONDS)
        for offset_ms, piece in audio.split_pcm(pcm, SEGMENT_SECONDS):
            segment_count += 1
            text = transcribe_segment(audio.encode_wav(piece))
            entries.extend(sentences_with_times(member_id, text, start_ms + offset_ms, audio.pcm_duration_ms(piece)))

    stats = {"chunks": len(refs), "missing": len(missing), "orphaned": orphaned, "runs": len(runs), "segments": segment_count}
    return entries, bool(missing or orphaned), stats


def write_member_into_room_transcript(room_id: str, member_id: str, display_name: str, entries: list[Entry], incomplete: bool) -> None:
    for _ in range(WRITE_RETRIES):
        existing = storage.read_transcript(room_id)
        segments, notes = remerge_member(
            (existing or {}).get("segments") or [], member_id, entries, DUPLICATE_WINDOW_MS, DUPLICATE_MIN_SIMILARITY,
        )
        speaker_map = dict((existing or {}).get("speaker_map") or {})
        # Joined server-side AFTER transcription: the name never went near Gemini.
        speaker_map[member_id] = display_name
        incomplete_ids = set((existing or {}).get("incomplete_member_ids") or [])
        (incomplete_ids.add if incomplete else incomplete_ids.discard)(member_id)
        row = {
            "segments": segments,
            "speaker_map": speaker_map,
            "incomplete_member_ids": sorted(incomplete_ids),
            "de_duplication_note": notes,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        if existing is None:
            if storage.insert_transcript({"room_id": room_id, **row}):
                return
        elif storage.update_transcript_if_unchanged(room_id, existing["updated_at"], row):
            return
        time.sleep(0.2)
    raise RuntimeError("could not write the room transcript after concurrent updates")


def process_job(job: dict) -> None:
    job_id = job["id"]
    attempts = job.get("attempts") or 0
    try:
        ctx = storage.load_context(job)
        member, room = ctx["member"], ctx["room"]
        if not audio.validate_room_code(room["code"]) or not audio.validate_member_id(member["id"]):
            storage.finish_job(job_id, error="invalid_identifiers")
            logger.error("job %s: invalid room code or member id — failed", job_id)
            return

        entries, incomplete, stats = transcribe_member(room["code"], member["id"])
        incomplete = incomplete or ended_by_staleness(member)
        write_member_into_room_transcript(room["id"], member["id"], member["display_name"], entries, incomplete)
        storage.finish_job(job_id)
        logger.info("job %s: completed (%s, sentences=%d, incomplete=%s)", job_id, stats, len(entries), incomplete)
    except TranscriptionError as err:
        storage.finish_job(job_id, error=f"gemini_{err.status}", retryable=err.retryable, attempts=attempts)
        logger.error("job %s: Gemini error status=%s retryable=%s", job_id, err.status, err.retryable)
    except Exception as err:  # noqa: BLE001 — every failure must release the claim
        storage.finish_job(job_id, error=type(err).__name__, retryable=True, attempts=attempts)
        logger.error("job %s: failed with %s", job_id, type(err).__name__, exc_info=True)
