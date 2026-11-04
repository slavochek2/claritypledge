"""
P1307 Decision 5: reassemble one room member's archived audio into ≤5-minute WAV segments.

Archive layout (api.ts buildRoomAudioPathSegments + Decision 6's server-issued numbering).
The client asks for the first path; the out-of-repo signed-URL Cloud Function actually writes
the second (it prepends `sessions/` and strips the slashes). P1339: reading only the first found
zero chunks for every room, so both are read.

    gs://<bucket>/rooms/{room_code}/{sanitised-name}-{member_id}/[_dev_]chunk_NNN.wav|webm   (requested)
    gs://<bucket>/sessions/rooms{room_code}{sanitised-name}-{member_id}/[_dev_]chunk_NNN.wav|webm   (stored)

P1596: new clients upload each 30 s as a self-contained 16 kHz mono WAV (its own header). Older chunks are
30-second MediaRecorder flushes: Only the FIRST chunk of a MediaRecorder
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


def chunk_kind(head: bytes) -> str | None:
    """What a chunk's first bytes say it is: "webm" (EBML run header), "wav" (self-contained RIFF/WAVE),
    "mp4" (an ISO file, e.g. Safari audio that was labelled webm), or None (a WebM continuation).

    P1596: "wav" and "mp4" chunks carry their own header, so each decodes alone. Needs 12 bytes.
    """
    if head.startswith(EBML_MAGIC):
        return "webm"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    if head[4:8] == b"ftyp":
        return "mp4"
    return None


def is_standalone(data: bytes) -> bool:
    return chunk_kind(data[:12]) in ("wav", "mp4")

# Exact room-code alphabet (no I, O, 0, 1) — the same path-traversal gate audio.py in the
# /live worker applies to session codes (P858 mitigation #4). A code outside it could not
# have been generated and must never reach a GCS prefix.
_ROOM_CODE_RE = re.compile(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}")
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_CHUNK_FILE_RE = re.compile(r"(?:_dev_)?chunk_(\d{3,})\.(?:webm|wav)")


def validate_room_code(code: object) -> bool:
    return isinstance(code, str) and _ROOM_CODE_RE.fullmatch(code) is not None


def validate_member_id(member_id: object) -> bool:
    return isinstance(member_id, str) and _UUID_RE.fullmatch(member_id) is not None


@dataclass(frozen=True)
class ChunkRef:
    number: int
    object_name: str
    created_ms: int


def room_listing_prefixes(room_code: str) -> list[str]:
    """Object-name prefixes that can hold this room's chunks — requested layout, then stored."""
    return [f"rooms/{room_code}/", f"sessions/rooms{room_code}"]


def select_member_chunks(objects: list[tuple[str, int]], room_code: str, member_id: str) -> list[ChunkRef]:
    """From (object_name, created_ms) pairs under the room's prefixes, keep this member's chunks in order.

    The member directory ends `{sanitised-name}-{member_id}`. The name part is not trusted or
    needed — matching on the member-id suffix is what binds a directory to a member, the same
    way gcs-signed-url binds the prefix to the caller's member row.
    """
    by_number: dict[int, ChunkRef] = {}
    for name, created_ms in objects:
        prefix = next((p for p in room_listing_prefixes(room_code) if name.startswith(p)), None)
        if prefix is None:
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


def wav_duration_ms(data: bytes) -> int:
    """Length of one self-contained WAV chunk in ms (0 when it cannot be read)."""
    try:
        with wave.open(io.BytesIO(data)) as w:
            return w.getnframes() * 1000 // max(1, w.getframerate())
    except (wave.Error, EOFError):
        return 0


