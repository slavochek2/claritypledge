"""
P1592 D9: the quiet swap's I/O wiring. Thin on purpose — the decisions live in align.py.

Runs after a member's job is marked completed, only when ROOM_SWAP_ENABLED is on. Idempotent:
every run recomputes from the live rows and the latest cleaned text. Any failure is logged and
swallowed: a swap problem must never change the job outcome. Logs ids and counts only, never text.
"""

from __future__ import annotations

import logging

import config
import storage
from align import align_messages

logger = logging.getLogger(__name__)


def build_swap_updates(rows: list[dict], chat: dict[str, dict], segments: list[dict], member_id: str) -> list[dict]:
    """Pure part of the swap. rows = this member's live rows (spoken order); chat = id -> chat
    message row. Returns [{"chat_message_id", "body", "expected_body"}] (expected_body = the body read now; the RPC updates only if it still equals it) for messages whose text should change.

    Every live row stays a position in the alignment, including rows never posted (no
    chat_message_id) and messages the user edited or deleted: their words are real speech, so
    leaving them out would push their cleaned words into a neighbour (another message's words).
    Their results are simply never sent."""
    groups: list[dict] = []  # one per chat message (or per unposted row), in first-spoken order
    by_chat: dict[str, dict] = {}
    for row in rows:
        cid = row.get("chat_message_id")
        if cid and cid in chat:
            g = by_chat.get(cid)
            if g is None:
                msg = chat[cid]
                g = {"id": cid, "place": msg.get("thread_root_id") or msg.get("conversation_id") or "", "live": [], "msg": msg}
                by_chat[cid] = g
                groups.append(g)
            g["live"].append(row["text"])
        else:
            groups.append({"id": None, "place": "", "live": [row["text"]], "msg": None})

    mine = sorted((s for s in segments if s.get("member_id") == member_id), key=lambda s: s.get("start_ms", 0))
    cleaned = " ".join((s.get("text") or "").strip() for s in mine).strip()
    aligned = align_messages(
        [{"id": g["id"] or "", "place": g["place"], "live_text": " ".join(g["live"])} for g in groups],
        cleaned, min_ratio=config.SWAP_MIN_RATIO,
    )
    updates = []
    for g, new_body in zip(groups, aligned):
        msg = g["msg"]
        if new_body is None or msg is None or msg.get("edited_at") or msg.get("deleted_at"):
            continue
        if new_body != msg.get("body"):
            updates.append({"chat_message_id": g["id"], "body": new_body, "expected_body": msg.get("body")})
    return updates


def run_swap_for_member(room_id: str, member_id: str) -> None:
    if not config.ROOM_SWAP_ENABLED:
        return
    try:
        transcript = storage.read_transcript(room_id)
        if not transcript or member_id in (transcript.get("incomplete_member_ids") or []):
            logger.info("swap: room %s member %s skipped (no transcript or incomplete)", room_id, member_id)
            return
        rows = storage.read_member_live_rows(room_id, member_id)
        ids = sorted({r["chat_message_id"] for r in rows if r.get("chat_message_id")})
        chat = {m["id"]: m for m in storage.read_chat_messages(ids)}
        updates = build_swap_updates(rows, chat, transcript.get("segments") or [], member_id)
        if not updates:
            logger.info("swap: room %s member %s nothing to change", room_id, member_id)
            return
        count = storage.apply_transcription_swap(room_id, member_id, updates)
        logger.info("swap: room %s member %s sent=%d updated=%s", room_id, member_id, len(updates), count)
    except Exception:  # noqa: BLE001 — a swap failure never changes the job outcome
        logger.error("swap: room %s member %s failed", room_id, member_id, exc_info=True)
