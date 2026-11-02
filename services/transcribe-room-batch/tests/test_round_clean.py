import numpy as np
import pytest

import round_clean as rc
from round_clean import SR

AMP = 8000.0


def pcm(x):
    return np.clip(np.round(x), -32768, 32767).astype("<i2").tobytes()


def bursts(seconds, seed, n=14):
    """Noise bursts of irregular length/position, so the envelope has a unique shape."""
    rng = np.random.default_rng(seed)
    x = np.zeros(int(seconds * SR), np.float32)
    for _ in range(n):
        a = rng.uniform(0, seconds - 4)
        d = rng.uniform(0.4, 3.0)
        lo, hi = int(a * SR), int((a + d) * SR)
        x[lo:hi] = rng.normal(0, AMP, hi - lo)
    return x


def track_with(signal, start_ms, gain=1.0, floor=30.0, seed=0):
    noise = np.random.default_rng(seed).normal(0, floor, len(signal))
    return rc.Track(start_ms, (signal * gain + noise).astype(np.float32))


# --- place_on_timeline -------------------------------------------------------

def test_place_uses_anchor_minus_duration_and_fills_gap_with_silence():
    a = np.full(SR * 2, 100, np.float32)
    b = np.full(SR * 1, 200, np.float32)
    t = rc.place_on_timeline([(12_000, pcm(a)), (20_000, pcm(b))])  # a: 10-12 s, b: 19-20 s
    assert t.start_ms == 10_000
    assert len(t.samples) == 10 * SR
    assert t.samples[0] == 100 and t.samples[3 * SR] == 0 and t.samples[9 * SR] == 200


def test_place_empty_is_none():
    assert rc.place_on_timeline([]) is None
    assert rc.place_on_timeline([(5000, b"")]) is None


# --- refine_offsets ----------------------------------------------------------

@pytest.mark.parametrize("err_ms", [2300, -1700, 4000, 0])
def test_recovers_known_anchor_error_within_200ms(err_ms):
    sig = bursts(120, seed=1)
    ref = track_with(sig, 1_000_000, seed=10)
    # B hears the same speech quieter; its anchor is wrong by err_ms (placed err_ms too late)
    wrong = track_with(sig, 1_000_000 + err_ms, gain=0.4, seed=11)
    out = rc.refine_offsets({"a_ref": ref, "b": wrong})
    assert abs(out["b"].offset_ms - (-err_ms)) <= 200
    assert out["b"].confidence > 0.8


def test_known_bad_uncorrelated_tracks_keep_their_anchors():
    ref = track_with(bursts(120, seed=1), 0, seed=10)
    other = track_with(bursts(120, seed=2), 0, seed=11)
    out = rc.refine_offsets({"a": ref, "b": other})
    assert out["b"].offset_ms == 0 and out["b"].refined is False
    assert out["b"].confidence < rc.MIN_CONFIDENCE


def test_silent_track_keeps_anchor():
    ref = track_with(bursts(60, seed=1), 0)
    silent = rc.Track(0, np.zeros(60 * SR, np.float32))
    out = rc.refine_offsets({"a": ref, "b": silent})
    assert out["b"].offset_ms == 0 and out["b"].confidence == 0.0


def test_shift_beyond_max_is_not_recovered():
    sig = bursts(120, seed=1)
    out = rc.refine_offsets({"a": track_with(sig, 0), "b": track_with(sig, 9000, gain=0.4, seed=3)}, max_shift_s=5)
    assert out["b"].offset_ms == 0 or abs(out["b"].offset_ms + 9000) > 200  # never claims a lag it did not search


# --- loudest_masks -----------------------------------------------------------

def test_mask_rule_worked_example():
    # 6 s, 2 mics. Second 2 and 3: B louder. Second 0,1,4,5: A louder. (all non-silent)
    a = np.full(6 * SR, 1000.0, np.float32)
    b = np.full(6 * SR, 100.0, np.float32)
    b[2 * SR:4 * SR] = 5000.0
    a[2 * SR:4 * SR] = 200.0
    m = rc.loudest_masks({"a": a, "b": b})
    # B owns seconds 2,3 -> open [1.5, 5.5) s. A owns 0,1,4,5 -> open [0,2.5) and [3.5,6).
    on = lambda mask: [round(float(i) / SR, 2) for i in np.flatnonzero(np.diff(np.r_[0, mask, 0]))]
    assert on(m["b"]) == [1.5, 4.5]
    assert on(m["a"]) == [0.0, 2.5, 3.5, 6.0]


