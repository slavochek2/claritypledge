"""
Speaker diarization wrapper using pyannote.audio.

Identifies who spoke when. Requires HF_TOKEN env var for gated model access.
Set MOCK_DIARIZATION=true for fast iteration without HuggingFace token.
"""

import logging
import time
from dataclasses import dataclass
from typing import Optional

from config import HF_TOKEN, MOCK_DIARIZATION, GPU_ENABLED

logger = logging.getLogger(__name__)

# Lazy-loaded pipeline singleton
_pipeline = None


@dataclass
class DiarSegment:
    """A diarization segment identifying who spoke when."""
    speaker_id: str  # e.g., "SPEAKER_00", "SPEAKER_01"
    start_ms: int
    end_ms: int


def _get_pipeline():
    """Load pyannote diarization pipeline (lazy singleton)."""
    global _pipeline
    if _pipeline is None:
        from pyannote.audio import Pipeline
        import torch

        if not HF_TOKEN:
            raise ValueError(
                "HF_TOKEN environment variable required for pyannote. "
                "Set MOCK_DIARIZATION=true for testing without it."
            )

        logger.info("Loading pyannote diarization pipeline...")
        t0 = time.time()
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN,
        )

        if GPU_ENABLED:
            _pipeline.to(torch.device("cuda"))

        logger.info("Pipeline loaded in %.1fs", time.time() - t0)
    return _pipeline


def diarize(wav_path: str, num_speakers: Optional[int] = None) -> list[DiarSegment]:
    """
    Run speaker diarization on a WAV file.

    Args:
        wav_path: Path to 16kHz mono WAV file.
        num_speakers: Optional hint for number of speakers.

    Returns:
        List of DiarSegment with speaker IDs and timestamps.
    """
    if MOCK_DIARIZATION:
        return _mock_diarize(wav_path, num_speakers)

    pipeline = _get_pipeline()

    logger.info("Diarizing %s (num_speakers=%s)...", wav_path, num_speakers)
    t0 = time.time()

    kwargs = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = num_speakers

    diarization = pipeline(wav_path, **kwargs)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append(DiarSegment(
            speaker_id=speaker,
            start_ms=int(turn.start * 1000),
            end_ms=int(turn.end * 1000),
        ))

    elapsed = time.time() - t0
    speakers = set(s.speaker_id for s in segments)
    logger.info(
        "Diarized %d segments, %d speakers in %.1fs",
        len(segments), len(speakers), elapsed,
    )
    return segments


def _mock_diarize(wav_path: str, num_speakers: Optional[int] = None) -> list[DiarSegment]:
    """
    Generate synthetic diarization segments for testing.
    Alternates speakers every 10 seconds.
    """
    import wave

    try:
        with wave.open(wav_path, "r") as wf:
            duration_ms = int(wf.getnframes() / wf.getframerate() * 1000)
    except Exception:
        # Fallback: assume 60 seconds if we can't read the WAV
        duration_ms = 60000

    n_speakers = num_speakers or 2
    interval_ms = 10000  # 10 second intervals
    segments = []

    pos = 0
    speaker_idx = 0
    while pos < duration_ms:
        end = min(pos + interval_ms, duration_ms)
        segments.append(DiarSegment(
            speaker_id=f"SPEAKER_{speaker_idx:02d}",
            start_ms=pos,
            end_ms=end,
        ))
        pos = end
        speaker_idx = (speaker_idx + 1) % n_speakers

    logger.info("Mock diarization: %d segments, %d speakers, %dms duration",
                len(segments), n_speakers, duration_ms)
    return segments


def extract_embeddings(wav_path: str, diar_segments: list[DiarSegment]) -> dict[str, list[float]]:
    """
    Extract speaker embeddings for voice profile matching.

    Args:
        wav_path: Path to WAV file.
        diar_segments: Diarization segments identifying speaker regions.

    Returns:
        Dict mapping speaker_id to 512-dim embedding vector.
    """
    if MOCK_DIARIZATION:
        # Return random embeddings for testing
        import random
        speakers = set(s.speaker_id for s in diar_segments)
        return {
            spk: [random.gauss(0, 1) for _ in range(512)]
            for spk in speakers
        }

    from pyannote.audio import Inference
    import torch
    import numpy as np

    logger.info("Extracting speaker embeddings...")

    embedding_model = Inference(
        "pyannote/embedding",
        use_auth_token=HF_TOKEN,
    )

    if GPU_ENABLED:
        embedding_model.to(torch.device("cuda"))

    # Group segments by speaker, extract embedding for each speaker's audio
    speakers = set(s.speaker_id for s in diar_segments)
    embeddings: dict[str, list[float]] = {}

    for speaker in speakers:
        # Get all segments for this speaker
        speaker_segs = [s for s in diar_segments if s.speaker_id == speaker]

        # Use the longest segment for embedding extraction
        longest = max(speaker_segs, key=lambda s: s.end_ms - s.start_ms)

        try:
            from pyannote.core import Segment as PyannoteSegment
            excerpt = PyannoteSegment(longest.start_ms / 1000, longest.end_ms / 1000)
            emb = embedding_model.crop(wav_path, excerpt)

            # Convert to list
            if isinstance(emb, np.ndarray):
                embeddings[speaker] = emb.flatten().tolist()[:512]
            elif isinstance(emb, torch.Tensor):
                embeddings[speaker] = emb.cpu().numpy().flatten().tolist()[:512]
            else:
                embeddings[speaker] = list(emb)[:512]

            # Pad to 512 if needed
            while len(embeddings[speaker]) < 512:
                embeddings[speaker].append(0.0)

        except Exception as e:
            logger.warning("Failed to extract embedding for %s: %s", speaker, e)
            embeddings[speaker] = [0.0] * 512

    logger.info("Extracted embeddings for %d speakers", len(embeddings))
    return embeddings
