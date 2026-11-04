"""P1596 review fixes: per-chunk placement on the server clock, and decoding chunk by chunk."""

import audio
from audio import ChunkRef

L = 30
S = 1000


def ref(n, created_s):
    return ChunkRef(number=n, object_name=f"c{n}", created_ms=int(created_s * S))


def ends(refs):
    return {n: v / S for n, v in audio.chunk_end_times(refs, L).items()}


def test_steady_uploads_end_at_their_flush_time():
    e = ends([ref(n, 1000 + (n + 1) * L + 2) for n in range(6)])
    for n in range(6):
        assert abs(e[n] - (1000 + (n + 1) * L)) <= 2.5


def test_a_30s_delayed_last_chunk_is_unconfirmed_and_moves_nothing_else():
    refs = [ref(n, 1000 + (n + 1) * L) for n in range(5)] + [ref(5, 1000 + 6 * L + 30)]
    e = ends(refs)
    assert 5 not in e                    # a pause or a slow upload: placement cannot be told, so not placed
    assert all(e[n] == 1000 + (n + 1) * L for n in range(5))


def test_a_post_pause_final_chunk_is_unconfirmed():
    refs = [ref(n, 1000 + (n + 1) * L) for n in range(5)] + [ref(5, 1000 + 6 * L + 90)]
    e = ends(refs)
    assert 5 not in e and set(e) == {0, 1, 2, 3, 4}


def test_a_chunk_between_two_pauses_is_unconfirmed():
    a = [ref(n, 1000 + (n + 1) * L) for n in range(4)]
    x = [ref(4, 1000 + 5 * L + 60)]
    b = [ref(n, 1000 + (n + 1) * L + 200) for n in range(5, 9)]
    e = ends(a + x + b)
    assert 4 not in e
    assert all(e[n] == 1000 + (n + 1) * L for n in range(4))
    assert all(e[n] == 1000 + (n + 1) * L + 200 for n in range(5, 9))


def test_a_normal_final_chunk_stays_placed():
    refs = [ref(n, 1000 + (n + 1) * L + 1) for n in range(6)]
    assert set(ends(refs)) == set(range(6))


def test_one_slow_upload_in_the_middle_does_not_move_the_others():
    refs = [ref(n, 1000 + (n + 1) * L + (20 if n == 3 else 0)) for n in range(8)]
    e = ends(refs)
    assert all(e[n] == 1000 + (n + 1) * L for n in range(8))


def test_an_8_minute_pause_inside_one_run_is_a_gap_on_the_timeline():
    before = [ref(n, 1000 + (n + 1) * L) for n in range(4)]          # ends 1030..1120
    after = [ref(n, 1000 + 4 * L + 480 + (n - 3) * L) for n in range(4, 8)]
    e = ends(before + after)
    assert e[3] == 1120
    assert e[4] == 1120 + 480 + L        # the pause is not collapsed
    assert e[7] == e[4] + 3 * L


def test_an_offline_flush_is_spread_back_from_its_last_chunk():
    online = [ref(n, 1000 + (n + 1) * L) for n in range(4)]          # to 1120
    flushed = [ref(n, 1361 + 0.1 * (n - 4)) for n in range(4, 12)]   # eight chunks land together
    e = ends(online + flushed)
    assert abs(e[11] - 1361.7) < 1
    assert abs(e[4] - (1361.7 - 7 * L)) < 1
    assert abs(e[4] - 1150) < 12


def test_a_short_final_chunk_never_ends_after_its_upload():
    refs = [ref(n, 1000 + (n + 1) * L) for n in range(5)] + [ref(5, 1000 + 5 * L + 12)]
    e = ends(refs)
    assert e[5] == 1000 + 5 * L + 12
    assert e[0] == 1000 + L


def test_a_missing_number_keeps_the_pace():
    refs = [ref(n, 1000 + (n + 1) * L) for n in (0, 1, 2, 4, 5)]
    e = ends(refs)
    assert e[4] == 1000 + 5 * L


# --- chunk-by-chunk decode ---------------------------------------------------------------------------

HDR = audio.EBML_MAGIC + b"hdr"


def make_io(blobs, pcm_len=100):
    calls = {"fetch": [], "decode": []}

    def fetch(r):
        calls["fetch"].append(r.number)
        return blobs[r.number]

    def decode(b):
        calls["decode"].append(b)
        return b"\x01\x00" * len(b)

    return fetch, decode, calls


