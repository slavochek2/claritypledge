"""P1339: a member with no audio found must never be reported as a clean completion."""

import sys
import types

# pipeline imports gemini_client and storage, which pull in network clients; stub them.
sys.modules.setdefault("storage", types.ModuleType("storage"))
gem = types.ModuleType("gemini_client")


class TranscriptionError(Exception):
    status = 0
    retryable = False


gem.TranscriptionError = TranscriptionError
gem.transcribe_segment = lambda wav: ""
sys.modules.setdefault("gemini_client", gem)

import pipeline  # noqa: E402

MEMBER = "33333333-3333-4333-8333-333333333333"


def _run(monkeypatch, attempts):
    finished, written = [], []
    monkeypatch.setattr(pipeline.storage, "load_context", lambda job: {
        "member": {"id": MEMBER, "display_name": "Alice"}, "room": {"id": "r1", "code": "ABC234"},
    }, raising=False)
    monkeypatch.setattr(pipeline.storage, "finish_job", lambda job_id, **kw: finished.append((job_id, kw)), raising=False)
    monkeypatch.setattr(pipeline.audio, "list_room_objects", lambda bucket, code: [])
    monkeypatch.setattr(pipeline, "write_member_into_room_transcript", lambda *a: written.append(a))
    pipeline.process_job({"id": "job-1", "attempts": attempts})
    return finished, written


def test_no_audio_chunks_is_never_completed_and_is_retried_while_attempts_remain(monkeypatch):
    # An upload can still be in flight when the job first lists the bucket.
    finished, written = _run(monkeypatch, attempts=1)
    assert finished == [("job-1", {"error": "no_audio_chunks", "retryable": True, "attempts": 1})]
    assert written == []


def test_no_audio_chunks_on_the_last_attempt_keeps_the_member_listed_as_incomplete(monkeypatch):
    # A member who only listened must not vanish from speaker_map / incomplete_member_ids.
    finished, written = _run(monkeypatch, attempts=pipeline.MAX_ATTEMPTS)
    assert finished == [("job-1", {"error": "no_audio_chunks", "retryable": True, "attempts": pipeline.MAX_ATTEMPTS})]
    assert written == [("r1", MEMBER, "Alice", [], True)]
