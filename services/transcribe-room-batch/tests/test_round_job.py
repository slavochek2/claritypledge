"""P1596: process_round_job. Storage, audio and Gemini are stubs; nothing leaves the process."""

import sys
import types

import numpy as np

sys.modules.setdefault("storage", types.ModuleType("storage"))
gem = types.ModuleType("gemini_client")


class TranscriptionError(Exception):
    def __init__(self, status=0, retryable=False):
        self.status, self.retryable = status, retryable


gem.TranscriptionError = TranscriptionError
gem.transcribe_segment = lambda wav: ""
gem.transcribe_verbatim_argon = lambda wav: ""
sys.modules.setdefault("gemini_client", gem)

import pipeline  # noqa: E402

A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ROOM = "11111111-1111-4111-8111-111111111111"
SR = 16000


def pcm(seconds, amp):
    rng = np.random.default_rng(1)
    return np.round(rng.normal(0, amp, SR * seconds)).astype("<i2").tobytes()


END = int(np.datetime64("2026-11-01T10:00:20").astype("datetime64[ms]").astype(int))
NOW = END + 60_000
CODE = "ABC234"


def job(**kw):
    base = {
        "id": "job-1", "kind": "round", "attempts": 1, "seated_count": 2,
        "seats": [{"member_id": A, "room_id": ROOM}, {"member_id": B, "room_id": ROOM}],
        "window_start": "2026-11-01T10:00:00+00:00", "window_end": "2026-11-01T10:00:20+00:00",
    }
    base.update(kw)
    return base


def objs(created_by_member):
    """GCS listing: one chunk_000 per created time given."""
    out = []
    for mid, times in created_by_member.items():
        for n, t in enumerate(times):
            out.append((f"rooms/{CODE}/name-{mid}/chunk_{n:03d}.webm", t))
    return out


def wire(monkeypatch, pieces=None, created=None, ended=None, enabled=True, codes=None):
    log = {"finished": [], "posted": [], "deferred": [], "loaded": [], "partial": 0}
    st = pipeline.storage
    monkeypatch.setattr(st, "load_room_codes", lambda ids: codes if codes is not None else {ROOM: CODE}, raising=False)
    monkeypatch.setattr(st, "clean_enabled", lambda: enabled, raising=False)
    monkeypatch.setattr(st, "load_capture_ended", lambda ids: ended or {}, raising=False)
    monkeypatch.setattr(st, "finish_round_job", lambda jid, **kw: log["finished"].append(kw), raising=False)
    monkeypatch.setattr(st, "defer_round_job", lambda jid, att, nb: log["deferred"].append((att, nb)), raising=False)

    def _post(jid, attempt, items, partial=False):
        log["posted"].append((attempt, items))
        log["partial"] += 1 if partial else 0
        return len(items)

    monkeypatch.setattr(st, "post_clean_round", _post, raising=False)
    created = created if created is not None else {A: [END + 5000], B: [END + 5000]}   # last chunk is past window end
    monkeypatch.setattr(pipeline.audio, "list_room_objects", lambda b, c: objs(created))
    default = {A: [(END, pcm(20, 6000))], B: [(END, pcm(20, 600))]}

    def load(code, mid, refs, lo, hi, heads):
        log["loaded"].append((mid, lo, hi))
        return (pieces or default).get(mid, [])

    monkeypatch.setattr(pipeline, "load_member_runs", load)
    return log


def run(j, **kw):
    kw.setdefault("now_ms", NOW)
    kw.setdefault("transcribe", lambda wav: "hello")
    pipeline.process_round_job(j, **kw)


def test_success_posts_one_atomic_call_and_completes_fenced(monkeypatch):
    log = wire(monkeypatch)
    run(job(attempts=2))
    assert log["finished"] == [{"attempts": 2}]
    assert len(log["posted"]) == 1                      # ONE call for the whole job
    attempt, items = log["posted"][0]
    assert attempt == 2
    assert [i["member_id"] for i in items] == [A]       # the loud mic owns every second; B's masked track is silent
    assert items[0]["text"] == "hello"


def test_a_transcription_failure_posts_nothing_and_retries(monkeypatch):
    log = wire(monkeypatch)

    def boom(wav):
        raise pipeline.gemini_client.TranscriptionError(503, True)

    run(job(), transcribe=boom)
    assert log["posted"] == []
    assert log["finished"][0]["error"] == "gemini_503" and log["finished"][0]["retryable"] is True


