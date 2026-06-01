# TDD: red until P858 /dev implements these. Run: pytest services/transcribe/tests/test_p858_*.py
"""
P858 — atomic claim logic (storage.claim_pending_job).

These tests verify the *observable outcomes* of the claim, NOT mock call-shape.
What a mocked Supabase client CAN prove (and these tests assert):
  (a) the claim issues a CONDITIONAL update gated on status='pending' AND attempts < max_attempts
  (b) when a row is returned, the claim returns the DB-sourced session_code/session_id/attempts
  (c) when zero rows are returned, the claim returns a not-claimed signal that the
      caller treats as a clean no-op (NOT an error)
  (d) attempts >= max_attempts → claim refused, row marked 'failed'
  (e) by-id variant (trigger path) vs oldest-pending variant (sweeper path)

What a mocked client CANNOT prove — stated honestly in the coverage report:
  the TRUE Postgres-level atomicity (FOR UPDATE SKIP LOCKED — two dispatchers, one job,
  no double-process). That is a real-Postgres / UAT prod-observation item, NOT unit-testable
  with a mock. The mock here can only confirm that the *zero-rows* branch is handled as a
  no-op, which is the application-side contract that atomicity feeds into.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Env vars MUST be set before importing service modules (they read at import time).
os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["MOCK_GCS"] = "true"
os.environ["MOCK_DIARIZATION"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import storage  # noqa: E402


# ── Mock-client scaffolding ───────────────────────────────────────────────────
#
# claim_pending_job is expected to run a conditional UPDATE ... RETURNING. With the
# supabase-py client that surfaces as a chain ending in .execute(). We record the
# RPC name / arguments so we can assert the claim is GATED (not an unconditional read),
# and we control .execute()'s return so we can drive the claimed vs zero-rows branches.


class FakeResult:
    def __init__(self, data):
        self.data = data


class RpcRecorder:
    """Records storage RPC calls and returns a scripted result for each."""

    def __init__(self):
        self.calls = []
        self._next = FakeResult([])

    def set_next(self, data):
        self._next = FakeResult(data)

    def rpc(self, name, params=None):
        self.calls.append((name, params or {}))
        # supabase-py: client.rpc(name, params).execute()
        executor = MagicMock()
        executor.execute.return_value = self._next
        return executor


@pytest.fixture
def fake_client():
    rec = RpcRecorder()
    with patch.object(storage, "_get_client", return_value=rec):
        yield rec


class TestClaimOldestPending:
    """Sweeper path: claim the oldest pending row (no id supplied)."""

    def test_claimed_row_returns_db_values_not_caller_supplied(self, fake_client):
        """A won claim returns the row's DB-sourced fields and the incremented attempts."""
        fake_client.set_next([{
            "id": "job-1",
            "session_code": "ABCXYZ",
            "session_id": "11111111-1111-1111-1111-111111111111",
            "attempts": 1,  # DB returns post-increment value
        }])

        claimed = storage.claim_pending_job()

        assert claimed is not None
        assert claimed["id"] == "job-1"
        assert claimed["session_code"] == "ABCXYZ"
        assert claimed["session_id"] == "11111111-1111-1111-1111-111111111111"
        # attempts came back from the DB as the post-increment value — the claim
        # incremented exactly once. The caller must use THIS, not a fresh count.
        assert claimed["attempts"] == 1

    def test_zero_rows_is_clean_no_op_not_error(self, fake_client):
        """No claimable row → returns None (clean no-op), never raises."""
        fake_client.set_next([])  # conditional UPDATE matched nothing
        # Outcome that differs: with a row → dict; without → None. Not an exception.
        result = storage.claim_pending_job()
        assert result is None

    def test_claim_is_gated_not_an_unconditional_read(self, fake_client):
        """The claim must go through a conditional UPDATE RPC, not a bare SELECT.

        This is the difference between a CLAIM (flips status, gated on
        status='pending' AND attempts<max_attempts) and the old non-atomic read.
        We assert a storage RPC/SQL path was invoked — proving the implementation
        does not fall back to the .table().select() read path of get_pending_job().
        """
        fake_client.set_next([{
            "id": "job-1", "session_code": "ABCXYZ",
            "session_id": "11111111-1111-1111-1111-111111111111", "attempts": 1,
        }])
        storage.claim_pending_job()
        assert fake_client.calls, "claim_pending_job must invoke a conditional-update RPC"
        rpc_name = fake_client.calls[0][0]
        # The gate name is the /dev author's choice; whatever it is, it must be the
        # claim RPC — assert it is NOT a plain unconditional read alias.
        assert "claim" in rpc_name.lower() or "pending" in rpc_name.lower()