def test_ties_go_to_first_sorted_id_and_are_deterministic():
    x = np.full(3 * SR, 500.0, np.float32)
    m1 = rc.loudest_masks({"b": x.copy(), "a": x.copy()})
    m2 = rc.loudest_masks({"a": x.copy(), "b": x.copy()})
    assert m1["a"].all() and not m1["b"].any()
    assert (m1["a"] == m2["a"]).all() and (m1["b"] == m2["b"]).all()


def test_all_silent_seconds_are_owned_by_nobody():
    z = np.zeros(4 * SR, np.float32)
    m = rc.loudest_masks({"a": z, "b": z.copy()})
    assert not m["a"].any() and not m["b"].any()


def test_unequal_lengths_rejected():
    with pytest.raises(ValueError):
        rc.loudest_masks({"a": np.zeros(SR), "b": np.zeros(SR * 2)})


# --- clean_round -------------------------------------------------------------

def decode(wav):
    import io, wave
    with wave.open(io.BytesIO(wav)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32)


def test_two_speakers_each_speech_lands_only_on_own_track():
    dur = 20
    rng = np.random.default_rng(5)
    # tone-free noise speech: P speaks 0-3 and 7-13, Q speaks 3-7 and 13-20 (irregular turns: strictly alternating equal turns are periodic and alias under correlation). Each mic hears the
    # other person at 25% (bleed).
    p = np.zeros(dur * SR, np.float32); q = np.zeros(dur * SR, np.float32)
    for a, b in [(0, 3), (7, 13)]:
        p[a * SR:b * SR] = rng.normal(0, AMP, (b - a) * SR)
    for a, b in [(3, 7), (13, 20)]:
        q[a * SR:b * SR] = rng.normal(0, AMP, (b - a) * SR)
    mic_p = p + 0.25 * q
    mic_q = q + 0.25 * p
    base = 5_000_000
    members = {"P": [(base + dur * 1000, pcm(mic_p))], "Q": [(base + dur * 1000, pcm(mic_q))]}
    seen = []

    def fake(wav):
        x = decode(wav)
        seen.append(x)
        return "words"

    res = rc.clean_round(members, base, base + dur * 1000, fake)
    assert res.missing_member_ids == []
    # reconstruct what was sent per member: P's single 20 s chunk keeps only P's seconds (+pad)
    sent = {m: decode(rc._wav(rc._cut(rc.place_on_timeline(members[m]), base, base + dur * 1000)))
            for m in members}
    masks = rc.loudest_masks(sent)
    p_open, q_open = masks["P"], masks["Q"]
    assert p_open[1 * SR] == 1 and q_open[1 * SR] == 0       # P's speech second: only P's track
    assert q_open[5 * SR] == 1 and p_open[5 * SR] == 0       # Q's speech second: only Q's track
    # and what was actually transcribed matches: muted second 7 on P's chunk is exactly zero
    assert res.offsets['Q'].offset_ms == 0
    p_chunk, q_chunk = seen[0], seen[1]
    assert not np.any(p_chunk[int(4 * SR):int(6.4 * SR)]) and np.any(p_chunk[1 * SR:2 * SR])
    assert not np.any(q_chunk[1 * SR:int(2.4 * SR)]) and np.any(q_chunk[5 * SR:6 * SR])
    assert [c.text for c in res.texts["P"]] == ["words"] and res.texts["P"][0].start_ms == base


def test_missing_member_is_reported_not_raised():
    x = bursts(10, seed=1)
    res = rc.clean_round({"a": [(10_000, pcm(x))], "ghost": [], "empty": [(9, b"")]}, 0, 10_000, lambda w: "hi")
    assert res.missing_member_ids == ["empty", "ghost"]
    assert list(res.texts) == ["a"]


def test_single_member_is_not_masked_and_fully_muted_chunks_skipped():
    x = np.zeros(130 * SR, np.float32)
    x[:30 * SR] = 500          # chunk 0 audible, chunk 1 (60-120 s) all zero, chunk 2 (120-130) zero
    calls = []
    res = rc.clean_round({"solo": [(130_000, pcm(x))]}, 0, 130_000, lambda w: calls.append(decode(w)) or "t")
    assert len(calls) == 1 and np.all(calls[0][:30 * SR] == 500)   # untouched, no mask
    assert [(c.start_ms, c.end_ms) for c in res.texts["solo"]] == [(0, 60_000)]


