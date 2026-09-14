"""P1307 Decision 5: the pure half of member audio reassembly."""

import wave
import io

import audio
from audio import EBML_MAGIC, ChunkRef

MEMBER = "33333333-3333-4333-8333-333333333333"
OTHER = "44444444-4444-4444-8444-444444444444"


def ref(n: int, created_ms: int = 0) -> ChunkRef:
    return ChunkRef(number=n, object_name=f"rooms/ABC234/alice-{MEMBER}/chunk_{n:03d}.webm", created_ms=created_ms)


def test_identifier_gates_reject_anything_that_could_not_have_been_generated():
    assert audio.validate_room_code("ABC234")
    for bad in ["abc234", "ABC23O", "../ABC", "ABC2345", None, 123]:
        assert not audio.validate_room_code(bad)
    assert audio.validate_member_id(MEMBER)
    assert not audio.validate_member_id("not-a-uuid")


def test_select_member_chunks_binds_on_member_id_and_orders_by_number():
    objects = [
        (f"rooms/ABC234/alice-{MEMBER}/chunk_002.webm", 3),
        (f"rooms/ABC234/alice-{MEMBER}/chunk_000.webm", 1),
        (f"rooms/ABC234/renamed-{MEMBER}/_dev_chunk_001.webm", 2),  # display name changed mid-room
        (f"rooms/ABC234/bob-{OTHER}/chunk_000.webm", 1),            # another member
        (f"rooms/ZZZ999/alice-{MEMBER}/chunk_003.webm", 4),         # another room
        (f"rooms/ABC234/alice-{MEMBER}/events.json", 5),            # not a chunk
    ]
    refs = audio.select_member_chunks(objects, "ABC234", MEMBER)
    assert [r.number for r in refs] == [0, 1, 2]


def test_missing_chunk_numbers_finds_gaps_including_a_lost_first_chunk():
    assert audio.missing_chunk_numbers([0, 1, 2]) == []
    assert audio.missing_chunk_numbers([0, 2, 3]) == [1]
    assert audio.missing_chunk_numbers([1, 2]) == [0]
    assert audio.missing_chunk_numbers([]) == []


def test_split_into_runs_starts_a_new_run_at_every_header():
    header, cont = EBML_MAGIC + b"h", b"continuation"
    chunks = [(ref(0), header), (ref(1), cont), (ref(2), header), (ref(3), cont)]
    runs, orphaned = audio.split_into_runs(chunks)
    assert [[r.number for r, _ in run] for run in runs] == [[0, 1], [2, 3]]
    assert orphaned == 0


def test_a_continuation_after_a_gap_or_without_a_header_is_orphaned_not_decoded_into_garbage():
    header, cont = EBML_MAGIC + b"h", b"continuation"
    # chunk 0 lost: 1 has no header to hang from. Chunk 3 follows a gap (2 missing).
    chunks = [(ref(1), cont), (ref(4), header), (ref(5), cont), (ref(7), cont)]
    runs, orphaned = audio.split_into_runs(chunks)
    assert [[r.number for r, _ in run] for run in runs] == [[4, 5]]
    assert orphaned == 2


def test_split_pcm_never_exceeds_the_segment_length_and_keeps_every_sample():
    sample_rate = 16_000
    seconds = 12
    pcm = b"\x01\x00" * (seconds * sample_rate)
    segments = audio.split_pcm(pcm, segment_seconds=5, sample_rate=sample_rate)
    assert [offset for offset, _ in segments] == [0, 5000, 10000]
    assert all(len(piece) <= 5 * sample_rate * 2 for _, piece in segments)
    assert sum(len(piece) for _, piece in segments) == len(pcm)


def test_encode_wav_declares_16k_mono_16bit_and_the_true_length():
    pcm = b"\x00\x00" * 16_000
    with wave.open(io.BytesIO(audio.encode_wav(pcm)), "rb") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 16_000, 16_000)


def test_run_start_is_one_chunk_interval_before_the_first_chunk_was_created():
    assert audio.run_start_ms(ref(0, created_ms=100_000), chunk_seconds=30) == 70_000