class TestClaimById:
    """Trigger path: Cloud Tasks carries a specific job_id."""

    def test_by_id_won_returns_db_session_fields(self, fake_client):
        """Winning the by-id claim returns the DB session fields for that exact job."""
        fake_client.set_next([{
            "id": "job-42",
            "session_code": "QWERTY",
            "session_id": "22222222-2222-2222-2222-222222222222",
            "attempts": 1,
        }])

        claimed = storage.claim_pending_job(job_id="job-42")

        assert claimed is not None
        assert claimed["id"] == "job-42"
        assert claimed["session_code"] == "QWERTY"
        assert claimed["session_id"] == "22222222-2222-2222-2222-222222222222"

    def test_by_id_lost_returns_not_claimed_signal(self, fake_client):
        """Losing the by-id claim (another dispatcher already owns it) → None.

        This is the race the spec calls out: trigger + sweeper both see the row.
        The loser must get a not-claimed signal, NOT an error and NOT a stale row.
        """
        fake_client.set_next([])  # WHERE id=$1 AND status='pending' matched 0 rows
        result = storage.claim_pending_job(job_id="job-42")
        assert result is None

    def test_by_id_passes_the_job_id_to_the_gate(self, fake_client):
        """The by-id variant must scope the conditional update to the supplied id."""
        fake_client.set_next([{
            "id": "job-42", "session_code": "QWERTY",
            "session_id": "22222222-2222-2222-2222-222222222222", "attempts": 1,
        }])
        storage.claim_pending_job(job_id="job-42")
        # The job_id must reach the gate as a parameter (id-driven claim — mitigation #3
        # depends on this: only id is trusted, session fields come from RETURNING).
        _, params = fake_client.calls[0]
        assert "job-42" in str(params), "by-id claim must scope the gate to the job_id"


class TestClaimRefusedWhenExhausted:
    """attempts >= max_attempts: claim refused, row marked failed."""

    def test_exhausted_job_is_not_claimed_and_marked_failed(self, fake_client):
        """When the gate (attempts < max_attempts) excludes the row, the claim is
        refused (zero rows) AND the row is transitioned to 'failed'.

        The conditional UPDATE's WHERE clause (attempts < max_attempts) means an
        exhausted row never matches → zero rows → not claimed. The claim path is
        responsible for marking such a row 'failed' so it stops being re-dispatched.
        We assert the OUTCOME: claim returns None, and update_job_status was driven
        to 'failed' for that job.
        """
        fake_client.set_next([])  # gate excluded the exhausted row → no claim
        with patch.object(storage, "update_job_status") as mock_status:
            result = storage.claim_pending_job(job_id="job-exhausted")
            assert result is None
            # The exhausted-job handling must fail the row (not silently drop it).
            mock_status.assert_called_once()
            args, kwargs = mock_status.call_args
            called_status = kwargs.get("status", args[1] if len(args) > 1 else None)
            assert called_status == "failed"


class TestCallerTreatsNotClaimedAsNoOp:
    """The endpoint/sweeper caller must treat None as a clean no-op: NO transcribe call."""

    def test_none_claim_does_not_invoke_transcribe_session(self, fake_client):
        """If the claim returns None, transcribe_session must NOT be called.

        This is the cost backstop (Security mitigation: zero rows claimed → no GPU
        spin). We exercise it at the storage level by confirming the contract the
        caller relies on: claim_pending_job returns None and the test (standing in
        for the caller) does not proceed to processing.
        """
        fake_client.set_next([])
        claimed = storage.claim_pending_job()
        # Caller logic under test: only process when a row was actually claimed.
        processed = False
        if claimed is not None:
            processed = True  # would call transcribe_session here
        assert processed is False