def _time_gap_before(prev: tuple[ChunkRef, bytes], cur: tuple[ChunkRef, bytes],
                     nxt: tuple[ChunkRef, bytes] | None, chunk_s: int = 30) -> bool:
    """True when `cur` follows `prev` (consecutive numbers) after a real stretch of time with no audio: a reload,
    a rejoin, a mic recovery. Object times of one run tick at the chunk length; a step beyond the tolerance that
    STAYS (the next chunk is late by as much) is a gap, a single slow upload comes back, and chunks that landed
    together after an outage (a flush) are one stretch of audio, not a gap.
    """
    length = chunk_s * 1000
    dur_cur, dur_nxt = wav_duration_ms(cur[1]), wav_duration_ms(nxt[1]) if nxt else 0
    step = cur[0].created_ms - prev[0].created_ms - dur_cur - (cur[0].number - prev[0].number - 1) * length
    if step <= CHUNK_JUMP_TOLERANCE_S * 1000:
        return False
    if nxt is None:
        return step > FINAL_CHUNK_TOLERANCE_S * 1000
    if nxt[0].created_ms - cur[0].created_ms < (nxt[0].number - cur[0].number) * length * CHUNK_BUNCH_FRACTION:
        return False
    lost = (nxt[0].number - prev[0].number - 2) * length   # chunks missing between prev and nxt took time too
    return nxt[0].created_ms - prev[0].created_ms - dur_cur - dur_nxt - lost > CHUNK_JUMP_TOLERANCE_S * 1000


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
    for idx, (ref, data) in enumerate(chunks):
        gap_before = previous_number is not None and ref.number != previous_number + 1
        previous_number = ref.number
        if is_standalone(data):
            # P1596: a self-contained chunk joins the run of self-contained chunks before it (consecutive
            # numbers, no stretch of missing time between them), so a recording reads as one stretch exactly as
            # one MediaRecorder run did; after a reload or a rejoin the run starts again at its own time.
            nxt = chunks[idx + 1] if idx + 1 < len(chunks) else None
            if (current is not None and not gap_before and is_standalone(current[0][1])
                    and not _time_gap_before(current[-1], (ref, data), nxt)):
                current.append((ref, data))
            else:
                current = [(ref, data)]
                runs.append(current)
        elif data.startswith(EBML_MAGIC):
            current = [(ref, data)]
            runs.append(current)
        elif current is not None and not gap_before and not is_standalone(current[0][1]):
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


def run_end_ms(run: list[tuple[ChunkRef, bytes]]) -> int:
    """P1596 anchor: server-clock time the run's LAST chunk object was created (GCS time_created).

    That is the end of its audio plus the upload delay. list_room_objects already returns
    time_created as created_ms and ChunkRef carries it, so no listing change is needed.
    """
    return run[-1][0].created_ms


# P1596: per-chunk placement on the server clock.
#
# A pause keeps ONE MediaRecorder (recorder.pause), so a run's decoded PCM has no gap where the pause was:
# anchoring a whole run on its last object would slide everything before the pause onto the wrong time.
# Each chunk is therefore placed by its own object time, corrected for upload delay.
#
# Inside a stretch (chunks the recorder produced back to back) chunk n ENDS at base + (n+1) * L, whatever the
# upload delays were; only `base` is unknown. A chunk's object time is its end plus its upload delay (>= 0), so
# the delay of the typical chunk is the median of (created - (n+1) * L), which one slow upload cannot move and
# one short final chunk cannot move. A pause, or an upload outage, shows as a jump in object times beyond the
# chunk length plus a tolerance: it starts a new stretch with its own base. Chunks that landed together after an
# outage (flush) all carry the same object time, so they are spread back from the last of them instead.
UPLOAD_JITTER_MS = 2500       # P1611: largest upload wander treated as noise (measured up to about 2 s on a wired link)
CHUNK_JUMP_TOLERANCE_S = 5
CHUNK_BUNCH_FRACTION = 0.5   # a gap in object times under this fraction of the chunk length marks a flush
FINAL_CHUNK_TOLERANCE_S = 20  # a last chunk (nothing after it to confirm a pause) is unconfirmed only beyond this
CHUNK_MARGIN_S = 10          # extra audio kept around the window (the aligner can shift a mic by up to 5 s)


