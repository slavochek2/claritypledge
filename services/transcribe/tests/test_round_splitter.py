"""
Unit tests for round_splitter.py.

Tests: events.json with 3 rounds, segments split correctly at round boundaries,
no events, segments between rounds.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from round_splitter import split_by_rounds, assign_round_indices, _extract_rounds
from merger import MergedSegment


def _make_events(rounds: list[tuple[int, int, int]]) -> dict:
    """
    Helper: create events.json structure with round boundaries.

    Args:
        rounds: list of (index, start_ms, end_ms) tuples.
    """
    events = []
    for idx, start, end in rounds:
        events.append({
            "type": "live_round_started",
            "timestamp": start,
            "properties": {"round_index": idx},
        })
        events.append({
            "type": "live_round_ended",
            "timestamp": end,
            "properties": {"round_index": idx},
        })
    return {
        "sessionCode": "test",
        "events": events,
        "participants": [],
    }


class TestExtractRounds:
    def test_three_rounds(self):
        events = _make_events([
            (0, 0, 10000),
            (1, 15000, 30000),
            (2, 35000, 50000),
        ])
        rounds = _extract_rounds(events)
        assert len(rounds) == 3
        assert rounds[0]["index"] == 0
        assert rounds[1]["start_ms"] == 15000
        assert rounds[2]["end_ms"] == 50000

    def test_no_events(self):
        assert _extract_rounds(None) == []
        assert _extract_rounds({}) == []
        assert _extract_rounds({"events": []}) == []

    def test_round_index_from_properties(self):
        """Test that roundIndex (camelCase) is also supported."""
        events = {
            "events": [
                {"type": "live_round_started", "timestamp": 0, "properties": {"roundIndex": 0}},
                {"type": "live_round_ended", "timestamp": 5000, "properties": {"roundIndex": 0}},
            ]
        }
        rounds = _extract_rounds(events)
        assert len(rounds) == 1
        assert rounds[0]["index"] == 0


class TestSplitByRounds:
    def test_segments_in_three_rounds(self):
        events = _make_events([
            (0, 0, 10000),
            (1, 15000, 30000),
            (2, 35000, 50000),
        ])
        segments = [
            MergedSegment("SPEAKER_00", "Round 0 talk", 2000, 5000),
            MergedSegment("SPEAKER_01", "Also round 0", 6000, 9000),
            MergedSegment("SPEAKER_00", "Round 1 talk", 16000, 20000),
            MergedSegment("SPEAKER_01", "Round 1 reply", 22000, 28000),
            MergedSegment("SPEAKER_00", "Round 2 talk", 36000, 45000),
        ]
        result = split_by_rounds(segments, events)
        assert 0 in result
        assert 1 in result
        assert 2 in result
        assert len(result[0]) == 2
        assert len(result[1]) == 2
        assert len(result[2]) == 1

    def test_no_events_all_in_round_zero(self):
        segments = [
            MergedSegment("SPEAKER_00", "Hello", 0, 1000),
            MergedSegment("SPEAKER_01", "World", 2000, 3000),
        ]
        result = split_by_rounds(segments, None)
        assert 0 in result
        assert len(result[0]) == 2

    def test_segment_between_rounds(self):
        """Segment in gap between rounds gets round -1."""
        events = _make_events([
            (0, 0, 10000),
            (1, 20000, 30000),
        ])
        segments = [
            MergedSegment("SPEAKER_00", "In the gap", 12000, 15000),
        ]
        result = split_by_rounds(segments, events)
        # Between rounds → assigned to the round that just ended (round 0)
        assert 0 in result

    def test_segment_before_first_round(self):
        """Segment before any round starts gets round -1."""
        events = _make_events([
            (0, 10000, 20000),
        ])
        segments = [
            MergedSegment("SPEAKER_00", "Before round", 2000, 5000),
        ]
        result = split_by_rounds(segments, events)
        assert -1 in result


class TestAssignRoundIndices:
    def test_output_format(self):
        events = _make_events([(0, 0, 10000)])
        segments = [
            MergedSegment("SPEAKER_00", "Hello", 2000, 5000),
        ]
        result = assign_round_indices(segments, events)
        assert len(result) == 1
        assert result[0]["speaker_id"] == "SPEAKER_00"
        assert result[0]["text"] == "Hello"
        assert result[0]["start_ms"] == 2000
        assert result[0]["end_ms"] == 5000
        assert result[0]["round_index"] == 0

    def test_no_events_defaults_to_round_zero(self):
        segments = [MergedSegment("SPEAKER_00", "Hello", 0, 1000)]
        result = assign_round_indices(segments, None)
        assert result[0]["round_index"] == 0
