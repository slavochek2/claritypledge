"""
P1307 Decision 5: reassemble one room member's archived audio into ≤5-minute WAV segments.

Archive layout (api.ts buildRoomAudioPathSegments + Decision 6's server-issued numbering):

    gs://<bucket>/rooms/{room_code}/{sanitised-name}-{member_id}/[_dev_]chunk_NNN.webm

Each chunk is one 30-second MediaRecorder flush. Only the FIRST chunk of a MediaRecorder
session carries the WebM/EBML header; later chunks are raw continuation bytes and cannot be
decoded on their own. Every pause/resume, reload or re-join starts a NEW MediaRecorder, so a
member's sequence is a series of "runs", each beginning with a header. Runs are decoded
separately — naively concatenating two WebM streams produces a file ffmpeg stops reading at
the second header.

Everything that can be pure is pure and unit-tested (tests/test_audio.py). GCS and ffmpeg
live behind two small functions at the bottom.
"""

from __future__ import annotations

import io
import logging
import re
import subprocess
import wave
from dataclasses import dataclass

logger = logging.getLogger(__name__)

TARGET_SAMPLE_RATE = 16_000
BYTES_PER_SAMPLE = 2  # 16-bit mono

EBML_MAGIC = b"\x1a\x45\xdf\xa3"

# Exact room-code alphabet (no I, O, 0, 1) — the same path-traversal gate audio.py in the
# /live worker applies to session codes (P858 mitigation #4). A code outside it could not
# have been generated and must never reach a GCS prefix.
_ROOM_CODE_RE = re.compile(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}")
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_CHUNK_FILE_RE = re.compile(r"(?:_dev_)?chunk_(\d{3,})\.webm")


def validate_room_code(code: object) -> bool:
    return isinstance(code, str) and _ROOM_CODE_RE.fullmatch(code) is not None


def validate_member_id(member_id: object) -> bool:
    return isinstance(member_id, str) and _UUID_RE.fullmatch(member_id) is not None


@dataclass(frozen=True)
class ChunkRef:
    number: int
    object_name: str
    created_ms: int


def select_member_chunks(objects: list[tuple[str, int]], room_code: str, member_id: str) -> list[ChunkRef]:
    """From (object_name, created_ms) pairs under rooms/{code}/, keep this member's chunks in order.

    The directory is `{sanitised-name}-{member_id}`. The name part is not trusted or needed —
    matching on the member-id suffix is what binds a directory to a member, the same way
    gcs-signed-url binds the prefix to the caller's member row.
    """
    prefix = f"rooms/{room_code}/"
    by_number: dict[int, ChunkRef] = {}
    for name, created_ms in objects:
        if not name.startswith(prefix):
            continue
        parts = name[len(prefix):].split("/")
        if len(parts) != 2 or not parts[0].endswith(f"-{member_id}"):
            continue
        match = _CHUNK_FILE_RE.fullmatch(parts[1])
        if not match:
            continue
        number = int(match.group(1))
        # Should never happen under server-issued numbering; if it does, keep the newest
        # object rather than guessing, and say so.
        if number in by_number:
            logger.warning("duplicate chunk number %d for member %s — keeping the newest", number, member_id)
            if by_number[number].created_ms >= created_ms:
                continue
        by_number[number] = ChunkRef(number=number, object_name=name, created_ms=created_ms)
    return [by_number[n] for n in sorted(by_number)]


def missing_chunk_numbers(numbers: list[int]) -> list[int]:
    """Numbers absent from a sequence that should run 0..max with no gap."""
    if not numbers:
        return []
    present = set(numbers)
    return [n for n in range(0, max(numbers) + 1) if n not in present]


