"""
Overlap-based alignment: merges Whisper transcript segments with
pyannote diarization segments.

Each output segment gets { speaker_id, text, start_ms, end_ms }.

P546: Uses word-level timestamps for speaker assignment instead of
segment-level. Each word is matched to the pyannote speaker with
the greatest temporal overlap, then consecutive same-speaker words
are grouped into segments.
"""

import logging
from dataclasses import dataclass

from transcriber import Segment, WordTimestamp
from diarizer import DiarSegment

logger = logging.getLogger(__name__)

# Maximum consolidated segment length before forcing a split
MAX_SEGMENT_MS = 30_000  # 30 seconds


@dataclass
class MergedSegment:
    """A transcript segment with speaker attribution."""
    speaker_id: str
    text: str
    start_ms: int
    end_ms: int


def merge_segments(
    transcript_segments: list[Segment],
    diar_segments: list[DiarSegment],
) -> list[MergedSegment]:
    """
    Merge transcript segments with diarization segments using word-level
    overlap alignment.

    For each word in the transcript, find the diarization segment with the
    greatest temporal overlap and assign that speaker ID. Then group
    consecutive same-speaker words into segments.

    Falls back to segment-level alignment when word timestamps are not
    available.

    Args:
        transcript_segments: Whisper output segments with text + timestamps + words.
        diar_segments: pyannote diarization segments with speaker IDs.

    Returns:
        List of MergedSegment combining text with speaker attribution.
    """
    if not transcript_segments:
        return []

    if not diar_segments:
        # No diarization available — assign all to SPEAKER_00
        logger.warning("No diarization segments — assigning all to SPEAKER_00")
        return [
            MergedSegment(
                speaker_id="SPEAKER_00",
                text=seg.text,
                start_ms=seg.start_ms,
                end_ms=seg.end_ms,
            )
            for seg in transcript_segments
        ]

    # Check if word-level timestamps are available
    has_words = any(seg.words for seg in transcript_segments)

    if has_words:
        merged = _merge_word_level(transcript_segments, diar_segments)
    else:
        logger.warning("No word timestamps available — falling back to segment-level alignment")
        merged = _merge_segment_level(transcript_segments, diar_segments)

    # Consolidate consecutive same-speaker segments (with max length)
    merged = _consolidate_same_speaker(merged)

    logger.info("Merged %d transcript segments into %d speaker-attributed segments",
                len(transcript_segments), len(merged))
    return merged


def _merge_word_level(
    transcript_segments: list[Segment],
    diar_segments: list[DiarSegment],
) -> list[MergedSegment]:
    """
    Word-level alignment: assign each word to its best-matching speaker,
    then group consecutive same-speaker words into segments.
    """
    word_speakers: list[tuple[WordTimestamp, str]] = []

    for seg in transcript_segments:
        if not seg.words:
            # Segment has no words — fall back to segment-level for this one
            speaker = _find_best_speaker_for_interval(
                seg.start_ms, seg.end_ms, diar_segments
            )
            word_speakers.append((
                WordTimestamp(word=seg.text, start_ms=seg.start_ms, end_ms=seg.end_ms),
                speaker,
            ))
            continue

        for word in seg.words:
            speaker = _find_best_speaker_for_interval(
                word.start_ms, word.end_ms, diar_segments
            )
            word_speakers.append((word, speaker))

    if not word_speakers:
        return []

    # Group consecutive same-speaker words into segments, enforcing max length
    segments: list[MergedSegment] = []
    current_words: list[WordTimestamp] = [word_speakers[0][0]]
    current_speaker = word_speakers[0][1]

    for word, speaker in word_speakers[1:]:
        # Check if adding this word would exceed max segment length
        would_exceed_max = (
            current_words
            and (word.end_ms - current_words[0].start_ms) > MAX_SEGMENT_MS
        )

        if speaker == current_speaker and not would_exceed_max:
            current_words.append(word)
        else:
            # Speaker changed or max length reached — flush current segment
            segments.append(_words_to_segment(current_words, current_speaker))
            current_words = [word]
            current_speaker = speaker

    # Flush final segment
    if current_words:
        segments.append(_words_to_segment(current_words, current_speaker))

    return segments


def _words_to_segment(words: list[WordTimestamp], speaker: str) -> MergedSegment:
    """Convert a list of words into a single MergedSegment."""
    text = " ".join(w.word for w in words)
    return MergedSegment(
        speaker_id=speaker,
        text=text,
        start_ms=words[0].start_ms,
        end_ms=words[-1].end_ms,
    )


def _merge_segment_level(
    transcript_segments: list[Segment],
    diar_segments: list[DiarSegment],
) -> list[MergedSegment]:
    """
    Legacy segment-level alignment: assign each transcript segment to the
    speaker with the greatest temporal overlap.
    """
    merged = []
    for seg in transcript_segments:
        speaker = _find_best_speaker_for_interval(
            seg.start_ms, seg.end_ms, diar_segments
        )
        merged.append(MergedSegment(
            speaker_id=speaker,
            text=seg.text,
            start_ms=seg.start_ms,
            end_ms=seg.end_ms,
        ))
    return merged


def _find_best_speaker_for_interval(
    start_ms: int, end_ms: int, diar_segments: list[DiarSegment]
) -> str:
    """Find the diarization speaker with maximum overlap for a time interval."""
    best_speaker = "SPEAKER_00"
    best_overlap = 0

    for diar in diar_segments:
        overlap = _compute_overlap(start_ms, end_ms, diar.start_ms, diar.end_ms)
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = diar.speaker_id

    return best_speaker


def _compute_overlap(start1: int, end1: int, start2: int, end2: int) -> int:
    """Compute temporal overlap in milliseconds between two intervals."""
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    return max(0, overlap_end - overlap_start)


def _consolidate_same_speaker(segments: list[MergedSegment]) -> list[MergedSegment]:
    """
    Merge consecutive segments from the same speaker into one,
    joining their text with spaces. Enforces MAX_SEGMENT_MS to prevent
    mega-segments.
    """
    if not segments:
        return []

    consolidated = [segments[0]]
    for seg in segments[1:]:
        prev = consolidated[-1]
        segment_duration = seg.end_ms - prev.start_ms

        if seg.speaker_id == prev.speaker_id and segment_duration <= MAX_SEGMENT_MS:
            # Same speaker and within max length — merge
            prev.text = prev.text + " " + seg.text
            prev.end_ms = seg.end_ms
        else:
            consolidated.append(seg)

    return consolidated