def test_the_last_attempt_is_not_retried_and_never_raises(monkeypatch):
    log = wire(monkeypatch)
    monkeypatch.setattr(pipeline.audio, "list_room_objects", lambda b, c: (_ for _ in ()).throw(RuntimeError("x")))
    run(job(attempts=pipeline.MAX_ATTEMPTS))
    assert log["posted"] == []
    f = log["finished"][0]
    assert f["error"] == "RuntimeError" and f["attempts"] == pipeline.MAX_ATTEMPTS


def test_a_failing_status_write_does_not_raise(monkeypatch):
    wire(monkeypatch)
    monkeypatch.setattr(pipeline.storage, "finish_round_job", lambda *a, **k: (_ for _ in ()).throw(OSError()), raising=False)
    run(job())


def test_invalid_member_id_fails_without_audio(monkeypatch):
    log = wire(monkeypatch)
    run(job(seats=[{"member_id": "../x", "room_id": ROOM}]))
    assert log["finished"][0]["error"] == "invalid_identifiers" and log["posted"] == [] and log["loaded"] == []


def test_one_missing_room_code_makes_that_member_missing_not_a_failure(monkeypatch):
    log = wire(monkeypatch, codes={ROOM: CODE})
    other = "22222222-2222-4222-8222-222222222222"
    j = job(seats=[{"member_id": A, "room_id": ROOM}, {"member_id": B, "room_id": other}], seated_count=1)
    run(j)
    assert log["finished"] == [{"attempts": 1}]                 # completed, not invalid_identifiers
    assert [m for m, _, _ in log["loaded"]] == [A]


def test_room_job_cleans_only_the_listed_members_per_segment(monkeypatch):
    log = wire(monkeypatch)
    j = job(kind="room", segments=[{"start": "2026-11-01T10:00:00+00:00", "end": "2026-11-01T10:00:10+00:00", "member_ids": [B]}])
    run(j)
    assert [i["member_id"] for i in log["posted"][0][1]] == [B]


def test_room_job_compares_every_recording_mic_but_posts_only_the_unseated_one(monkeypatch):
    # B is the unseated person in this stretch, A (loud) is seated at a table and has her own job. B's quiet
    # mic hears A: with A in the comparison B's masked track is silent, so B gets nothing; without it B would
    # have been given A's words.
    log = wire(monkeypatch)
    j = job(kind="room", segments=[{"start": "2026-11-01T10:00:00+00:00", "end": "2026-11-01T10:00:10+00:00",
                                    "member_ids": [B], "compare_ids": [A, B]}])
    run(j)
    assert log["posted"] == []
    assert {m for m, _, _ in log["loaded"]} == {A, B}


def test_not_everyone_has_uploaded_their_last_chunk_the_job_waits_without_using_an_attempt(monkeypatch):
    log = wire(monkeypatch, created={A: [END + 5000], B: [END - 20_000]})   # B's last chunk is before the window end
    run(job(attempts=2), now_ms=END + 40_000)
    assert log["posted"] == [] and log["finished"] == [] and log["loaded"] == []
    (att, nb), = log["deferred"]
    assert att == 2 and nb == pipeline._iso(END + 40_000 + pipeline.RECHECK_S * 1000)


def test_the_wait_ends_at_window_end_plus_3_minutes(monkeypatch):
    log = wire(monkeypatch, created={A: [END + 5000], B: [END - 20_000]})
    run(job(), now_ms=END + 170_000)
    assert log["deferred"][0][1] == pipeline._iso(END + 180_000)      # pushed no further than the deadline
    log2 = wire(monkeypatch, created={A: [END + 5000], B: [END - 20_000]})
    run(job(), now_ms=END + 181_000)
    assert log2["deferred"] == [] and log2["finished"]                 # decided with what exists


def test_a_member_whose_capture_ended_is_ready(monkeypatch):
    log = wire(monkeypatch, created={A: [END + 5000], B: [END - 20_000]}, ended={B: "2026-11-01T10:00:15+00:00"})
    run(job(), now_ms=END + 40_000)
    assert log["deferred"] == [] and log["posted"]


def test_a_seated_person_with_no_recording_posts_what_exists_and_marks_the_thread(monkeypatch):
    log = wire(monkeypatch)
    run(job(seated_count=3))             # a third person sat there without a recording
    assert log["posted"]
    assert log["partial"] == 1
    assert log["finished"] == [{"attempts": 1, "error": "partial_table", "completed": True}]


def test_a_single_mic_table_posts_what_exists(monkeypatch):
    log = wire(monkeypatch, pieces={A: [(END, pcm(20, 6000))]})
    run(job(seats=[{"member_id": A, "room_id": ROOM}], seated_count=2))
    assert log["posted"] and log["finished"][0]["error"] == "partial_table"


