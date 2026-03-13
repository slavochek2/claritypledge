"""
Unit tests for overlap-based alignment (merger.py).

Tests edge cases: speaker change mid-word, silence gaps, 3+ speakers,
no diarization, no transcript segments.
"""

import sys
import os

# Add parent directory to path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from merger import merge_segments, MergedSegment, _compute_overlap
from transcriber import Segment
from diarizer import DiarSegment


class TestComputeOverlap:
    def test_full_overlap(self):
        assert _compute_overlap(100, 200, 100, 200) == 100

    def test_partial_overlap(self):
        assert _compute_overlap(100, 200, 150, 250) == 50

    def test_no_overlap(self):
        assert _compute_overlap(100, 200, 300, 400) == 0

    def test_contained(self):
        assert _compute_overlap(100, 400, 200, 300) == 100

    def test_zero_duration(self):
        assert _compute_overlap(100, 100, 100, 100) == 0


class TestMergeSegments:
    def test_empty_transcript(self):
        result = merge_segments([], [DiarSegment("SPEAKER_00", 0, 1000)])
        assert result == []

    def test_empty_diarization(self):
        """No diarization → all assigned to SPEAKER_00."""
        segments = [Segment("Hello", 0, 1000)]
        result = merge_segments(segments, [])
        assert len(result) == 1
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[0].text == "Hello"

    def test_single_speaker(self):
        segments = [
            Segment("Hello there", 0, 2000),
            Segment("How are you", 2000, 4000),
        ]
        diar = [DiarSegment("SPEAKER_00", 0, 5000)]
        result = merge_segments(segments, diar)
        # Should consolidate into one segment (same speaker)
        assert len(result) == 1
        assert result[0].speaker_id == "SPEAKER_00"
        assert "Hello there" in result[0].text
        assert "How are you" in result[0].text

    def test_two_speakers_alternating(self):
        segments = [
            Segment("Hello", 0, 2000),
            Segment("Hi back", 3000, 5000),
            Segment("Great to meet you", 6000, 8000),
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 2500),
            DiarSegment("SPEAKER_01", 2500, 5500),
            DiarSegment("SPEAKER_00", 5500, 9000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 3
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"
        assert result[2].speaker_id == "SPEAKER_00"

    def test_three_speakers(self):
        segments = [
            Segment("First speaker", 0, 2000),
            Segment("Second speaker", 3000, 5000),
            Segment("Third speaker", 6000, 8000),
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 2500),
            DiarSegment("SPEAKER_01", 2500, 5500),
            DiarSegment("SPEAKER_02", 5500, 9000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 3
        speakers = [s.speaker_id for s in result]
        assert "SPEAKER_00" in speakers
        assert "SPEAKER_01" in speakers
        assert "SPEAKER_02" in speakers

    def test_consolidation_same_speaker(self):
        """Consecutive same-speaker segments should merge."""
        segments = [
            Segment("Part one", 0, 1000),
            Segment("Part two", 1000, 2000),
            Segment("Part three", 2000, 3000),
        ]
        diar = [DiarSegment("SPEAKER_00", 0, 3000)]
        result = merge_segments(segments, diar)
        assert len(result) == 1
        assert "Part one" in result[0].text
        assert "Part two" in result[0].text
        assert "Part three" in result[0].text
        assert result[0].start_ms == 0
        assert result[0].end_ms == 3000

    def test_silence_gap(self):
        """Segments with silence gap should still be attributed correctly."""
        segments = [
            Segment("Before gap", 0, 1000),
            Segment("After gap", 5000, 6000),
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 2000),
            DiarSegment("SPEAKER_01", 4000, 7000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 2
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"

    def test_speaker_change_mid_segment(self):
        """
        When diarization says speaker changes mid-way through a transcript segment,
        the segment is assigned to the speaker with the most overlap.
        """
        # Transcript segment spans 0-4000ms
        segments = [Segment("A long sentence spanning both speakers", 0, 4000)]
        # Speaker 0: 0-1000ms (1000ms overlap), Speaker 1: 1000-4000ms (3000ms overlap)
        diar = [
            DiarSegment("SPEAKER_00", 0, 1000),
            DiarSegment("SPEAKER_01", 1000, 5000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 1
        # SPEAKER_01 has more overlap (3000ms vs 1000ms)
        assert result[0].speaker_id == "SPEAKER_01"
