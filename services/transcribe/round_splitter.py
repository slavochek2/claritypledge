"""
Splits full-session segments into per-round segments using events.json timestamps.

Reads live_round_started and live_round_ended events, maps each segment
to its round by start_ms. Returns dict of { round_index: [segments] }.
"""

import logging
from typing import Optional

from merger import MergedSegment

logger = logging.getLogger(__name__)


def split_by_rounds(
    segments: list[MergedSegment],
    events: Optional[dict],
) -> dict[int, list[MergedSegment]]:
    """
    Split segments into per-round groups using event timestamps.

    Args:
        segments: Merged transcript segments with speaker attribution.
        events: Parsed events.json containing live_round_started/ended events.

    Returns:
        Dict mapping round_index (0-based) to list of segments in that round.
        Segments outside any round are assigned to round_index = -1.
    """
    rounds = _extract_rounds(events)

    if not rounds:
        logger.info("No round boundaries found — all segments in round 0")
        return {0: segments}

    result: dict[int, list[MergedSegment]] = {}

    for seg in segments:
        round_idx = _find_round(seg.start_ms, rounds)
        result.setdefault(round_idx, []).append(seg)

    for idx, segs in sorted(result.items()):
        logger.info("Round %d: %d segments", idx, len(segs))

    return result


def assign_round_indices(
    segments: list[MergedSegment],
    events: Optional[dict],
) -> list[dict]:
    """
    Assign round_index to each segment and return as dicts ready for JSONB storage.

    Returns list of segment dicts with round_index field added.
    """
    rounds = _extract_rounds(events)

    result = []
    for seg in segments:
        round_idx = _find_round(seg.start_ms, rounds) if rounds else 0
        result.append({
            "speaker_id": seg.speaker_id,
            "text": seg.text,
            "start_ms": seg.start_ms,
            "end_ms": seg.end_ms,
            "round_index": round_idx,
        })

    return result


def _extract_rounds(events: Optional[dict]) -> list[dict]:
    """
    Extract round boundaries from events.json.

    Returns list of { index, start_ms, end_ms } sorted by start_ms.
    Round events use timestamps relative to sessionStartedAt (already in ms).
    """
    if not events:
        return []

    event_list = events.get("events", [])
    round_starts: dict[int, int] = {}
    round_ends: dict[int, int] = {}

    for event in event_list:
        event_type = event.get("type", "")
        timestamp = event.get("timestamp", 0)
        props = event.get("properties", {})

        if event_type == "live_round_started":
            round_idx = props.get("round_index", props.get("roundIndex", 0))
            round_starts[round_idx] = timestamp

        elif event_type == "live_round_ended":
            round_idx = props.get("round_index", props.get("roundIndex", 0))
            round_ends[round_idx] = timestamp

    # Build rounds list
    rounds = []
    for idx in sorted(set(round_starts.keys()) | set(round_ends.keys())):
        start = round_starts.get(idx, 0)
        end = round_ends.get(idx, float("inf"))
        rounds.append({
            "index": idx,
            "start_ms": start,
            "end_ms": end,
        })

    rounds.sort(key=lambda r: r["start_ms"])
    logger.info("Extracted %d rounds from events", len(rounds))
    return rounds


def _find_round(timestamp_ms: int, rounds: list[dict]) -> int:
    """
    Find which round a timestamp belongs to.

    Returns round index, or -1 if outside all rounds.
    """
    for r in rounds:
        if r["start_ms"] <= timestamp_ms <= r["end_ms"]:
            return r["index"]

    # If between rounds, assign to the nearest round
    if rounds:
        # Check if before first round
        if timestamp_ms < rounds[0]["start_ms"]:
            return -1

        # Check if after last round
        if timestamp_ms > rounds[-1]["end_ms"]:
            return -1

        # Between rounds — assign to the round that just ended
        for i, r in enumerate(rounds[:-1]):
            next_r = rounds[i + 1]
            if r["end_ms"] < timestamp_ms < next_r["start_ms"]:
                return r["index"]

    return -1
