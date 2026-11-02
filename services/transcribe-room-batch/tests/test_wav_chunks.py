"""P1596: the archive is self-contained 16 kHz mono WAV chunks (one header each), read next to old WebM runs."""

import io
import wave

import audio
from audio import EBML_MAGIC, ChunkRef

MEMBER = "33333333-3333-4333-8333-333333333333"
L = 30
S = 1000


def ref(n: int, created_ms: int = 0, ext: str = "wav") -> ChunkRef:
    return ChunkRef(number=n, object_name=f"rooms/ABC234/alice-{MEMBER}/chunk_{n:03d}.{ext}", created_ms=created_ms)


def wav(seconds: float, value: int = 1) -> bytes:
    n = int(seconds * audio.TARGET_SAMPLE_RATE)
    return audio.encode_wav(value.to_bytes(2, "little", signed=True) * n)


def decode_wav_only(b: bytes) -> bytes:
    """Stands in for ffmpeg: reads exactly one WAV (a second header inside would be wrong)."""
    assert b.startswith(b"RIFF") and b.count(b"RIFF") == 1, "a WAV chunk must be decoded alone"
    with wave.open(io.BytesIO(b)) as w:
        return w.readframes(w.getnframes())


def test_select_member_chunks_reads_wav_and_webm_names_together():
    objects = [
        (f"rooms/ABC234/alice-{MEMBER}/chunk_000.webm", 1),
        (f"rooms/ABC234/alice-{MEMBER}/chunk_001.wav", 2),
        (f"rooms/ABC234/alice-{MEMBER}/_dev_chunk_002.wav", 3),
        (f"sessions/roomsABC234alice-{MEMBER}/chunk_003.wav", 4),
        (f"rooms/ABC234/alice-{MEMBER}/chunk_004.mp3", 5),
    ]
    refs = audio.select_member_chunks(objects, "ABC234", MEMBER)
    assert [r.number for r in refs] == [0, 1, 2, 3]


def test_chunk_kind_names_what_the_first_bytes_are():
    assert audio.chunk_kind(EBML_MAGIC + b"xxxx") == "webm"
    assert audio.chunk_kind(wav(0.1)[:12]) == "wav"
    assert audio.chunk_kind(b"\x00\x00\x00\x1cftypisom") == "mp4"
    assert audio.chunk_kind(b"continuation") is None


def test_consecutive_wav_chunks_are_one_run_and_a_gap_starts_a_new_one():
    chunks = [(ref(n), wav(1)) for n in (0, 1, 2, 4, 5)]
    runs, orphaned = audio.split_into_runs(chunks)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1, 2], [4, 5]]
    assert orphaned == 0


def test_a_long_pause_between_wav_chunks_starts_a_new_run_so_time_does_not_collapse():
    # chunks 0-2 land on the 30 s beat; 3 and 4 land ten minutes later, on the beat again: a reload or a mic
    # recovery. One run would lay them end to end and put the later words minutes too early.
    beat = [(ref(0, 30 * S), wav(30)), (ref(1, 60 * S), wav(30)), (ref(2, 90 * S), wav(30)),
            (ref(3, 700 * S), wav(30)), (ref(4, 730 * S), wav(30))]
    runs, orphaned = audio.split_into_runs(beat)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1, 2], [3, 4]]
    assert orphaned == 0


def test_chunks_that_landed_together_after_an_outage_stay_one_run():
    # an upload outage: the audio is continuous, the objects bunch up at one instant. That is not a gap.
    bunched = [(ref(0, 30 * S), wav(30)), (ref(1, 60 * S), wav(30)), (ref(2, 700 * S), wav(30)),
               (ref(3, 700 * S + 200), wav(30)), (ref(4, 700 * S + 400), wav(30))]
    runs, _ = audio.split_into_runs(bunched)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1, 2, 3, 4]]


def test_a_slow_single_upload_does_not_split_a_run():
    slow = [(ref(0, 30 * S), wav(30)), (ref(1, 68 * S), wav(30)), (ref(2, 90 * S), wav(30)), (ref(3, 120 * S), wav(30))]
    runs, _ = audio.split_into_runs(slow)
    assert len(runs) == 1