def test_a_paused_mic_below_80_percent_posts_what_exists(monkeypatch):
    log = wire(monkeypatch, pieces={A: [(END, pcm(20, 6000))], B: [(END, pcm(10, 600))]})   # B covers 50%
    run(job())
    assert log["posted"] and log["finished"][0]["error"] == "partial_table"


def test_zero_recordings_post_nothing(monkeypatch):
    log = wire(monkeypatch, pieces={A: [], B: []})
    run(job())
    assert log["posted"] == [] and log["finished"][0]["error"] == "incomplete_table"


def test_coverage_counts_the_union_of_pieces_in_the_window():
    one = (END, pcm(10, 100))
    two = (END - 5000, pcm(10, 100))            # overlaps the first by 5 s
    a, b = END - 20_000, END
    assert abs(pipeline.coverage([one, two], a, b) - 15 / 20) < 1e-6
    assert pipeline.coverage([], a, b) == 0.0


def test_switched_off_sends_no_audio_and_burns_no_attempt(monkeypatch):
    log = wire(monkeypatch, enabled=False)
    sent = []
    run(job(attempts=1), transcribe=lambda w: sent.append(1) or "x")
    assert sent == [] and log["loaded"] == [] and log["posted"] == []
    assert log["deferred"] and log["deferred"][0][0] == 1 and log["finished"] == []


def test_a_stale_worker_is_refused_and_does_nothing(monkeypatch):
    log = wire(monkeypatch)

    def refuse(jid, attempt, items):
        raise RuntimeError("stale attempt")           # the RPC raises for a claim that is no longer current

    monkeypatch.setattr(pipeline.storage, "post_clean_round", refuse, raising=False)
    run(job(attempts=1))
    # its status writes carry the same attempt, which the database fences out; it never reports success
    assert all(f["attempts"] == 1 for f in log["finished"])
    assert all("error" in f for f in log["finished"])


def test_sweep_does_not_stall_on_one_retrying_job(monkeypatch):
    st = pipeline.storage
    queue = ["j1", "j2", "j3"]
    state = {"back": set()}
    monkeypatch.setattr(st, "clean_enabled", lambda: True, raising=False)
    monkeypatch.setattr(st, "reset_stale_round_jobs", lambda: 0, raising=False)

    def oldest(exclude=None):
        return next((j for j in queue if j not in (exclude or [])), None)

    claimed = []

    def claim(jid):
        claimed.append(jid)
        return {"id": jid}

    monkeypatch.setattr(st, "oldest_due_round_job_id", oldest, raising=False)
    monkeypatch.setattr(st, "claim_round_job", claim, raising=False)
    done = pipeline.drain_round_jobs(lambda j: None)     # every job "returns to pending": still in the queue
    assert done == ["j1", "j2", "j3"] and claimed == ["j1", "j2", "j3"]


def test_sweep_skips_everything_when_the_switch_is_off(monkeypatch):
    st = pipeline.storage
    monkeypatch.setattr(st, "clean_enabled", lambda: False, raising=False)
    monkeypatch.setattr(st, "claim_round_job", lambda j: (_ for _ in ()).throw(AssertionError("claimed")), raising=False)
    assert pipeline.drain_round_jobs(lambda j: None) == []


def test_room_job_reads_and_waits_for_every_compared_mic_not_only_the_seats(monkeypatch):
    log = wire(monkeypatch, created={A: [END - 20_000], B: [END + 5000]})   # A (compared, not in seats) not uploaded yet
    j = job(kind="room", room_id=ROOM, seats=[{"member_id": B, "room_id": ROOM}],
            segments=[{"start": "2026-11-01T10:00:00+00:00", "end": "2026-11-01T10:00:10+00:00",
                       "member_ids": [B], "compare_ids": [A, B]}])
    run(j, now_ms=END + 40_000)
    assert log["deferred"] and log["posted"] == []        # waits for A
    log2 = wire(monkeypatch)
    run(j)
    assert {m for m, _, _ in log2["loaded"]} == {A, B}
    assert log2["posted"] == []                            # B hears A and is masked: only seats' text is posted


def test_a_duplicate_mic_of_one_person_cannot_mask_a_zero_coverage_tablemate(monkeypatch):
    A2 = "00000000-0000-4000-8000-0000000000a2"
    log = wire(monkeypatch, created={A: [END + 5000], A2: [END + 5000], B: [END + 5000]},
               pieces={A: [(END, pcm(20, 6000))], A2: [(END, pcm(20, 6000))], B: []})
    j = job(seated_count=2, seats=[{"member_id": A, "room_id": ROOM, "person": "pa"},
                                   {"member_id": A2, "room_id": ROOM, "person": "pa"},
                                   {"member_id": B, "room_id": ROOM, "person": "pb"}])
    run(j)
    assert log["finished"][0]["error"] == "partial_table" and log["partial"] == 1


