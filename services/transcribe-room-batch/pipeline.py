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
from datetime import datetime, timezone

import audio
import gemini_client
import round_clean
import storage
import swap
from config import (
    CHUNK_SECONDS,
    DUPLICATE_MIN_SIMILARITY,
    DUPLICATE_WINDOW_MS,
    GCS_BUCKET,
    MAX_ATTEMPTS,
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
    if not refs:
        return [], True, {"chunks": 0, "missing": 0, "orphaned": 0, "runs": 0, "segments": 0}
    missing = audio.missing_chunk_numbers([r.number for r in refs])
    chunks = audio.download_objects(GCS_BUCKET, refs)
    runs, orphaned = audio.split_into_runs(chunks)

    entries: list[Entry] = []
    segment_count = 0
    for run in runs:
        start_ms = audio.run_start_ms(run[0][0], CHUNK_SECONDS)
        for piece_offset_ms, pcm in audio.iter_run_pieces(run, chunk_s=CHUNK_SECONDS):   # <= 15 min in memory at a time
            for offset_ms, piece in audio.split_pcm(pcm, SEGMENT_SECONDS):
                segment_count += 1
                text = transcribe_segment(audio.encode_wav(piece))
                entries.extend(sentences_with_times(
                    member_id, text, start_ms + piece_offset_ms + offset_ms, audio.pcm_duration_ms(piece)))
            del pcm

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
        if stats["chunks"] == 0:
            # P1339: nothing found to transcribe. A "completed" here hid a wrong archive path for
            # a week across every room, so it never completes. It can still be legitimate (a
            # member who only listened) or an upload still in flight: retry via the sweep, and on
            # the last attempt keep the member in the transcript as incomplete and fail with why.
            if attempts >= MAX_ATTEMPTS:
                write_member_into_room_transcript(room["id"], member["id"], member["display_name"], [], True)
            storage.finish_job(job_id, error="no_audio_chunks", retryable=True, attempts=attempts)
            logger.error("job %s: no audio chunks found (attempt %s)", job_id, attempts)
            return
        incomplete = incomplete or ended_by_staleness(member)
        write_member_into_room_transcript(room["id"], member["id"], member["display_name"], entries, incomplete)
        storage.finish_job(job_id)
        logger.info("job %s: completed (%s, sentences=%d, incomplete=%s)", job_id, stats, len(entries), incomplete)
        # P1592 D9: after completion only; run_swap_for_member never raises and is off by default.
        try:
            swap.run_swap_for_member(room["id"], member["id"])
        except Exception:  # noqa: BLE001 — belt and braces: the job is already completed
            logger.error("job %s: swap raised after completion", job_id, exc_info=True)
    except TranscriptionError as err:
        storage.finish_job(job_id, error=f"gemini_{err.status}", retryable=err.retryable, attempts=attempts)
        logger.error("job %s: Gemini error status=%s retryable=%s", job_id, err.status, err.retryable)
    except Exception as err:  # noqa: BLE001 — every failure must release the claim
        storage.finish_job(job_id, error=type(err).__name__, retryable=True, attempts=attempts)
        logger.error("job %s: failed with %s", job_id, type(err).__name__, exc_info=True)


# --- P1596: clean round pass --------------------------------------------------------------------

READY_DEADLINE_S = 180      # after the window ends, wait this long for the last uploads, then decide with what exists
RECHECK_S = 30              # how far a not-ready job is pushed before it is looked at again
COVERAGE_MIN = 0.8          # a seated person below this share marks the table partial; share of the window
RETRY_BACKOFF_S = 60


def _ms(value: str) -> int:
    return int(_parse_ts(value).timestamp() * 1000)


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def load_member_runs(code: str, member_id: str, refs: list, lo_ms: int, hi_ms: int,
                     heads: dict) -> list[tuple[int, bytes]]:
    """One mic's audio over [lo_ms, hi_ms] as [(end_ms, pcm)], one entry per chunk, each placed by its own
    corrected object time. Only overlapping chunks (plus the run header chunks they need) are downloaded."""
    if not refs:
        return []
    if member_id not in heads:
        heads[member_id] = audio.peek_headers(GCS_BUCKET, refs)
    pieces, stats = audio.chunk_pieces(
        refs, lo_ms, hi_ms, heads[member_id],
        lambda r: audio.download_one(GCS_BUCKET, r), audio.decode_bytes_to_pcm, CHUNK_SECONDS)
    logger.info("member %s: chunks=%d used=%d missing=%d", member_id, stats["chunks"], stats["used"], stats["missing"])
    return pieces


def _last_audio_ms(members: dict[str, list], default_ms: int) -> int:
    return max((end for pieces in members.values() for end, _ in pieces), default=default_ms)


def coverage(pieces: list[tuple[int, bytes]], a_ms: int, b_ms: int) -> float:
    """Share of [a_ms, b_ms) that any piece covers (pieces may overlap)."""
    if b_ms <= a_ms:
        return 0.0
    spans = sorted((max(e - audio.pcm_duration_ms(p), a_ms), min(e, b_ms)) for e, p in pieces)
    covered, cur = 0, a_ms
    for lo, hi in spans:
        if hi <= lo:
            continue
        lo = max(lo, cur)
        if hi > lo:
            covered += hi - lo
            cur = hi
    return covered / (b_ms - a_ms)


def job_segments(job: dict) -> list[dict]:
    """[{start_ms, end_ms, member_ids (posted), compare_ids (all mics compared)}]. A round job is one window."""
    if job.get("kind") == "room":
        out = []
        for s in (job.get("segments") or []):
            ids = list(s["member_ids"])
            out.append({"start_ms": _ms(s["start"]), "end_ms": _ms(s["end"]), "member_ids": ids,
                        "compare_ids": list(s.get("compare_ids") or ids)})
        return out
    ids = [s["member_id"] for s in (job.get("seats") or [])]
    return [{"start_ms": _ms(job["window_start"]), "end_ms": _ms(job["window_end"]),
             "member_ids": ids, "compare_ids": ids}]


def _finish_round(job_id: str, attempts: int, **kw) -> None:
    try:
        storage.finish_round_job(job_id, attempts=attempts, **kw)
    except Exception:  # noqa: BLE001 — a failed status write must not raise past the job; the stale reset recovers it
        logger.error("round job %s: could not record its outcome", job_id, exc_info=True)


def _defer(job_id: str, attempts: int, not_before_ms: int) -> None:
    try:
        storage.defer_round_job(job_id, attempts, _iso(not_before_ms))
    except Exception:  # noqa: BLE001
        logger.error("round job %s: could not defer", job_id, exc_info=True)


def process_round_job(job: dict, transcribe=None, now_ms: int | None = None) -> None:
    """Clean one round table (or a room's outside-round stretches) and post the result.

    Order: switch check (no audio leaves while off), readiness (every recording member's last upload is in, or
    the deadline passed), completeness (nothing at all: nothing posted; somebody seated under 80% of the window: what exists is
    posted and the thread title says audio is missing), clean everything, then ONE atomic post. `attempts` is the claim's fence: the post and every
    status write carry it, so a worker whose claim was reset is refused and does nothing. Never raises.
    """
    job_id = job["id"]
    attempts = job.get("attempts") or 0
    transcribe = transcribe or gemini_client.transcribe_verbatim_argon
    now = int(time.time() * 1000) if now_ms is None else now_ms
    try:
        if not storage.clean_enabled():
            _defer(job_id, attempts, now + 60_000)
            logger.info("round job %s: switched off, returned unprocessed", job_id)
            return
        seats = {s["member_id"]: s["room_id"] for s in (job.get("seats") or [])}
        segments = job_segments(job)
        # Every mic the job reads: the seats' AND every compared one (a room job compares mics that post nothing).
        # A mic outside `seats` lives in the job's own room.
        room_of = dict(seats)
        for sg in segments:
            for mid in sg["compare_ids"] + sg["member_ids"]:
                room_of.setdefault(mid, job.get("room_id"))
        for mid in room_of:
            if not audio.validate_member_id(mid):
                _finish_round(job_id, attempts, error="invalid_identifiers")
                logger.error("round job %s: invalid member id: failed", job_id)
                return
        codes = storage.load_room_codes(sorted({r for r in room_of.values() if r}))
        window_start = min((g["start_ms"] for g in segments), default=_ms(job["window_start"]))
        window_end = max((g["end_ms"] for g in segments), default=_ms(job["window_end"]))

        objects: dict[str, list] = {}
        refs: dict[str, list] = {}
        no_code = 0
        for mid, rid in room_of.items():
            code = codes.get(rid)
            if not audio.validate_room_code(code):
                no_code += 1                      # this member has no archive to read: missing, not a failure
                refs[mid] = []
                continue
            if code not in objects:
                objects[code] = audio.list_room_objects(GCS_BUCKET, code)
            refs[mid] = audio.select_member_chunks(objects[code], code, mid)

        ended = storage.load_capture_ended(sorted(room_of))
        deadline = _ms(job["window_end"]) + READY_DEADLINE_S * 1000
        waiting = [m for m in room_of if codes.get(room_of[m]) and audio.validate_room_code(codes.get(room_of[m]))
                   and not ended.get(m) and not any(r.created_ms >= window_end for r in refs[m])]
        if waiting and now < deadline:
            _defer(job_id, attempts, min(now + RECHECK_S * 1000, deadline))
            logger.info("round job %s: %d of %d recording member(s) not ready, deferred", job_id, len(waiting), len(room_of))
            return

        heads: dict = {}
        pieces_by_seg: list[dict[str, list[tuple[int, bytes]]]] = []
        for seg in segments:
            members: dict[str, list[tuple[int, bytes]]] = {}
            for m in dict.fromkeys(seg["compare_ids"] + seg["member_ids"]):
                if m not in refs or not refs[m]:
                    continue
                code = codes[room_of[m]]
                got = load_member_runs(code, m, refs[m], seg["start_ms"], seg["end_ms"], heads)
                if got:
                    members[m] = got
            pieces_by_seg.append(members)

        partial = False
        if job.get("kind") != "room":
            seg, members = segments[0], pieces_by_seg[0]
            seats_list = job.get("seats") or []
            person_of = {s["member_id"]: s.get("person") or s["member_id"] for s in seats_list}
            seated = job.get("seated_count")
            seated = len(set(person_of.values())) if seated is None else seated
            # People, not rows: a person's coverage is the UNION of their mics' pieces (the same stretch on
            # two devices counts once).
            pieces_of: dict[str, list] = {}
            for m in seg["member_ids"]:
                if m in members:
                    pieces_of.setdefault(person_of.get(m, m), []).extend(members[m])
            # Missing means missing beside the table's own audio: a round closed after everyone stopped (room ended, host
            # closed it later) is not marked for the stretch nobody recorded.
            cover_end = min(seg["end_ms"], _last_audio_ms(members, seg["end_ms"]))
            by_person = {pr: coverage(pcs, seg["start_ms"], cover_end) for pr, pcs in pieces_of.items()}
            covered = sum(1 for v in by_person.values() if v >= COVERAGE_MIN)
            if not by_person or max(by_person.values()) <= 0:
                _finish_round(job_id, attempts, error="incomplete_table", completed=True)
                logger.info("round job %s: no audio at the table (seated=%d), nothing posted", job_id, seated)
                return
            # Founder, 2026-11-02: one person stopping must not erase everyone's words. Post what exists; the
            # thread's title says audio is missing.
            partial = covered < seated

        items: list[dict] = []
        for seg, members in zip(segments, pieces_by_seg):
            if not members:
                continue
            # A round closed long after its audio stopped is cleaned up to the audio that exists, so silence after it does not
            # count toward the window limit. Audio really spanning more than the limit is still refused.
            clean_end_ms = min(seg["end_ms"], _last_audio_ms(members, seg["end_ms"]) + round_clean.MAX_SHIFT_S * 1000)
            result = round_clean.clean_round(members, seg["start_ms"], clean_end_ms, transcribe,
                                             post_ids=set(seg["member_ids"]))
            logger.info("round job %s: members=%d missing=%d masked_audible_s=%s dominant=%s", job_id,
                        len(members), len(result.missing_member_ids),
                        sorted(result.masked_audible_seconds.values()), result.dominant_member_id is not None)
            for mid, chunks in result.texts.items():
                items.extend({"member_id": mid, "chunk_ms": c.start_ms, "text": c.text} for c in chunks)
        items.sort(key=lambda i: (i["chunk_ms"], i["member_id"]))
        posted = storage.post_clean_round(job_id, attempts, items, partial=partial) if items else 0
        if partial:
            _finish_round(job_id, attempts, error="partial_table", completed=True)
        else:
            _finish_round(job_id, attempts)
        logger.info("round job %s: completed (place=%s, blocks=%d, posted=%s, member_without_room_code=%d)",
                    job_id, job.get("place") or job.get("kind"), len(items), posted, no_code)
    except gemini_client.TranscriptionError as err:
        _finish_round(job_id, attempts, error=f"gemini_{err.status}", retryable=err.retryable)
        logger.error("round job %s: Gemini error status=%s", job_id, err.status)
    except Exception as err:  # noqa: BLE001 — every failure must release the claim
        _finish_round(job_id, attempts, error=type(err).__name__, retryable=True)
        logger.error("round job %s: failed with %s", job_id, type(err).__name__, exc_info=True)


def drain_round_jobs(processor=None) -> list[str]:
    """The /sweep loop for clean-round jobs. Each due job is claimed once per sweep; one that goes back to
    pending (retry, not ready) is excluded from this sweep but never blocks the jobs behind it."""
    if not storage.clean_enabled():
        return []
    processor = processor or process_round_job
    storage.reset_stale_round_jobs()
    seen: list[str] = []
    done: list[str] = []
    while True:
        job_id = storage.oldest_due_round_job_id(seen)
        if job_id is None:
            return done
        seen.append(job_id)
        claimed = storage.claim_round_job(job_id)
        if claimed is None:
            continue
        processor(claimed)
        done.append(job_id)