def chunk_end_times(refs: list[ChunkRef], chunk_s: int = 30, tol_s: int = CHUNK_JUMP_TOLERANCE_S,
                    durations_ms: dict[int, int] | None = None) -> dict[int, int]:
    """chunk number -> estimated server-clock end (ms) of that chunk's audio.

    Never later than its object time. P1611: inside a stretch each chunk takes the tightest bound from its own and
    every later upload, so upload jitter does not displace it against the other mics.

    A stretch breaks where created-minus-expected (the upload delay plus the unknown base) STEPS by more than
    tol_s and STAYS there for the next chunk too (a pause of any length: the recorder produced nothing, later
    chunks are all later). A single slow upload comes back on the next chunk, so it breaks nothing.
    """
    length = chunk_s * 1000
    tol = tol_s * 1000
    final_tol = FINAL_CHUNK_TOLERANCE_S * 1000
    ordered = sorted(refs, key=lambda r: r.number)
    # Expected cumulative end of chunk n = sum of the actual durations of chunks 0..n (a pause flushes a partial
    # chunk, so not every chunk is `length`). A chunk with no known duration counts as a full one.
    dur = durations_ms or {}
    expected: dict[int, int] = {}
    acc = 0
    for n in range(0, (ordered[-1].number + 1) if ordered else 0):
        acc += dur.get(n, length)
        expected[n] = acc
    delay = {r.number: r.created_ms - expected[r.number] for r in ordered}

    def median(vals: list[int]) -> int:
        v = sorted(vals)
        m = len(v) // 2
        return v[m] if len(v) % 2 else (v[m - 1] + v[m]) // 2

    stretches: list[list[ChunkRef]] = []
    unconfirmed: set[int] = set()
    for idx, r in enumerate(ordered):
        if stretches:
            ref_d = median([delay[x.number] for x in stretches[-1]]) if stretches[-1] else delay[r.number]
            nxt = ordered[idx + 1] if idx + 1 < len(ordered) else None
            prev = stretches[-1][-1] if stretches[-1] else None
            joined = prev is not None and r.created_ms - prev.created_ms < (r.number - prev.number) * length * CHUNK_BUNCH_FRACTION
            late = delay[r.number] - ref_d > tol
            if (late and not joined and stretches[-1]
                    and ((nxt is None and delay[r.number] - ref_d > final_tol)
                         or (nxt is not None and delay[nxt.number] - ref_d > tol and abs(delay[nxt.number] - delay[r.number]) > tol
                             and nxt.created_ms - r.created_ms >= (nxt.number - r.number) * length * CHUNK_BUNCH_FRACTION))):
                unconfirmed.add(r.number)   # a pause or a slow upload, and nothing after it says which
                continue
            if (not joined and abs(delay[r.number] - ref_d) > tol and nxt is not None
                    and abs(delay[nxt.number] - ref_d) > tol
                    and (abs(delay[nxt.number] - delay[r.number]) <= tol
                         or nxt.created_ms - r.created_ms < (nxt.number - r.number) * length * CHUNK_BUNCH_FRACTION)):
                stretches.append([])
        if not stretches:
            stretches.append([])
        stretches[-1].append(r)
    out: dict[int, int] = {}      # an unconfirmed chunk has no entry: the caller counts it as missing
    for st in stretches:
        flush: set[int] = set()
        for a, b in zip(st, st[1:]):
            if b.created_ms - a.created_ms < (b.number - a.number) * length * CHUNK_BUNCH_FRACTION:
                flush.update((a.number, b.number))
        regular = [r for r in st if r.number not in flush]
        if regular:
            vals = sorted(r.created_ms - expected[r.number] for r in regular)
            m = len(vals) // 2
            base = vals[m] if len(vals) % 2 else (vals[m - 1] + vals[m]) // 2
        else:
            last = st[-1]
            base = last.created_ms - expected[last.number]
        # P1611: a chunk's audio ended no later than its own upload, nor later than any later chunk's upload minus the
        # audio recorded in between, so the smallest such delay is a hard bound. Chunks stay end to end on that bound,
        # so upload jitter cannot move them; only a lasting rise above UPLOAD_JITTER_MS (a real short pause) opens a gap.
        suffix_min: dict[int, int] = {}
        low = None
        for r in reversed(st):
            d = r.created_ms - expected[r.number]
            # A final chunk of unknown length may be short, so its delay is not evidence about the chunks before it.
            if r.number in dur or len(flush) > 2 or r is not ordered[-1]:   # three or more bunched is an offline flush, not a short tail
                low = d if low is None else min(low, d)
            suffix_min[r.number] = d if low is None else low
        anchor = None
        for r in st:
            # The last chunk has no later upload to confirm a rise, so one slow upload there needs the full tolerance.
            limit = tol if r is st[-1] else UPLOAD_JITTER_MS
            if anchor is None or suffix_min[r.number] - anchor > limit:
                anchor = suffix_min[r.number]
            end = expected[r.number] + anchor
            out[r.number] = end if r.number in dur else min(end, r.created_ms)
    return out