def test_only_chunks_overlapping_the_window_and_their_header_are_downloaded():
    refs = [ref(n, 1000 + (n + 1) * L) for n in range(20)]
    blobs = {n: (HDR if n == 0 else b"cont%02d" % n) + b"xxxxxx" for n in range(20)}
    fetch, _, calls = make_io(blobs)

    def decode(b):   # 30 s per chunk; header + continuation decodes to two chunks' worth
        calls["decode"].append(b)
        return b"\x01\x00" * (480000 * (1 if len(b) <= len(HDR) + 6 else 2))

    heads = {n: n == 0 for n in range(20)}
    pieces, stats = audio.chunk_pieces(refs, (1000 + 10 * L) * S, (1000 + 12 * L) * S, heads, fetch, decode, L)
    assert sorted(set(calls["fetch"])) == list(range(20))   # every chunk is decoded first for its true duration
    assert stats["missing"] == 0
    assert all(isinstance(e, int) for e, _ in pieces)


def test_a_chunk_whose_header_is_unavailable_is_missing_not_an_error():
    refs = [ref(n, 1000 + (n + 1) * L) for n in range(3)]
    blobs = {n: b"cont" for n in range(3)}
    fetch, decode, _ = make_io(blobs)
    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, {0: False, 1: False, 2: False}, fetch, decode, L)
    assert pieces == [] and stats["missing"] == 3


def test_a_continuation_chunk_decodes_with_its_run_header_and_drops_the_header_audio():
    refs = [ref(0, 0.006), ref(1, 0.012)]   # the fake PCM is 6 ms per chunk
    blobs = {0: HDR + b"a", 1: b"cont"}
    seen = []

    def fetch(r):
        return blobs[r.number]

    def decode(b):
        seen.append(b)
        return b"\x01\x00" * (200 if b == HDR + b"acont" else 100)   # header alone = 100 samples, both = 200

    pieces, stats = audio.chunk_pieces(refs, 0, 10**9, {0: True, 1: False}, fetch, decode, L)
    assert HDR + b"acont" in seen
    assert [len(p) for _, p in pieces] == [200, 200]     # 100 samples each (2 bytes per sample)
    assert stats["missing"] == 0


def _paused(pause_s, n_before=4, n_after=4):
    before = [ref(n, 1000 + (n + 1) * L + 2) for n in range(n_before)]
    after = [ref(n, 1000 + (n + 1) * L + pause_s + 2) for n in range(n_before, n_before + n_after)]
    return before + after


def test_a_30s_pause_is_placed_exactly():
    e = ends(_paused(30))
    for n in range(4):
        assert e[n] == 1000 + (n + 1) * L + 2
    for n in range(4, 8):
        assert e[n] == 1000 + (n + 1) * L + 30 + 2


def test_a_60s_pause_is_placed_exactly():
    e = ends(_paused(60))
    for n in range(4, 8):
        assert e[n] == 1000 + (n + 1) * L + 60 + 2
    assert e[3] == 1000 + 4 * L + 2


def test_a_single_15s_spike_moves_neither_neighbour():
    refs = [ref(n, 1000 + (n + 1) * L + (15 if n == 4 else 0)) for n in range(9)]
    e = ends(refs)
    assert all(e[n] == 1000 + (n + 1) * L for n in range(9))


def test_no_pause_control_with_jittery_uploads():
    refs = [ref(n, 1000 + (n + 1) * L + (n % 3)) for n in range(9)]
    e = ends(refs)
    spread = [e[n] - (n + 1) * L for n in range(9)]
    assert max(spread) - min(spread) <= 2


def test_a_pause_followed_by_a_short_final_chunk_pair():
    e = ends(_paused(45, 3, 2))
    assert e[3] == 1000 + 4 * L + 47 and e[4] == 1000 + 5 * L + 47


def test_a_partial_chunk_from_a_pause_does_not_shift_earlier_chunks():
    refs = [ref(n, t) for n, t in enumerate([30, 40, 70, 100, 130, 160])]
    durations = {0: 30000, 1: 10000, 2: 30000, 3: 30000, 4: 30000, 5: 30000}
    e = {n: v / S for n, v in audio.chunk_end_times(refs, L, durations_ms=durations).items()}
    assert e[0] == 30 and e[1] == 40 and e[5] == 160


def test_a_final_chunk_6s_late_is_kept_but_30s_late_is_unconfirmed():
    base = [ref(n, 1000 + (n + 1) * L) for n in range(5)]
    assert 5 in ends(base + [ref(5, 1000 + 6 * L + 6)])
    assert 5 in ends(base + [ref(5, 1000 + 6 * L + 20)])
    assert 5 not in ends(base + [ref(5, 1000 + 6 * L + 30)])


