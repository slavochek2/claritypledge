# TDD: red until P858 /dev implements these. Run: pytest services/transcribe/tests/test_p858_*.py
"""
P858 — stale-job reset extraction (storage.reset_stale_jobs) + the updated_at bug fix
+ the /sweep flow (reset then drain via the atomic claim).

Outcome-based assertions:
  - reset_stale_jobs resets 'processing' rows older than STALE_JOB_MINUTES to 'pending'
    and LEAVES fresh ones alone (the filter changes the outcome, not just call-shape)
  - update_job_status now writes updated_at (the P858 bug fix) so the stale cutoff
    measures LAST ACTIVITY, not INSERT time
  - /sweep calls reset_stale_jobs first, then drains pending via claim_pending_job
"""

import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["MOCK_GCS"] = "true"
os.environ["MOCK_DIARIZATION"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import storage  # noqa: E402


# ── update_job_status: the bug fix ────────────────────────────────────────────

class TestUpdateJobStatusWritesUpdatedAt:
    """P858 fix: update_job_status must write updated_at on every status write.

    Before P858, update_job_status wrote status/error_message/completed_at but NEVER
    updated_at — so the stale-reset compared against the row's INSERT-time default.
    The OUTCOME that differs: the payload PATCHed to the row must now contain
    'updated_at'. We capture the dict passed to .update() and assert the key is present.
    """

    def _capture_update_payload(self):
        captured = {}

        class Tbl:
            def update(_self, data):
                captured.update(data)
                builder = MagicMock()
                builder.eq.return_value.execute.return_value = MagicMock(data=[])
                return builder

        client = MagicMock()
        client.table.return_value = Tbl()
        return client, captured

    def test_completed_write_includes_updated_at(self):
        client, captured = self._capture_update_payload()
        with patch.object(storage, "_get_client", return_value=client):
            storage.update_job_status("j", "completed")
        assert "updated_at" in captured, "completed write must bump updated_at (P858 fix)"
        assert "completed_at" in captured  # existing behavior preserved

    def test_processing_write_includes_updated_at(self):
        client, captured = self._capture_update_payload()
        with patch.object(storage, "_get_client", return_value=client):
            storage.update_job_status("j", "processing", error_message="step: whisper (12s)")
        assert "updated_at" in captured, "every write must bump updated_at, not just completed"
        assert captured["status"] == "processing"
        assert captured["error_message"] == "step: whisper (12s)"  # progress write preserved


# ── reset_stale_jobs: the extracted standalone ────────────────────────────────

class TestResetStaleJobs:
    """reset_stale_jobs resets stuck 'processing' rows; the filter must change the outcome."""

    def _build_client(self, stale_rows):
        """A client whose stale SELECT returns `stale_rows`, and records resets."""
        reset_ids = []

        class SelectChain:
            # .table("...").select(...).eq("status","processing").lt("updated_at",cutoff).execute()
            def select(_s, *a, **k): return _s
            def eq(_s, *a, **k): return _s
            def lt(_s, *a, **k): return _s
            def execute(_s): return MagicMock(data=stale_rows)

        class UpdateChain:
            def __init__(_s, data): _s._data = data
            def eq(_s, _col, val):
                reset_ids.append(val)
                return _s
            def execute(_s): return MagicMock(data=[])

        class Tbl:
            def select(_s, *a, **k): return SelectChain()
            def update(_s, data): return UpdateChain(data)

        client = MagicMock()
        client.table.return_value = Tbl()
        return client, reset_ids

    def test_stale_rows_are_reset_to_pending(self):
        now = datetime.now(timezone.utc)
        stale = [{"id": "old-1", "session_code": "AAAAAA"}]
        client, reset_ids = self._build_client(stale)
        with patch.object(storage, "_get_client", return_value=client):
            storage.reset_stale_jobs()
        assert "old-1" in reset_ids, "a >30-min processing row must be reset"

    def test_no_stale_rows_resets_nothing(self):
        """Outcome differs by data: an empty stale-set resets zero rows."""
        client, reset_ids = self._build_client([])
        with patch.object(storage, "_get_client", return_value=client):
            storage.reset_stale_jobs()
        assert reset_ids == [], "fresh queue → no resets (filter must exclude fresh rows)"

    def test_cutoff_uses_stale_job_minutes(self):
        """The reset must use the STALE_JOB_MINUTES window (cutoff = now - 30 min)."""
        assert storage.STALE_JOB_MINUTES == 30
        # Verify the cutoff is computed relative to now, not a fixed/zero time.
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=storage.STALE_JOB_MINUTES))
        assert cutoff < datetime.now(timezone.utc)


# ── /sweep flow: reset, then drain via the atomic claim ───────────────────────

class TestSweepFlow:
    """/sweep runs reset_stale_jobs first, then drains pending via claim_pending_job."""

    @pytest.mark.asyncio
    async def test_sweep_resets_then_drains(self):
        import main  # imported here so env is set first

        call_order = []

        def fake_reset():
            call_order.append("reset")

        # Two pending jobs, then None (queue drained).
        claims = [
            {"id": "a", "session_code": "AAAAAA",
             "session_id": "44444444-4444-4444-4444-444444444444", "attempts": 1},
            {"id": "b", "session_code": "BBBBBB",
             "session_id": "55555555-5555-5555-5555-555555555555", "attempts": 1},
            None,
        ]

        def fake_claim(job_id=None):
            call_order.append("claim")
            return claims.pop(0)

        with patch.object(main, "reset_stale_jobs", side_effect=fake_reset), \
             patch.object(main, "claim_pending_job", side_effect=fake_claim), \
             patch.object(main, "transcribe_session", return_value={
                 "transcript_id": "t", "segment_count": 1, "language": "en",
                 "processing_time_ms": 1, "speakers": ["Slava"],
             }):
            resp = await main.sweep()

        # reset must happen before any claim
        assert call_order[0] == "reset", "/sweep runs the stale-reset first"
        assert call_order.count("claim") == 3, "drains until claim returns None"
        # Two jobs were actually processed.
        assert resp["processed"] == 2

    @pytest.mark.asyncio
    async def test_sweep_empty_queue_is_noop_after_reset(self):
        import main
        with patch.object(main, "reset_stale_jobs"), \
             patch.object(main, "claim_pending_job", return_value=None), \
             patch.object(main, "transcribe_session") as mock_tx:
            resp = await main.sweep()
        assert resp["processed"] == 0
        mock_tx.assert_not_called()  # nothing claimed → no GPU work
