"""
Whisper transcription wrapper.

Uses openai-whisper to transcribe audio to text with timestamps.
Auto-detects language. Uses --condition-on-previous-text False
to prevent hallucination loops.
"""

import logging
import time
from dataclasses import dataclass

from config import WHISPER_MODEL, GPU_ENABLED

logger = logging.getLogger(__name__)

# Lazy-loaded model singleton
_model = None


@dataclass
class Segment:
    """A transcribed text segment with timestamps."""
    text: str
    start_ms: int
    end_ms: int


def _get_model():
    """Load Whisper model (lazy singleton)."""
    global _model
    if _model is None:
        import whisper
        device = "cuda" if GPU_ENABLED else "cpu"
        logger.info("Loading Whisper model '%s' on %s...", WHISPER_MODEL, device)
        t0 = time.time()
        _model = whisper.load_model(WHISPER_MODEL, device=device)
        logger.info("Model loaded in %.1fs", time.time() - t0)
    return _model


def whisper_transcribe(wav_path: str) -> tuple[list[Segment], str]:
    """
    Transcribe a WAV file using Whisper.

    Args:
        wav_path: Path to 16kHz mono WAV file.

    Returns:
        Tuple of (list of Segments, detected language code e.g. "en").
    """
    model = _get_model()

    logger.info("Transcribing %s...", wav_path)
    t0 = time.time()

    result = model.transcribe(
        wav_path,
        condition_on_previous_text=False,  # prevent hallucination loops
        word_timestamps=True,
        verbose=False,
    )

    elapsed = time.time() - t0
    language = result.get("language", "en")

    segments = []
    for seg in result.get("segments", []):
        segments.append(Segment(
            text=seg["text"].strip(),
            start_ms=int(seg["start"] * 1000),
            end_ms=int(seg["end"] * 1000),
        ))

    logger.info(
        "Transcribed %d segments in %.1fs, language=%s",
        len(segments), elapsed, language,
    )
    return segments, language
