"""P1592 swap wiring: off by default, one RPC call, edited/deleted dropped, failures swallowed."""

import sys
import types

sys.modules.setdefault("storage", types.ModuleType("storage"))

import swap  # noqa: E402

M = "member-1"
SEGS = [{"member_id": M, "start_ms": 0, "end_ms": 1, "text": "Hello there, how are you?"},
        {"member_id": "other", "start_ms": 5, "end_ms": 6, "text": "Not mine at all."},
        {"member_id": M, "start_ms": 10, "end_ms": 11, "text": "I am fine, thanks."}]
ROWS = [{"id": "t1", "text": "hello there", "chat_message_id": "c1"},
        {"id": "t2", "text": "how are you", "chat_message_id": "c1"},
        {"id": "t3", "text": "i am fine thanks", "chat_message_id": "c2"}]


def chat(**over):
    base = {"id": "c1", "body": "hello there how are you", "edited_at": None, "deleted_at": None, "thread_root_id": "r", "conversation_id": "k"}
    return {"c1": base, "c2": {**base, "id": "c2", "body": "i am fine thanks", **over}}


def test_build_updates_groups_rows_per_message_and_uses_only_this_members_segments():
    ups = swap.build_swap_updates(ROWS, chat(), SEGS, M)
    assert ups == [{"chat_message_id": "c1", "body": "Hello there, how are you?", "expected_body": "hello there how are you"},
                   {"chat_message_id": "c2", "body": "I am fine, thanks.", "expected_body": "i am fine thanks"}]


def test_edited_and_deleted_messages_are_not_updated_but_keep_their_position():
    ups = swap.build_swap_updates(ROWS, chat(edited_at="2026-01-01"), SEGS, M)
    assert [u["chat_message_id"] for u in ups] == ["c1"]
    assert ups[0]["body"] == "Hello there, how are you?"  # c2's words did not move into c1
    ups = swap.build_swap_updates(ROWS, chat(deleted_at="2026-01-01"), SEGS, M)
    assert [u["chat_message_id"] for u in ups] == ["c1"]


def test_unchanged_body_is_not_sent():
    c = chat()
    c["c1"]["body"] = "Hello there, how are you?"
    assert [u["chat_message_id"] for u in swap.build_swap_updates(ROWS, c, SEGS, M)] == ["c2"]


def _wire(monkeypatch, enabled=True, transcript="ok"):
    calls = []
    monkeypatch.setattr(swap.config, "ROOM_SWAP_ENABLED", enabled)
    t = {"segments": SEGS, "incomplete_member_ids": []} if transcript == "ok" else (None if transcript == "none" else {"segments": SEGS, "incomplete_member_ids": [M]})
    monkeypatch.setattr(swap.storage, "read_transcript", lambda r: t, raising=False)
    monkeypatch.setattr(swap.storage, "read_member_live_rows", lambda r, m: ROWS, raising=False)
    monkeypatch.setattr(swap.storage, "read_chat_messages", lambda ids: list(chat().values()), raising=False)
    monkeypatch.setattr(swap.storage, "apply_transcription_swap", lambda r, m, u: calls.append(u) or len(u), raising=False)
    return calls


def test_disabled_by_default_does_nothing(monkeypatch):
    calls = _wire(monkeypatch, enabled=False)
    swap.run_swap_for_member("room", M)
    assert calls == []


def test_enabled_sends_one_rpc_call(monkeypatch):
    calls = _wire(monkeypatch)
    swap.run_swap_for_member("room", M)
    assert len(calls) == 1 and len(calls[0]) == 2


def test_missing_transcript_or_incomplete_member_is_skipped(monkeypatch):
    for kind in ("none", "incomplete"):
        calls = _wire(monkeypatch, transcript=kind)
        swap.run_swap_for_member("room", M)
        assert calls == []


def test_any_exception_is_swallowed(monkeypatch):
    _wire(monkeypatch)
    def boom(*a):
        raise RuntimeError("db down")
    monkeypatch.setattr(swap.storage, "apply_transcription_swap", boom, raising=False)
    swap.run_swap_for_member("room", M)  # must not raise


def test_every_update_carries_the_body_that_was_read_as_expected_body(monkeypatch):
    calls = _wire(monkeypatch)
    swap.run_swap_for_member("room", M)
    assert [(u["chat_message_id"], u["expected_body"]) for u in calls[0]] == [
        ("c1", "hello there how are you"), ("c2", "i am fine thanks")]