def test_window_cut_uses_server_clock():
    x = np.full(10 * SR, 700.0, np.float32)
    calls = []
    rc.clean_round({"m": [(110_000, pcm(x))]}, 105_000, 115_000, lambda w: calls.append(decode(w)) or "t")
    got = calls[0]
    assert len(got) == 10 * SR and np.all(got[:5 * SR] == 700) and not np.any(got[5 * SR:])


# --- memory bound ------------------------------------------------------------

def test_a_chunk_timestamped_a_year_away_is_clipped_not_allocated():
    year = 365 * 24 * 3600 * 1000
    x = np.full(10 * SR, 700.0, np.float32)
    runs = [(110_000, pcm(x)), (110_000 + year, pcm(x))]
    t = rc.place_on_timeline(runs, 100_000, 120_000)
    assert t.start_ms == 100_000 and len(t.samples) == 10 * SR
    res = rc.clean_round({"m": runs}, 100_000, 120_000, lambda w: "t")
    assert list(res.texts) == ["m"]


def test_member_with_nothing_inside_the_window_is_missing():
    year = 365 * 24 * 3600 * 1000
    x = np.full(10 * SR, 700.0, np.float32)
    res = rc.clean_round({"in": [(110_000, pcm(x))], "far": [(110_000 + year, pcm(x))]}, 100_000, 120_000,
                         lambda w: "t")
    assert res.missing_member_ids == ["far"] and list(res.texts) == ["in"]


def test_hard_span_limit():
    with pytest.raises(ValueError):
        rc.clean_round({"m": [(10_000, pcm(np.ones(SR, np.float32)))]}, 0, (rc.MAX_WINDOW_S + 1) * 1000, lambda w: "t")
    x = np.ones(SR, np.float32)
    with pytest.raises(ValueError):
        rc.place_on_timeline([(1_000, pcm(x)), (1_000 + (rc.MAX_WINDOW_S + 100) * 1000, pcm(x))])


# --- suppression visibility ---------------------------------------------------

def test_masked_audible_seconds_and_dominant_member():
    rng = np.random.default_rng(3)
    loud = rng.normal(0, 8000, 10 * SR).astype(np.float32)
    mid = loud * 0.1     # about -32 dBFS: audible but loses every second
    quiet = loud * 0.0001  # below -50 dBFS: not audible
    st, dom = rc.suppression_stats({"a": loud, "b": mid, "c": quiet})
    assert st == {"a": 0, "b": 10, "c": 0}
    assert dom == "a"
    _, dom2 = rc.suppression_stats({"a": loud, "b": mid})   # needs 3+ members
    assert dom2 is None


def test_no_dominant_when_turns_are_shared():
    rng = np.random.default_rng(4)
    a = np.zeros(10 * SR, np.float32); b = a.copy(); c = a.copy()
    for k, arr in enumerate([a, b, c]):
        for s in range(k, 9, 3):
            arr[s * SR:(s + 1) * SR] = rng.normal(0, 8000, SR)
    st, dom = rc.suppression_stats({"a": a, "b": b, "c": c})
    assert dom is None and st == {"a": 0, "b": 0, "c": 0}


def test_clean_round_reports_stats_and_rule_unchanged():
    rng = np.random.default_rng(6)
    loud = rng.normal(0, 8000, 10 * SR).astype(np.float32)
    res = rc.clean_round({"a": [(10_000, pcm(loud))], "b": [(10_000, pcm(loud * 0.1))]}, 0, 10_000, lambda w: "t")
    assert res.masked_audible_seconds["b"] == 10 and res.dominant_member_id is None


def test_post_ids_limit_who_is_transcribed_but_every_mic_still_competes():
    import numpy as _np
    rng = _np.random.default_rng(3)
    loud = _np.round(rng.normal(0, 6000, SR * 10)).astype("<i2").tobytes()
    quiet = _np.round(rng.normal(0, 600, SR * 10)).astype("<i2").tobytes()
    end = 10_000
    calls = []
    res = rc.clean_round({"a": [(end, loud)], "b": [(end, quiet)]}, 0, end,
                         lambda wav: calls.append(len(wav)) or "words", post_ids={"b"})
    assert list(res.texts) == ["b"] and res.texts["b"] == []     # b hears a: its masked track is silent, no call made
    assert calls == []