def test_a_short_tail_after_a_pause_starts_a_new_run_even_when_it_is_the_last_chunk():
    last = [(ref(0, 30 * S), wav(30)), (ref(1, 60 * S), wav(30)), (ref(2, 900 * S), wav(30))]
    runs, _ = audio.split_into_runs(last)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1], [2]]


def test_a_wav_chunk_is_never_an_orphan_when_its_neighbours_are_lost():
    runs, orphaned = audio.split_into_runs([(ref(7), wav(1))])
    assert len(runs) == 1 and orphaned == 0


def test_mixed_webm_run_then_wav_run_reads_both():
    head, cont = EBML_MAGIC + b"h", b"cont"
    chunks = [(ref(0, ext="webm"), head), (ref(1, ext="webm"), cont), (ref(2), wav(1)), (ref(3), wav(1))]
    runs, orphaned = audio.split_into_runs(chunks)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1], [2, 3]]
    assert orphaned == 0


def test_a_webm_continuation_after_a_wav_run_is_orphaned_not_glued_to_it():
    chunks = [(ref(0), wav(1)), (ref(1, ext="webm"), b"cont")]
    runs, orphaned = audio.split_into_runs(chunks)
    assert len(runs) == 1 and orphaned == 1


def test_a_wav_run_is_decoded_chunk_by_chunk_with_continuous_offsets():
    run = [(ref(n), wav(2, value=n + 1)) for n in range(4)]
    pieces = list(audio.iter_run_pieces(run, max_s=4, chunk_s=2, decode=decode_wav_only))
    assert [off for off, _ in pieces] == [0, 4000]
    assert [audio.pcm_duration_ms(p) for _, p in pieces] == [4000, 4000]


def test_wav_chunks_are_placed_by_their_own_object_time_and_never_need_a_header_neighbour():
    refs = [ref(n, 1000 + (n + 1) * L * S) for n in range(6)]
    blobs = {n: wav(L, value=n + 1) for n in range(6)}
    fetched = []

    def fetch(r):
        fetched.append(r.number)
        return blobs[r.number]

    heads = {n: audio.chunk_kind(blobs[n][:12]) for n in range(6)}
    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, heads, fetch, decode_wav_only, L)
    assert stats == {"chunks": 6, "used": 6, "missing": 0}
    assert [e for e, _ in pieces] == [1000 + (n + 1) * L * S for n in range(6)]


def test_a_wav_after_a_pause_is_placed_after_the_pause_not_flush_to_the_previous_chunk():
    # Four chunks, a 120 s pause (no objects), then three more: numbers stay consecutive.
    created = [1000 + (n + 1) * L * S for n in range(4)] + [1000 + (n + 1) * L * S + 120 * S for n in range(4, 7)]
    refs = [ref(n, c) for n, c in enumerate(created)]
    blobs = {n: wav(L) for n in range(7)}
    heads = {n: "wav" for n in range(7)}
    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, heads, lambda r: blobs[r.number], decode_wav_only, L)
    ends = [e for e, _ in pieces]
    assert stats["missing"] == 0
    assert ends[4] - ends[3] >= 150 * S


def test_the_reader_never_calls_requestData_or_a_header_for_wav():
    # chunk_pieces with all-wav heads must not need an EBML header anywhere.
    refs = [ref(0, 1000 + L * S)]
    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, {0: "wav"}, lambda r: wav(L), decode_wav_only, L)
    assert stats["used"] == 1 and len(pieces) == 1


def test_an_mp4_labelled_webm_decodes_alone_instead_of_vanishing():
    mp4 = b"\x00\x00\x00\x1cftypisom" + b"\x00" * 20
    refs = [ref(0, 1000 + L * S, ext="webm")]
    pcm = b"\x01\x00" * 16000
    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, {0: "mp4"}, lambda r: mp4, lambda b: pcm, L)
    assert stats["used"] == 1 and stats["missing"] == 0
    runs, orphaned = audio.split_into_runs([(refs[0], mp4)])
    assert len(runs) == 1 and orphaned == 0


def test_lost_chunks_after_a_late_one_are_not_a_false_gap():
    # chunk 1 uploaded 40 s late; chunks 2-4 were lost; chunk 5 is back on the beat. One slow upload, not a gap.
    chunks = [(ref(0, 30 * S), wav(30)), (ref(1, 100 * S), wav(30)), (ref(5, 180 * S), wav(30))]
    assert audio._time_gap_before(chunks[0], chunks[1], chunks[2]) is False
