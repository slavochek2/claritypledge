"""
Unit tests for overlap-based alignment (merger.py).

Tests both word-level alignment (P546) and legacy segment-level fallback.
Edge cases: speaker change mid-word, silence gaps, 3+ speakers,
no diarization, no transcript segments, max segment length enforcement.
"""

import sys
import os

# Add parent directory to path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from merger import merge_segments, MergedSegment, _compute_overlap, MAX_SEGMENT_MS
from transcriber import Segment, WordTimestamp
from diarizer import DiarSegment


def _seg(text, start, end, words=None):
    """Helper to create a Segment with optional word timestamps."""
    return Segment(text=text, start_ms=start, end_ms=end, words=words or [])


def _words_from_text(text, start_ms, duration_per_word=200):
    """Helper to generate WordTimestamps from text."""
    words = []
    pos = start_ms
    for w in text.split():
        words.append(WordTimestamp(word=w, start_ms=pos, end_ms=pos + duration_per_word))
        pos += duration_per_word
    return words


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


class TestMergeSegmentsLegacy:
    """Tests using segments WITHOUT word timestamps (legacy fallback)."""

    def test_empty_transcript(self):
        result = merge_segments([], [DiarSegment("SPEAKER_00", 0, 1000)])
        assert result == []

    def test_empty_diarization(self):
        """No diarization → all assigned to SPEAKER_00."""
        segments = [_seg("Hello", 0, 1000)]
        result = merge_segments(segments, [])
        assert len(result) == 1
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[0].text == "Hello"

    def test_single_speaker(self):
        segments = [
            _seg("Hello there", 0, 2000),
            _seg("How are you", 2000, 4000),
        ]
        diar = [DiarSegment("SPEAKER_00", 0, 5000)]
        result = merge_segments(segments, diar)
        assert len(result) == 1
        assert result[0].speaker_id == "SPEAKER_00"
        assert "Hello there" in result[0].text
        assert "How are you" in result[0].text

    def test_two_speakers_alternating(self):
        segments = [
            _seg("Hello", 0, 2000),
            _seg("Hi back", 3000, 5000),
            _seg("Great to meet you", 6000, 8000),
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
            _seg("First speaker", 0, 2000),
            _seg("Second speaker", 3000, 5000),
            _seg("Third speaker", 6000, 8000),
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
            _seg("Part one", 0, 1000),
            _seg("Part two", 1000, 2000),
            _seg("Part three", 2000, 3000),
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
            _seg("Before gap", 0, 1000),
            _seg("After gap", 5000, 6000),
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 2000),
            DiarSegment("SPEAKER_01", 4000, 7000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 2
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"

    def test_speaker_change_mid_segment_legacy(self):
        """
        Without word timestamps, segment-level fallback assigns the entire
        segment to the speaker with the most overlap.
        """
        # 0-3000ms segment: SPEAKER_00 has 1000ms overlap, SPEAKER_01 has 2000ms
        segments = [_seg("A long sentence spanning both speakers", 0, 3000)]
        diar = [
            DiarSegment("SPEAKER_00", 0, 1000),
            DiarSegment("SPEAKER_01", 1000, 4000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 1
        # SPEAKER_01 has more overlap (2000ms vs 1000ms)
        assert result[0].speaker_id == "SPEAKER_01"


class TestMergeSegmentsWordLevel:
    """Tests using segments WITH word timestamps (P546 word-level alignment)."""

    def test_word_level_splits_at_speaker_boundary(self):
        """
        The core P546 fix: a single Whisper segment spanning two speakers
        should be split at the word level, not assigned entirely to one speaker.
        """
        # Simulate: 0-4s segment, Speaker 0 for first 1s, Speaker 1 for rest
        words = [
            WordTimestamp("Hello", 0, 500),
            WordTimestamp("there", 500, 1000),
            WordTimestamp("I", 1000, 1200),
            WordTimestamp("am", 1200, 1500),
            WordTimestamp("the", 1500, 1700),
            WordTimestamp("second", 1700, 2200),
            WordTimestamp("speaker", 2200, 3000),
        ]
        segments = [_seg("Hello there I am the second speaker", 0, 3000, words=words)]
        diar = [
            DiarSegment("SPEAKER_00", 0, 1000),
            DiarSegment("SPEAKER_01", 1000, 4000),
        ]
        result = merge_segments(segments, diar)

        # Should split into two segments at the speaker boundary
        assert len(result) == 2
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"
        assert "Hello" in result[0].text
        assert "there" in result[0].text
        assert "second" in result[1].text
        assert "speaker" in result[1].text

    def test_word_level_single_speaker(self):
        """All words from same speaker → one consolidated segment."""
        words = _words_from_text("Hello how are you", 0)
        segments = [_seg("Hello how are you", 0, 800, words=words)]
        diar = [DiarSegment("SPEAKER_00", 0, 2000)]

        result = merge_segments(segments, diar)
        assert len(result) == 1
        assert result[0].speaker_id == "SPEAKER_00"

    def test_word_level_rapid_turn_taking(self):
        """Multiple speaker changes within one segment."""
        words = [
            WordTimestamp("Yes", 0, 200),       # Speaker 0
            WordTimestamp("No", 500, 700),       # Speaker 1
            WordTimestamp("Maybe", 1000, 1200),  # Speaker 0
        ]
        segments = [_seg("Yes No Maybe", 0, 1200, words=words)]
        diar = [
            DiarSegment("SPEAKER_00", 0, 400),
            DiarSegment("SPEAKER_01", 400, 900),
            DiarSegment("SPEAKER_00", 900, 1500),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 3
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[0].text == "Yes"
        assert result[1].speaker_id == "SPEAKER_01"
        assert result[1].text == "No"
        assert result[2].speaker_id == "SPEAKER_00"
        assert result[2].text == "Maybe"

    def test_word_level_across_multiple_segments(self):
        """Word-level alignment works across multiple Whisper segments."""
        words_1 = [
            WordTimestamp("Hello", 0, 300),
            WordTimestamp("there", 300, 600),
        ]
        words_2 = [
            WordTimestamp("Hi", 1000, 1300),
            WordTimestamp("back", 1300, 1600),
        ]
        segments = [
            _seg("Hello there", 0, 600, words=words_1),
            _seg("Hi back", 1000, 1600, words=words_2),
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 800),
            DiarSegment("SPEAKER_01", 800, 2000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 2
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"

    def test_max_segment_length_enforced(self):
        """Consolidated segments must not exceed MAX_SEGMENT_MS."""
        # Create a segment that would be 40s if consolidated
        words = []
        pos = 0
        for i in range(200):
            words.append(WordTimestamp(f"word{i}", pos, pos + 200))
            pos += 200
        # Total: 40,000ms — exceeds MAX_SEGMENT_MS (30,000)

        segments = [_seg(" ".join(f"word{i}" for i in range(200)), 0, 40000, words=words)]
        diar = [DiarSegment("SPEAKER_00", 0, 50000)]

        result = merge_segments(segments, diar)

        # Should be split into at least 2 segments due to max length
        assert len(result) >= 2
        for seg in result:
            assert seg.speaker_id == "SPEAKER_00"
            duration = seg.end_ms - seg.start_ms
            assert duration <= MAX_SEGMENT_MS + 200  # Allow one word of slop

    def test_mixed_segments_with_and_without_words(self):
        """Segments without words fall back to segment-level for that segment."""
        words_1 = [
            WordTimestamp("With", 0, 200),
            WordTimestamp("words", 200, 400),
        ]
        segments = [
            _seg("With words", 0, 400, words=words_1),
            _seg("Without words", 1000, 2000),  # No word timestamps
        ]
        diar = [
            DiarSegment("SPEAKER_00", 0, 500),
            DiarSegment("SPEAKER_01", 500, 3000),
        ]
        result = merge_segments(segments, diar)
        assert len(result) == 2
        assert result[0].speaker_id == "SPEAKER_00"
        assert result[1].speaker_id == "SPEAKER_01"