def test_chunks_far_from_the_window_are_not_downloaded():
    from audio import ChunkRef, chunk_pieces
    refs = [ChunkRef(number=i, object_name=f"o{i}", created_ms=(i + 1) * 30_000) for i in range(240)]
    fetched = []

    def fetch(r):
        fetched.append(r.number)
        return b"x"

    lo, hi = 100 * 30_000, 110 * 30_000
    chunk_pieces(refs, lo, hi, {0: True}, fetch, lambda b: b"\0\0" * 16000 * 30)
    # the run's header chunk, plus only chunks within 5 minutes of the window
    assert set(fetched) <= {0} | set(range(89, 122))


# --- P1611: a run of consecutive chunks sits end to end, whatever each upload's own jitter ------------------

JITTER = [0, 3, 1, 2.5, 0.5, 3, 1.5]       # upload delay of each chunk, seconds (real gaps wandered 27.9 to 31.3 s)


def _full(n):
    return {i: L * S for i in range(n)}


def _ends_d(refs, durations=None):
    return {n: v / S for n, v in audio.chunk_end_times(refs, L, durations_ms=durations).items()}


def test_jittered_uploads_still_place_chunks_end_to_end():
    refs = [ref(n, 1000 + (n + 1) * L + JITTER[n]) for n in range(7)]
    e = _ends_d(refs, _full(7))
    assert [round(e[n] - e[0], 6) for n in range(7)] == [n * L for n in range(7)]   # exactly one chunk apart
    assert e[0] == 1000 + L + min(JITTER[:7])                                      # the lowest delay: never after an upload
    assert all(e[n] <= refs[n].created_ms / S for n in range(7))


def test_a_jittered_run_is_not_moved_by_one_early_or_late_upload():
    late = [ref(n, 1000 + (n + 1) * L + (4 if n == 0 else JITTER[n])) for n in range(7)]
    e = _ends_d(late, _full(7))
    assert all(abs(e[n] - (1000 + (n + 1) * L + 1.5)) <= 1.5 for n in range(7))
    assert [round(e[n] - e[0], 6) for n in range(7)] == [n * L for n in range(7)]


def test_a_genuine_pause_stays_a_gap_among_jittered_uploads():
    before = [ref(n, 1000 + (n + 1) * L + JITTER[n]) for n in range(4)]
    after = [ref(n, 1000 + (n + 1) * L + 90 + JITTER[n - 4]) for n in range(4, 8)]
    e = _ends_d(before + after, _full(8))
    assert [round(e[n] - e[0], 6) for n in range(4)] == [n * L for n in range(4)]
    assert [round(e[n] - e[4], 6) for n in range(4, 8)] == [(n - 4) * L for n in range(4, 8)]
    assert abs(e[4] - e[3] - L - 90) <= 3                # the pause is not collapsed


def test_a_missing_number_leaves_a_hole_not_a_squeeze():
    refs = [ref(n, 1000 + (n + 1) * L + JITTER[n]) for n in (0, 1, 2, 4, 5, 6)]
    e = _ends_d(refs, {n: L * S for n in (0, 1, 2, 4, 5, 6)})
    assert round(e[4] - e[2], 6) == 2 * L and round(e[6] - e[0], 6) == 6 * L


def test_one_chunk_is_placed_at_its_own_time():
    assert _ends_d([ref(0, 1031)], {0: 30000}) == {0: 1031}


def test_a_short_last_chunk_follows_end_to_end_by_its_real_duration():
    refs = [ref(n, 1000 + (n + 1) * L + JITTER[n]) for n in range(6)]
    refs[5] = ref(5, 1000 + 5 * L + 12 + JITTER[5])
    d = _full(6)
    d[5] = 12000
    e = _ends_d(refs, d)
    assert round(e[5] - e[4], 6) == 12 and round(e[4] - e[0], 6) == 4 * L


def test_a_restart_after_a_reload_starts_a_new_run_with_its_own_anchor():
    first = [ref(n, 1000 + (n + 1) * L + JITTER[n]) for n in range(3)]
    second = [ref(n, 1000 + (n + 1) * L + 400 + JITTER[n]) for n in range(3, 6)]   # chunk numbers go on, time jumped
    e = _ends_d(first + second, _full(6))
    assert abs(e[3] - e[2] - L - 400) <= 3
    assert [round(e[n] - e[3], 6) for n in range(3, 6)] == [0, L, 2 * L]


def test_p1611_a_short_pause_stays_a_gap_and_nothing_lands_after_its_upload():
    # Reviewers' counterexample: uploads at 30, 64, 94 s, a 4 s pause after chunk 0, under the 5 s tolerance.
    refs = [audio.ChunkRef(number=n, object_name=f"c{n}", created_ms=t) for n, t in enumerate((30_000, 64_000, 94_000))]
    out = audio.chunk_end_times(refs, durations_ms={0: 30_000, 1: 30_000, 2: 30_000})
    assert out == {0: 30_000, 1: 64_000, 2: 94_000}