def split_into_runs(chunks: list[tuple[ChunkRef, bytes]]) -> tuple[list[list[tuple[ChunkRef, bytes]]], int]:
    """Group ordered chunks into decodable runs, each starting with a WebM header.

    Returns (runs, orphaned_chunk_count). A chunk that has no header and no preceding header
    in its run (its run's first chunk was lost) cannot be decoded and is orphaned — counted so
    the member is reported incomplete rather than presented whole.
    """
    runs: list[list[tuple[ChunkRef, bytes]]] = []
    orphaned = 0
    current: list[tuple[ChunkRef, bytes]] | None = None
    previous_number: int | None = None
    for ref, data in chunks:
        gap_before = previous_number is not None and ref.number != previous_number + 1
        previous_number = ref.number
        if data.startswith(EBML_MAGIC):
            current = [(ref, data)]
            runs.append(current)
        elif current is not None and not gap_before:
            current.append((ref, data))
        else:
            # A continuation chunk whose header is missing, or that follows a gap (its
            # predecessor's bytes are gone, so the stream would be corrupt from here on).
            orphaned += 1
            current = None
    return runs, orphaned


def split_pcm(pcm: bytes, segment_seconds: int, sample_rate: int = TARGET_SAMPLE_RATE) -> list[tuple[int, bytes]]:
    """Cut 16-bit mono PCM into (offset_ms, bytes) segments no longer than segment_seconds."""
    step = segment_seconds * sample_rate * BYTES_PER_SAMPLE
    segments: list[tuple[int, bytes]] = []
    for start in range(0, len(pcm) - len(pcm) % BYTES_PER_SAMPLE, step):
        piece = pcm[start:start + step]
        if piece:
            offset_ms = (start // BYTES_PER_SAMPLE) * 1000 // sample_rate
            segments.append((offset_ms, piece))
    return segments


def pcm_duration_ms(pcm: bytes, sample_rate: int = TARGET_SAMPLE_RATE) -> int:
    return (len(pcm) // BYTES_PER_SAMPLE) * 1000 // sample_rate


def encode_wav(pcm: bytes, sample_rate: int = TARGET_SAMPLE_RATE) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(BYTES_PER_SAMPLE)
        out.setframerate(sample_rate)
        out.writeframes(pcm)
    return buffer.getvalue()


def run_start_ms(first_chunk: ChunkRef, chunk_seconds: int) -> int:
    """Estimated wall-clock start of a run.

    A chunk object is created when its 30-second flush uploads, so the audio it holds began
    about one interval earlier. This is an ESTIMATE (upload latency is not subtracted), good to
    a few seconds — enough to order members' speech on one timeline, not to align words.
    """
    return first_chunk.created_ms - chunk_seconds * 1000


# ── I/O ────────────────────────────────────────────────────────────────────────


def decode_run_to_pcm(run: list[tuple[ChunkRef, bytes]]) -> bytes:
    """Concatenate one run's chunks and decode to 16 kHz mono 16-bit PCM with ffmpeg."""
    stream = b"".join(data for _, data in run)
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "s16le", "-ac", "1", "-ar", str(TARGET_SAMPLE_RATE), "pipe:1"],
        input=stream,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 and not result.stdout:
        # stderr can name codec internals, never audio content; still, keep it short.
        raise RuntimeError(f"ffmpeg decode failed (exit {result.returncode}): {result.stderr[:200]!r}")
    if result.returncode != 0:
        # A truncated final chunk (tab killed mid-flush) decodes up to the damage. Keep what
        # decoded; the caller marks the member incomplete when chunks are missing.
        logger.warning("ffmpeg reported a partial decode (exit %d); keeping %d bytes", result.returncode, len(result.stdout))
    return result.stdout


def list_room_objects(bucket_name: str, room_code: str) -> list[tuple[str, int]]:
    """(object_name, created_ms) for everything under rooms/{room_code}/. Service account only."""
    from google.cloud import storage

    if not validate_room_code(room_code):
        raise ValueError("invalid room code")
    client = storage.Client()
    return [
        (blob.name, int(blob.time_created.timestamp() * 1000))
        for blob in client.list_blobs(bucket_name, prefix=f"rooms/{room_code}/")
    ]


def download_objects(bucket_name: str, refs: list[ChunkRef]) -> list[tuple[ChunkRef, bytes]]:
    from google.cloud import storage

    bucket = storage.Client().bucket(bucket_name)
    return [(ref, bucket.blob(ref.object_name).download_as_bytes()) for ref in refs]
