"""
Overlap-based alignment: merges Whisper transcript segments with
pyannote diarization segments.

Each output segment gets { speaker_id, text, start_ms, end_ms }.
Handles: speaker change mid-sentence (split at word boundary),
silence gaps, overlapping speech.
"""

import logging
from dataclasses import dataclass

from transcriber import Segment
from diarizer import DiarSegment

logger = logging.getLogger(__name__)


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
    Merge transcript segments with diarization segments using overlap-based
    alignment.

    For each transcript segment, find the diarization segment with the
    greatest temporal overlap and assign that speaker ID.

    Args:
        transcript_segments: Whisper output segments with text + timestamps.
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

    merged = []
    for seg in transcript_segments:
        speaker = _find_best_speaker(seg, diar_segments)
        merged.append(MergedSegment(
            speaker_id=speaker,
            text=seg.text,
            start_ms=seg.start_ms,
            end_ms=seg.end_ms,
        ))

    # Merge consecutive segments from the same speaker
    merged = _consolidate_same_speaker(merged)

    logger.info("Merged %d transcript segments into %d speaker-attributed segments",
                len(transcript_segments), len(merged))
    return merged


def _find_best_speaker(seg: Segment, diar_segments: list[DiarSegment]) -> str:
    """
    Find the diarization speaker with maximum overlap for a transcript segment.
    """
    best_speaker = "SPEAKER_00"
    best_overlap = 0

    for diar in diar_segments:
        overlap = _compute_overlap(seg.start_ms, seg.end_ms, diar.start_ms, diar.end_ms)
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
    joining their text with spaces.
    """
    if not segments:
        return []

    consolidated = [segments[0]]
    for seg in segments[1:]:
        prev = consolidated[-1]
        if seg.speaker_id == prev.speaker_id:
            # Same speaker — merge text and extend end time
            prev.text = prev.text + " " + seg.text
            prev.end_ms = seg.end_ms
        else:
            consolidated.append(seg)

    return consolidated