NEAR_WINDOW_MS = 5 * 60 * 1000


def chunk_pieces(refs: list[ChunkRef], lo_ms: int, hi_ms: int, is_header: dict[int, str | None],
                 fetch, decode, chunk_s: int = 30, margin_s: int = CHUNK_MARGIN_S) -> tuple[list[tuple[int, bytes]], dict]:
    """One mic's chunks overlapping [lo_ms, hi_ms] (plus a margin) -> [(end_ms, pcm)], one entry per chunk.

    Every chunk is decoded on its own: a header chunk alone, any other chunk as (its run's header chunk +
    itself) with the header chunk's own audio cut off the front. Only overlapping chunks, and the header chunks
    they need, are downloaded. A chunk with no header before it, or that decodes to nothing, is `missing`
    (counted, never raised). fetch(ref) -> bytes, decode(bytes) -> PCM.
    """
    margin = margin_s * 1000
    header_of: dict[int, int | None] = {}
    current: int | None = None
    for r in sorted(refs, key=lambda x: x.number):
        kind = is_header.get(r.number)
        if kind in ("wav", "mp4"):
            header_of[r.number] = r.number     # P1596: its own header; a WebM continuation never hangs from it
            current = None
            continue
        if kind:
            current = r.number
        header_of[r.number] = current
    by_number = {r.number: r for r in refs}
    cache: dict[int, tuple[bytes, int]] = {}   # header number -> (bytes, decoded length)
    blobs: dict[int, bytes] = {}               # chunk bytes (small); PCM is never kept for the whole mic

    def get(ref: ChunkRef) -> bytes:
        if ref.number not in blobs:
            blobs[ref.number] = fetch(ref)
        return blobs[ref.number]

    def decode_chunk(r: ChunkRef) -> bytes:
        h = header_of[r.number]
        if h is None:
            return b""
        try:
            if h not in cache:
                hb = get(by_number[h])
                cache[h] = (hb, len(decode(hb)))
            head_bytes, head_len = cache[h]
            if h == r.number:
                return decode(head_bytes)
            full = decode(head_bytes + get(r))
            return full[head_len - head_len % BYTES_PER_SAMPLE:]
        except RuntimeError:
            return b""

    # Decode first: each chunk's ACTUAL duration (a pause flushes a partial chunk) drives its expected position.
    # Only chunks uploaded near the window: every round must not re-read the person's whole event.
    near = [r for r in refs if lo_ms - NEAR_WINDOW_MS <= r.created_ms <= hi_ms + NEAR_WINDOW_MS]
    refs = near
    durations: dict[int, int] = {}
    for r in sorted(refs, key=lambda x: x.number):
        pcm = decode_chunk(r)
        if pcm:
            durations[r.number] = pcm_duration_ms(pcm)
    ends = chunk_end_times(refs, chunk_s, durations_ms=durations)
    pieces: list[tuple[int, bytes]] = []
    missing = 0
    for r in sorted(refs, key=lambda x: x.number):
        if r.number not in ends:
            missing += 1          # placement unconfirmed
            continue
        end = ends[r.number]
        if end < lo_ms - margin or end - durations.get(r.number, chunk_s * 1000) > hi_ms + margin:
            continue
        pcm = decode_chunk(r) if r.number in durations else b""
        if not pcm:
            missing += 1
            continue
        pieces.append((end, pcm))
    return pieces, {"chunks": len(refs), "used": len(pieces), "missing": missing}


