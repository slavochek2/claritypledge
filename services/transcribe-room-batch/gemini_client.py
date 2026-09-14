"""
P1307 Decision 5: one ≤5-minute WAV in, its transcript out.

The request is audio and nothing else — the same shape transcribe-slice sends (no
systemInstruction: gemini-3.5-transcribe rejects it; no text part: nothing a participant said,
and no display name, room code or event title, can enter a prompt, because there is none).

The signature takes exactly one segment. There is deliberately no way to pass a list or a
whole recording: P1237 RQ5 measured a long file being billed in full and silently truncated.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request

from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_SECONDS


class TranscriptionError(Exception):
    """Carries an HTTP status only. Never the response body, which can echo request details."""

    def __init__(self, status: int | None, retryable: bool):
        super().__init__(f"Gemini request failed (status {status})")
        self.status = status
        self.retryable = retryable


def transcribe_segment(wav: bytes) -> str:
    if not GEMINI_API_KEY:
        raise TranscriptionError(None, retryable=False)
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    body = json.dumps({
        "contents": [{"parts": [{"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(wav).decode("ascii")}}]}],
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
    )
    try:
        with urllib.request.urlopen(request, timeout=GEMINI_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as err:
        raise TranscriptionError(err.code, retryable=err.code == 429 or err.code >= 500) from None
    except (urllib.error.URLError, TimeoutError):
        raise TranscriptionError(None, retryable=True) from None

    # The transcript is at parts[0].audioTranscription.text for a transcription model; `.text`
    # is the fallback. Reading the wrong field yields "" — indistinguishable from silence — so
    # both are checked, exactly as transcribe-slice does (measured 2026-09-08).
    part = (((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0]
    text = (part.get("audioTranscription") or {}).get("text", part.get("text"))
    return text.strip() if isinstance(text, str) else ""
