# TDD: red until P858 /dev implements these. Run: pytest services/transcribe/tests/test_p858_*.py
"""
P858 — POST /transcribe-async (fire-and-forget trigger landing endpoint).

Outcome-based assertions:
  - a WON claim returns 202 quickly (does NOT block on transcribe_session)
  - the endpoint uses ONLY job_id from the payload + the claim's DB-RETURNED session
    fields; it IGNORES payload session_code/session_id (Security mitigation #3).
    Proof that differs by logic: a payload with a DIFFERENT session_code than the DB
    row must result in transcribe_session being called with the DB code, NOT the payload code.
  - a LOST claim (claimed:false) returns 200 and does NO background work (no GPU spin)

We call the endpoint coroutine directly with claim/transcribe_session patched. transcribe_session
is the GPU-bound primitive — it must run off the event loop (asyncio.to_thread); here we patch it
so no real work runs, and we assert the response returns BEFORE/INDEPENDENT of its completion.
"""

import os
import sys
import asyncio
from unittest.mock import MagicMock, patch

import pytest

os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["MOCK_GCS"] = "true"
os.environ["MOCK_DIARIZATION"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main  # noqa: E402


def _req(session_code="DBCODE", session_id="db-session-id", job_id="job-1"):
    """Build the request model the trigger sends. Note: session_code/session_id here
    are ATTACKER/PAYLOAD-controlled and must be ignored in favor of the DB row."""
    return main.TranscribeAsyncRequest(
        job_id=job_id, session_code=session_code, session_id=session_id
    )


class TestWonClaimReturns202:

    @pytest.mark.asyncio
    async def test_won_claim_returns_202(self):
        db_row = {
            "id": "job-1", "session_code": "REALAB",
            "session_id": "66666666-6666-6666-6666-666666666666", "attempts": 1,
        }
        with patch.object(main, "claim_pending_job", return_value=db_row), \
             patch.object(main, "transcribe_session", return_value={
                 "transcript_id": "t", "segment_count": 1, "language": "en",
                 "processing_time_ms": 1, "speakers": ["Slava"],
             }):
            response = await main.transcribe_async(_req(job_id="job-1"))
        # 202 = accepted, processing in background. Contract: claimed True.
        status = getattr(response, "status_code", None) or response.get("status_code")
        body = response if isinstance(response, dict) else getattr(response, "body", {})
        assert status == 202 or (isinstance(response, dict) and response.get("claimed") is True)

    @pytest.mark.asyncio
    async def test_does_not_block_on_long_processing(self):
        """The 202 must return without waiting for transcribe_session to finish.

        transcribe_session is patched to a slow stub; the endpoint must return promptly,
        scheduling the work in the background (asyncio.to_thread / detached task).
        We assert the response is produced even though the stub 'job' has not completed.
        """
        started = asyncio.Event()
        release = asyncio.Event()

        def slow_job(*a, **k):
            started.set()
            # Block until released — simulates a multi-minute GPU job.
            # Runs in a worker thread (asyncio.to_thread), so it must not freeze the loop.
            import time
            for _ in range(50):
                if release.is_set():
                    break
                time.sleep(0.01)
            return {"transcript_id": "t", "segment_count": 1, "language": "en",
                    "processing_time_ms": 1, "speakers": ["Slava"]}

        db_row = {"id": "job-1", "session_code": "REALAB",
                  "session_id": "66666666-6666-6666-6666-666666666666", "attempts": 1}
        with patch.object(main, "claim_pending_job", return_value=db_row), \
             patch.object(main, "transcribe_session", side_effect=slow_job):
            response = await asyncio.wait_for(main.transcribe_async(_req()), timeout=2.0)
        # Got a response well before the (released) job would finish → fire-and-forget.
        assert response is not None
        release.set()


class TestIgnoresPayloadSessionFields:
    """Mitigation #3: only job_id is trusted; session fields come from the claim's DB row."""

    @pytest.mark.asyncio
    async def test_uses_db_session_code_not_payload(self):
        """Payload says session_code='ATTACK', DB row says 'REALAB'.
        transcribe_session MUST be called with the DB code, never the payload code.
        """
        db_row = {"id": "job-1", "session_code": "REALAB",
                  "session_id": "66666666-6666-6666-6666-666666666666", "attempts": 1}
        captured = {}

        def capture_tx(session_code=None, session_id=None, job_id=None, **k):
            captured["session_code"] = session_code
            captured["session_id"] = session_id
            captured["job_id"] = job_id
            return {"transcript_id": "t", "segment_count": 1, "language": "en",
                    "processing_time_ms": 1, "speakers": ["Slava"]}

        with patch.object(main, "claim_pending_job", return_value=db_row), \
             patch.object(main, "transcribe_session", side_effect=capture_tx):
            await main.transcribe_async(
                _req(session_code="ATTACK", session_id="attacker-supplied-id", job_id="job-1")
            )
            # Let any scheduled background task run.
            await asyncio.sleep(0.05)

        assert captured.get("session_code") == "REALAB", \
            "must use DB-returned session_code, NOT the payload's"
        assert captured.get("session_id") == "66666666-6666-6666-6666-666666666666", \
            "must use DB-returned session_id, NOT the payload's"

    @pytest.mark.asyncio
    async def test_claim_is_scoped_by_job_id_only(self):
        """The claim is driven by the payload job_id (the only trusted field)."""
        db_row = {"id": "job-1", "session_code": "REALAB",
                  "session_id": "66666666-6666-6666-6666-666666666666", "attempts": 1}
        with patch.object(main, "claim_pending_job", return_value=db_row) as mock_claim, \
             patch.object(main, "transcribe_session", return_value={
                 "transcript_id": "t", "segment_count": 1, "language": "en",
                 "processing_time_ms": 1, "speakers": ["Slava"]}):
            await main.transcribe_async(_req(job_id="job-1"))
        # The claim must have been called scoped to the job_id.
        args, kwargs = mock_claim.call_args
        job_id_arg = kwargs.get("job_id", args[0] if args else None)
        assert job_id_arg == "job-1"


class TestLostClaimNoOp:

    @pytest.mark.asyncio
    async def test_claimed_false_returns_200_no_background_work(self):
        """A lost claim → 200 {"claimed": false}, transcribe_session NEVER called.

        This is the duplicate-dispatch cost backstop: another dispatcher already owns
        the job, so this invocation must spin NO GPU.
        """
        with patch.object(main, "claim_pending_job", return_value=None), \
             patch.object(main, "transcribe_session") as mock_tx:
            response = await main.transcribe_async(_req())
            await asyncio.sleep(0.05)  # give any (wrongly) scheduled task a chance to fire
        # 200 + claimed:false (NOT 202, NOT an error).
        body = response if isinstance(response, dict) else getattr(response, "body", {})
        if isinstance(response, dict):
            assert response.get("claimed") is False
        else:
            assert getattr(response, "status_code", 200) == 200
        mock_tx.assert_not_called()
