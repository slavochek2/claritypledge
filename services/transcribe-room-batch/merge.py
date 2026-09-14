"""
P1307 Decision 5: build ONE room timeline from every member's whole-recording transcript.

Rules, each from the spec:
  - The device is the speaker. A member's text is attributed to that member; nothing here
    re-attributes speech (no diarization, no voice profiles).
  - Cross-member duplicate speech is KEPT and LABELLED, never deleted. Phones on a table each
    hear everyone (P1236: 7.1 dB median separation), so N members' passes can transcribe one
    sentence N times. There is no trustworthy signal for which device's copy is "the real one",
    and deleting the wrong copy is an invisible, unrecoverable error — the same bias the live
    de-duplicator already holds ("a surviving duplicate is visible and harmless").
  - Deterministic: the same inputs always produce the same timeline and the same labels, so a
    re-run for one member cannot reshuffle everyone else.

Timing is approximate by construction: Gemini returns one text per ≤5-minute segment with no
word timestamps, so sentences inside a segment are spread across it in proportion to their
length. That orders a conversation between members; it does not align individual words.
"""

from __future__ import annotations

import re
from typing import TypedDict

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+")
_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


class Entry(TypedDict, total=False):
    member_id: str
    start_ms: int
    end_ms: int
    text: str
    also_heard_by: list[str]


class Note(TypedDict):
    segment_index: int
    duplicate_of_index: int
    member_id: str
    also_heard_by: str


def sentences_with_times(member_id: str, text: str, start_ms: int, duration_ms: int) -> list[Entry]:
    """Split one segment's text into sentence entries spread proportionally over the segment."""
    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
    if not sentences:
        return []
    total_chars = sum(len(s) for s in sentences)
    entries: list[Entry] = []
    cursor = 0
    for sentence in sentences:
        share = duration_ms * len(sentence) // total_chars if total_chars else 0
        entries.append({
            "member_id": member_id,
            "start_ms": start_ms + cursor,
            "end_ms": start_ms + cursor + share,
            "text": sentence,
        })
        cursor += share
    return entries


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text)}


def similarity(a: str, b: str) -> float:
    """Jaccard similarity of word sets. Very short sentences must match exactly — "yes." twice
    in fifteen seconds is two people agreeing far more often than one person overheard."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    if min(len(ta), len(tb)) < 3:
        return 1.0 if ta == tb else 0.0
    return len(ta & tb) / len(ta | tb)


def _sort_key(entry: Entry) -> tuple[int, str, str]:
    return (entry["start_ms"], entry["member_id"], entry["text"])


def merge_entries(entries: list[Entry], window_ms: int, min_similarity: float) -> tuple[list[Entry], list[Note]]:
    """Order all members' entries on one timeline and label cross-member near-duplicates.

    For each entry, every EARLIER entry from a DIFFERENT member within window_ms and at or above
    min_similarity makes the later entry "also heard by" that member. The earlier copy is left
    unlabelled, the later copy carries the label, and both stay in the transcript.
    """
    ordered: list[Entry] = []
    for entry in sorted(entries, key=_sort_key):
        clean: Entry = {k: entry[k] for k in ("member_id", "start_ms", "end_ms", "text")}  # type: ignore[misc]
        ordered.append(clean)

    notes: list[Note] = []
    for j, later in enumerate(ordered):
        heard_by: list[str] = []
        for i in range(j - 1, -1, -1):
            earlier = ordered[i]
            if later["start_ms"] - earlier["start_ms"] > window_ms:
                break
            if earlier["member_id"] == later["member_id"] or earlier["member_id"] in heard_by:
                continue
            if similarity(earlier["text"], later["text"]) >= min_similarity:
                heard_by.append(earlier["member_id"])
                notes.append({
                    "segment_index": j,
                    "duplicate_of_index": i,
                    "member_id": later["member_id"],
                    "also_heard_by": earlier["member_id"],
                })
        if heard_by:
            later["also_heard_by"] = sorted(heard_by)
    return ordered, notes


def remerge_member(
    existing_segments: list[Entry],
    member_id: str,
    member_entries: list[Entry],
    window_ms: int,
    min_similarity: float,
) -> tuple[list[Entry], list[Note]]:
    """Replace one member's contribution in an existing room timeline and re-label everything.

    Idempotent for a re-run: the member's previous entries are dropped first, and labels are
    always recomputed from scratch rather than accumulated.
    """
    others = [s for s in existing_segments if s.get("member_id") != member_id]
    return merge_entries(others + member_entries, window_ms, min_similarity)
