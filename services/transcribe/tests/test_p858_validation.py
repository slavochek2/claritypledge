# TDD: red until P858 /dev implements these. Run: pytest services/transcribe/tests/test_p858_*.py
"""
P858 — session_code validation (Security mitigation #4, GCS path-traversal defense).

This is the STRONGEST Tier-A test: validate_session_code is a pure function, so no mock
is needed and the assertions are exact. The session charset in production is
ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I/O/0/1); the spec pins the boundary check to
^[A-Z0-9]{6}$. We test BOTH: every valid code passes, and every malformed/traversal
input is rejected BEFORE any GCS prefix (f"sessions/{session_code}/") is built.

The contract: validate_session_code(code) -> bool  (True = safe to use).
A rejected code must NOT reach download_session_audio / _download_gcs.
"""

import os
import sys

import pytest

os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["MOCK_GCS"] = "true"
os.environ["MOCK_DIARIZATION"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# validate_session_code is expected to live where the boundary is enforced.
# /dev will place it in audio.py (next to download_session_audio) or a small validators
# module; the import below targets audio.py per the spec's "before any GCS prefix".
from audio import validate_session_code  # noqa: E402


VALID_CODES = [
    "ABCXYZ",   # all letters
    "234567",   # all digits (prod charset digits)
    "A2B3C4",   # mixed
    "QWERTY",   # arbitrary valid 6-char A-Z
    "ZZZZZZ",
    "999999",
]

INVALID_CODES = [
    "",                       # empty
    "ABCDE",                  # too short (5)
    "ABCDEFG",                # too long (7)
    "abcxyz",                 # lowercase
    "AbCxYz",                 # mixed case
    "ABC XY",                 # space
    "../etc",                 # path traversal
    "../../",                 # path traversal
    "sessions/../secret",     # traversal embedded
    "ABC/YZ",                 # slash (would alter the GCS prefix)
    "AB.CYZ",                 # dot
    "AB-CYZ",                 # hyphen
    "AB_CYZ",                 # underscore
    "ABC%2F",                 # url-encoded slash
    "ABC\nYZ",                # newline injection
    "  ABC  ",                # surrounding whitespace
    "ＡＢＣＸＹＺ",              # full-width unicode look-alikes
]


class TestSessionCodeValidation:

    @pytest.mark.parametrize("code", VALID_CODES)
    def test_valid_codes_pass(self, code):
        assert validate_session_code(code) is True, f"{code!r} should be accepted"

    @pytest.mark.parametrize("code", INVALID_CODES)
    def test_invalid_codes_rejected(self, code):
        assert validate_session_code(code) is False, f"{code!r} must be rejected"

    def test_path_traversal_cannot_reach_gcs_prefix(self):
        """A traversal code must be rejected so f'sessions/{code}/' is never built.

        We assert the OUTCOME: the boundary refuses the input. (download_session_audio
        is expected to call validate_session_code first and raise/abort on a False
        return — covered at the endpoint level in test_p858_async_endpoint.py.)
        """
        assert validate_session_code("../../claritypledge-secrets") is False

    def test_none_is_rejected_not_crashed(self):
        """Defensive: a None/non-str must be rejected, not raise (boundary hardening)."""
        # validate_session_code must coerce-or-reject, never throw on bad type.
        assert validate_session_code(None) is False
