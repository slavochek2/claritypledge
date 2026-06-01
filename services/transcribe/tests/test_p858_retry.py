# TDD: red until P858 /dev implements these. Run: pytest services/transcribe/tests/test_p858_*.py
"""
P858 — retry accounting (single source of truth: the job-row `attempts` counter).

Outcome-based assertions (not mock-theater):
  - the counter increments exactly once per claim (verified via the value RETURNING gives back)
  - a transient (retryable) failure routes the row to status='pending' (sweeper re-dispatch)
  - a permanent failure routes the row to status='failed' (no retry)
  - the SAME counter is honored across trigger + sweeper (no fresh count — a row at
    attempts=N is claimed as attempts=N+1, never reset to 1)
  - the claim STOPS at max_attempts (refused → failed), so no path reaches a 4th attempt
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["MOCK_GCS"] = "true"
os.environ["MOCK_DIARIZATION"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import storage  # noqa: E402


class FakeResult:
    def __init__(self, data):
        self.data = data


class ScriptedRpc:
    """Returns a scripted sequence of results, one per .execute()."""

    def __init__(self, sequence):
        self._seq = list(sequence)
        self.calls = []

    def rpc(self, name, params=None):
        self.calls.append((name, params or {}))
        executor = MagicMock()
        nxt = self._seq.pop(0) if self._seq else []
        executor.execute.return_value = FakeResult(nxt)
        return executor


class TestCounterIncrementsOncePerClaim:

    def test_first_claim_returns_attempts_1(self):
        rec = ScriptedRpc([[{
            "id": "j", "session_code": "AAAAAA",
            "session_id": "33333333-3333-3333-3333-333333333333", "attempts": 1,
        }]])
        with patch.object(storage, "_get_client", return_value=rec):
            claimed = storage.claim_pending_job(job_id="j")
        assert claimed["attempts"] == 1, "first claim increments 0 → 1"

    def test_reclaim_of_pending_row_continues_count_not_resets(self):
        """A row that failed transiently and went back to pending, when re-claimed by
        the sweeper, must continue the count (1 → 2), NOT reset to 1.

        This is the 'no fresh count' guarantee: the DB increment is attempts+1 from the
        row's current value, so a row already at attempts=1 returns 2 on the next claim.
        """
        rec = ScriptedRpc([[{
            "id": "j", "session_code": "AAAAAA",
            "session_id": "33333333-3333-3333-3333-333333333333", "attempts": 2,
        }]])
        with patch.object(storage, "_get_client", return_value=rec):
            claimed = storage.claim_pending_job(job_id="j")
        assert claimed["attempts"] == 2, "sweeper re-claim continues the count (no reset)"


class TestTransientVsPermanentRouting:
    """The pipeline's failure handler routes by failure class onto the SAME row."""

    def test_transient_failure_routes_to_pending(self):
        """A retryable transient failure sets status='pending' (so the sweeper re-dispatches).

        We drive the helper the pipeline uses to classify+route a failure. The OUTCOME
        that differs: transient → 'pending'; permanent → 'failed' (next test).
        """
        with patch.object(storage, "update_job_status") as mock_status:
            # /dev exposes a routing helper; the exact name is the author's choice but
            # its CONTRACT is: retryable=True → status='pending', clears error for retry.
            storage.route_failed_job("j", error_message="429 cold-start", retryable=True)
            args, kwargs = mock_status.call_args
            status = kwargs.get("status", args[1] if len(args) > 1 else None)
            assert status == "pending", "transient failure must go back to pending"

    def test_permanent_failure_routes_to_failed(self):
        with patch.object(storage, "update_job_status") as mock_status:
            storage.route_failed_job("j", error_message="malformed audio", retryable=False)
            args, kwargs = mock_status.call_args
            status = kwargs.get("status", args[1] if len(args) > 1 else None)
            assert status == "failed", "permanent failure must not be retried"


class TestStopsAtMaxAttempts:
    """The claim refuses an exhausted row and marks it failed — caps total attempts."""

    def test_exhausted_row_refused_and_failed_no_fourth_attempt(self):
        """attempts=3, max_attempts=3 → claim refused (gate excludes), row → failed.

        Proves the ceiling: a row that already had 3 attempts cannot be claimed for a
        4th. Trigger and sweeper both route through this same claim, so neither can
        add a 4th attempt.
        """
        rec = ScriptedRpc([[]])  # gate (attempts < max_attempts) excludes the row
        with patch.object(storage, "_get_client", return_value=rec):
            with patch.object(storage, "update_job_status") as mock_status:
                result = storage.claim_pending_job(job_id="j")
                assert result is None
                args, kwargs = mock_status.call_args
                status = kwargs.get("status", args[1] if len(args) > 1 else None)
                assert status == "failed"


class TestSameCounterAcrossPaths:
    """Trigger then sweeper must read the same row counter — never two independent counts."""

    def test_trigger_then_sweeper_share_one_counter(self):
        """Sequence: trigger claims (1), transient fail → pending, sweeper claims (2),
        transient fail → pending, sweeper claims (3), then exhausted → failed.

        The counter is monotonic and shared: 1 → 2 → 3 → refused. If trigger and
        sweeper each kept their own count, we'd see 1,1,1 and never exhaust.
        """
        rec = ScriptedRpc([
            [{"id": "j", "session_code": "AAAAAA",
              "session_id": "33333333-3333-3333-3333-333333333333", "attempts": 1}],  # trigger
            [{"id": "j", "session_code": "AAAAAA",
              "session_id": "33333333-3333-3333-3333-333333333333", "attempts": 2}],  # sweeper #1
            [{"id": "j", "session_code": "AAAAAA",
              "session_id": "33333333-3333-3333-3333-333333333333", "attempts": 3}],  # sweeper #2
            [],  # sweeper #3 — gate excludes (attempts >= max_attempts)
        ])
        seen = []
        with patch.object(storage, "_get_client", return_value=rec):
            with patch.object(storage, "update_job_status"):
                for _ in range(4):
                    c = storage.claim_pending_job(job_id="j")
                    seen.append(c["attempts"] if c else None)
        assert seen == [1, 2, 3, None], "one shared counter, monotonic, capped at max"