def _two_devices(monkeypatch, a_pieces, a2_pieces):
    A2 = "00000000-0000-4000-8000-0000000000a2"
    log = wire(monkeypatch, created={A: [END + 5000], A2: [END + 5000]}, pieces={A: a_pieces, A2: a2_pieces})
    run(job(seated_count=1, seats=[{"member_id": A, "room_id": ROOM, "person": "pa"},
                                   {"member_id": A2, "room_id": ROOM, "person": "pa"}]))
    return log


def test_two_devices_with_the_same_45_percent_are_45_percent_not_90(monkeypatch):
    same = [(END, pcm(9, 6000))]
    log = _two_devices(monkeypatch, same, list(same))
    assert log["finished"][0]["error"] == "partial_table" and log["partial"] == 1


def test_complementary_devices_40_plus_45_percent_pass(monkeypatch):
    log = _two_devices(monkeypatch, [(END, pcm(8, 6000))], [(END - 10_000, pcm(9, 6000))])
    assert not log["finished"][0].get("error") or log["finished"][0]["error"] != "incomplete_table"


def test_retry_backoff_has_jitter(monkeypatch):
    vals = {__import__('config').retry_delay_s() for _ in range(20)}
    assert len(vals) > 1 and all(60 <= v <= 90 for v in vals)


# Founder, solo test 2026-11-02: a "before" room job is created when round 1 starts, while the room is still
# recording. It is an ordinary room job (kind "room", place "before"): the database picks the thread by the job's place.
def test_before_round_one_job_cleans_the_stretch_up_to_round_one_and_posts_only_the_listed_members(monkeypatch):
    log = wire(monkeypatch)
    j = job(kind="room", place="before", room_id=ROOM, seats=[{"member_id": B, "room_id": ROOM}],
            window_end="2026-11-01T10:00:10+00:00",
            segments=[{"start": "2026-11-01T10:00:00+00:00", "end": "2026-11-01T10:00:10+00:00",
                       "member_ids": [B], "compare_ids": [B]}])
    run(j, now_ms=END + 60_000)
    assert [i["member_id"] for i in log["posted"][0][1]] == [B]
    assert log["finished"] == [{"attempts": 1}]
    assert all(hi - lo == 10_000 for _, lo, hi in log["loaded"])


def test_before_round_one_job_waits_for_the_still_recording_mic_to_upload_past_round_one(monkeypatch):
    # The room is still open when round 1 starts: the mic's last chunk is not past the window end yet.
    start = END - 10_000          # round 1 started 10 s before END
    log = wire(monkeypatch, created={B: [start - 20_000]})
    j = job(kind="room", place="before", room_id=ROOM, seats=[{"member_id": B, "room_id": ROOM}],
            window_end=pipeline._iso(start),
            segments=[{"start": pipeline._iso(start - 30_000), "end": pipeline._iso(start),
                       "member_ids": [B], "compare_ids": [B]}])
    run(j, now_ms=start + 40_000)
    assert log["posted"] == [] and log["finished"] == []
    (att, nb), = log["deferred"]
    assert nb == pipeline._iso(start + 40_000 + pipeline.RECHECK_S * 1000)


def test_posted_chunk_times_are_server_clock_milliseconds_never_run_relative(monkeypatch):
    # The posting RPC places a room-job item by comparing chunk_ms with the first round's start (a timestamp): the
    # value must be absolute epoch milliseconds inside the job window, for a room job as for a round job.
    log = wire(monkeypatch)
    start = END - 20_000
    run(job(kind="room", place="end", seats=[{"member_id": A, "room_id": ROOM}], seated_count=1,
            segments=[{"start": "2026-11-01T10:00:00+00:00", "end": "2026-11-01T10:00:20+00:00",
                       "member_ids": [A], "compare_ids": [A]}]))
    items = log["posted"][0][1]
    assert items and all(start <= i["chunk_ms"] <= END for i in items)


def test_a_round_closed_hours_after_its_room_ended_posts_the_words_unmarked(monkeypatch):
    # the host closed the round 4 h later; only the first 20 s have audio. Beyond the 3 h window limit, must not fail.
    log = wire(monkeypatch, ended={A: True, B: True})
    far = "2026-11-01T14:00:20+00:00"
    run(job(window_end=far), now_ms=END + 5 * 3600 * 1000)
    assert log["posted"] and log["posted"][0][1][0]["text"] == "hello"
    assert log["partial"] == 0                # both mics cover all the audio the table has
    assert log["finished"] == [{"attempts": 1}]
