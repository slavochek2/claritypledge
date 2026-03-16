"""
Speaker-to-user mapping with two layers:

Layer 1 (metadata): Uses chunk filenames and events.json participant list
  to map diarization speaker IDs to user display names.

Layer 2 (voice profiles): Extract pyannote embeddings per speaker,
  cosine similarity against stored user_voice_profiles.
  Confidence threshold: 0.75. Overrides Layer 1 when confident.
"""

import logging
import math
from dataclasses import dataclass
from typing import Optional

from config import VOICE_MATCH_CONFIDENCE_THRESHOLD

logger = logging.getLogger(__name__)


@dataclass
class SpeakerMapping:
    """Mapping for a single diarization speaker to a real user."""
    user_id: Optional[str]
    display_name: str
    mapping_method: str  # "metadata", "voice_profile", "unknown"
    confidence: float


def build_speaker_map(
    speaker_ids: list[str],
    events: Optional[dict],
    recorder_names: list[str],
    embeddings: dict[str, list[float]],
    voice_profiles: list[dict],
) -> dict[str, dict]:
    """
    Build speaker map combining metadata heuristics and voice profile matching.

    Args:
        speaker_ids: Diarization speaker IDs (e.g., ["SPEAKER_00", "SPEAKER_01"]).
        events: Parsed events.json with participants list.
        recorder_names: Names extracted from chunk filenames (e.g., ["slava", "jan"]).
        embeddings: Speaker embeddings from diarization { speaker_id: [512 floats] }.
        voice_profiles: Existing voice profiles from DB [{ user_id, display_name, embedding }].

    Returns:
        Speaker map in the spec format:
        { "SPEAKER_00": { "user_id": ..., "display_name": ..., "mapping_method": ..., "confidence": ... } }
    """
    # Layer 1: Metadata mapping
    mapping = _metadata_mapping(speaker_ids, events, recorder_names)

    # Layer 2: Voice profile matching (overrides Layer 1 when confident)
    if embeddings and voice_profiles:
        mapping = _voice_profile_override(mapping, embeddings, voice_profiles)

    # Convert to output format
    result = {}
    for speaker_id, info in mapping.items():
        result[speaker_id] = {
            "user_id": info.user_id,
            "display_name": info.display_name,
            "mapping_method": info.mapping_method,
            "confidence": info.confidence,
        }

    logger.info("Speaker map: %s", {k: v["display_name"] for k, v in result.items()})
    return result


def _metadata_mapping(
    speaker_ids: list[str],
    events: Optional[dict],
    recorder_names: list[str],
) -> dict[str, SpeakerMapping]:
    """
    Layer 1: Map speakers using metadata from events.json and filenames.

    Strategy:
    - Extract participant names from events.json
    - For two-phone: recorder names from filenames → one speaker per recorder
    - For single-phone: order heuristics (creator speaks first typically)
    """
    participants = _extract_participants(events)
    mapping: dict[str, SpeakerMapping] = {}

    if len(recorder_names) >= 2 and len(speaker_ids) >= 2:
        # Two-phone recording: each recorder captures one person louder
        # Map recorder names to speaker IDs by order
        for i, speaker_id in enumerate(sorted(speaker_ids)):
            if i < len(recorder_names):
                name = recorder_names[i]
                user_id = _find_user_id(name, participants)
                mapping[speaker_id] = SpeakerMapping(
                    user_id=user_id,
                    display_name=_capitalize_name(name),
                    mapping_method="metadata",
                    confidence=0.7,
                )
            else:
                mapping[speaker_id] = SpeakerMapping(
                    user_id=None,
                    display_name=f"Speaker {i + 1}",
                    mapping_method="unknown",
                    confidence=0.3,
                )
    elif participants:
        # Single-phone: use participant list from events.json
        for i, speaker_id in enumerate(sorted(speaker_ids)):
            if i < len(participants):
                p = participants[i]
                mapping[speaker_id] = SpeakerMapping(
                    user_id=p.get("user_id"),
                    display_name=p["name"],
                    mapping_method="metadata",
                    confidence=0.6,
                )
            else:
                mapping[speaker_id] = SpeakerMapping(
                    user_id=None,
                    display_name=f"Speaker {i + 1}",
                    mapping_method="unknown",
                    confidence=0.3,
                )
    else:
        # No metadata — generic labels
        for i, speaker_id in enumerate(sorted(speaker_ids)):
            mapping[speaker_id] = SpeakerMapping(
                user_id=None,
                display_name=f"Speaker {i + 1}",
                mapping_method="unknown",
                confidence=0.3,
            )

    return mapping


def _extract_participants(events: Optional[dict]) -> list[dict]:
    """
    Extract participant info from events.json.

    Returns list of { name, role, user_id? } ordered by role (creator first).
    """
    if not events:
        return []

    participants = events.get("participants", [])
    uploader = events.get("uploader", {})

    result = []
    for p in participants:
        info = {
            "name": p.get("name", "Unknown"),
            "role": p.get("role", "unknown"),
        }
        # If uploader matches this participant, attach user_id
        if uploader and uploader.get("name") == p.get("name"):
            info["user_id"] = uploader.get("supabaseUserId")
        else:
            info["user_id"] = None
        result.append(info)

    # Sort: creator first, then joiner
    result.sort(key=lambda p: 0 if p["role"] == "creator" else 1)
    return result


def _voice_profile_override(
    mapping: dict[str, SpeakerMapping],
    embeddings: dict[str, list[float]],
    voice_profiles: list[dict],
) -> dict[str, SpeakerMapping]:
    """
    Layer 2: Override metadata mapping when voice profile match is confident.
    """
    for speaker_id, embedding in embeddings.items():
        if speaker_id not in mapping:
            continue

        best_match = None
        best_similarity = 0.0

        for profile in voice_profiles:
            profile_embedding = profile.get("embedding")
            if not profile_embedding:
                continue

            similarity = _cosine_similarity(embedding, profile_embedding)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = profile

        if best_match and best_similarity >= VOICE_MATCH_CONFIDENCE_THRESHOLD:
            logger.info(
                "Voice match: %s → %s (%.2f confidence)",
                speaker_id, best_match["display_name"], best_similarity,
            )
            mapping[speaker_id] = SpeakerMapping(
                user_id=best_match.get("user_id"),
                display_name=best_match["display_name"],
                mapping_method="voice_profile",
                confidence=best_similarity,
            )

    return mapping


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b) or not a:
        return 0.0

    dot_product = sum(x * y for x, y in zip(a, b))
    magnitude_a = math.sqrt(sum(x * x for x in a))
    magnitude_b = math.sqrt(sum(x * x for x in b))

    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0

    return dot_product / (magnitude_a * magnitude_b)


def _find_user_id(name: str, participants: list[dict]) -> Optional[str]:
    """Find user_id for a name in the participant list (case-insensitive)."""
    name_lower = name.lower()
    for p in participants:
        if p["name"].lower() == name_lower:
            return p.get("user_id")
    return None


def _capitalize_name(name: str) -> str:
    """Capitalize a sanitized filename back to display name."""
    return name.replace("-", " ").title()