# ── I/O ────────────────────────────────────────────────────────────────────────


ROOM_PIECE_MAX_S = 15 * 60   # P1596: a room run is decoded and transcribed in pieces of at most this length


def iter_run_pieces(run: list[tuple[ChunkRef, bytes]], max_s: int = ROOM_PIECE_MAX_S, chunk_s: int = 30,
                    decode=None):
    """Yield (offset_ms, pcm) for one run in pieces of at most max_s seconds, so a 2 h run never sits in memory whole.

    Each group of chunks after the first is decoded together with the run's header chunk, whose own audio is cut
    off the front. The caller drops each piece before taking the next.
    """
    decode = decode or decode_bytes_to_pcm
    per_group = max(1, max_s // chunk_s)
    if is_standalone(run[0][1]):
        # P1596: every chunk has its own header, so each is decoded alone (joining files would stop at the
        # second header) and the group's PCM is laid end to end.
        done_bytes = 0
        for i in range(0, len(run), per_group):
            pcm = b"".join(decode(d) for _, d in run[i:i + per_group])
            yield (done_bytes // BYTES_PER_SAMPLE) * 1000 // TARGET_SAMPLE_RATE, pcm
            done_bytes += len(pcm)
        return
    header = run[0][1]
    head_len: int | None = None
    done_bytes = 0
    for i in range(0, len(run), per_group):
        data = b"".join(d for _, d in run[i:i + per_group])
        if i == 0:
            pcm = decode(data)
        else:
            if head_len is None:
                head_len = len(decode(header))
            pcm = decode(header + data)[head_len - head_len % BYTES_PER_SAMPLE:]
        offset_ms = (done_bytes // BYTES_PER_SAMPLE) * 1000 // TARGET_SAMPLE_RATE
        done_bytes += len(pcm)
        yield offset_ms, pcm


def decode_run_to_pcm(run: list[tuple[ChunkRef, bytes]]) -> bytes:
    """Concatenate one run's chunks and decode to 16 kHz mono 16-bit PCM with ffmpeg."""
    return decode_bytes_to_pcm(b"".join(data for _, data in run))


def decode_bytes_to_pcm(stream: bytes) -> bytes:
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
    """(object_name, created_ms) for everything under the room's prefixes. Service account only."""
    from google.cloud import storage

    if not validate_room_code(room_code):
        raise ValueError("invalid room code")
    client = storage.Client()
    return [
        (blob.name, int(blob.time_created.timestamp() * 1000))
        for prefix in room_listing_prefixes(room_code)
        for blob in client.list_blobs(bucket_name, prefix=prefix)
    ]


def download_objects(bucket_name: str, refs: list[ChunkRef]) -> list[tuple[ChunkRef, bytes]]:
    from google.cloud import storage

    bucket = storage.Client().bucket(bucket_name)
    return [(ref, bucket.blob(ref.object_name).download_as_bytes()) for ref in refs]


def peek_headers(bucket_name: str, refs: list[ChunkRef]) -> dict[int, str | None]:
    """number -> chunk_kind of the object ("webm", "wav", "mp4", or None). Reads twelve bytes per object."""
    from google.cloud import storage

    bucket = storage.Client().bucket(bucket_name)
    out: dict[int, str | None] = {}
    for ref in refs:
        head = bucket.blob(ref.object_name).download_as_bytes(start=0, end=11)
        out[ref.number] = chunk_kind(head)
    return out


def download_one(bucket_name: str, ref: ChunkRef) -> bytes:
    from google.cloud import storage

    return storage.Client().bucket(bucket_name).blob(ref.object_name).download_as_bytes()
