import json

import gemini_client as g


class Resp:
    def __init__(self, payload): self.payload = payload
    def read(self): return json.dumps(self.payload).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_request_shape_and_thought_parts_skipped(monkeypatch):
    sent = {}

    def fake_open(req, timeout):
        sent["url"], sent["body"] = req.full_url, json.loads(req.data)
        return Resp({"candidates": [{"content": {"parts": [
            {"text": "internal", "thought": True}, {"text": "hello "}, {"text": "world"}]}}]})

    monkeypatch.setattr(g, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(g.urllib.request, "urlopen", fake_open)
    assert g.transcribe_verbatim_argon(b"RIFFwav") == "hello world"
    assert "gemini-4-argon:generateContent" in sent["url"] and "key=" not in sent["url"]
    parts = sent["body"]["contents"][0]["parts"]
    assert parts[0] == {"text": g.VERBATIM_INSTRUCTION} and "inlineData" in parts[1]


def test_no_key_raises_non_retryable(monkeypatch):
    monkeypatch.setattr(g, "GEMINI_API_KEY", "")
    try:
        g.transcribe_verbatim_argon(b"x")
    except g.TranscriptionError as e:
        assert e.retryable is False
    else:
        raise AssertionError


def _run(monkeypatch, payload):
    monkeypatch.setattr(g, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(g.urllib.request, "urlopen", lambda req, timeout: Resp(payload))
    return g.transcribe_verbatim_argon(b"RIFFwav")


def test_silence_with_stop_is_an_empty_string(monkeypatch):
    assert _run(monkeypatch, {"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]}) == ""


def test_missing_candidates_is_a_retryable_error_not_silence(monkeypatch):
    for payload in ({}, {"candidates": []}, {"promptFeedback": {"blockReason": "OTHER"}}):
        try:
            _run(monkeypatch, payload)
        except g.TranscriptionError as e:
            assert e.retryable is True
        else:
            raise AssertionError(payload)


def test_a_non_stop_finish_reason_is_a_retryable_error(monkeypatch):
    for reason in ("MAX_TOKENS", "SAFETY", "RECITATION", "OTHER"):
        try:
            _run(monkeypatch, {"candidates": [{"finishReason": reason, "content": {"parts": [{"text": "half"}]}}]})
        except g.TranscriptionError as e:
            assert e.retryable is True and e.status is None
        else:
            raise AssertionError(reason)
