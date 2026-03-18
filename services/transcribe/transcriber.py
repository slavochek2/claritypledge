"""
Whisper transcription wrapper.

Uses openai-whisper to transcribe audio to text with timestamps.
Auto-detects language. Uses --condition-on-previous-text False
to prevent hallucination loops.

P546: Extracts word-level timestamps and supports language_hint parameter.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from config import WHISPER_MODEL, GPU_ENABLED

logger = logging.getLogger(__name__)

# Lazy-loaded model singleton
_model = None


@dataclass
class WordTimestamp:
    """A single word with its timestamp range."""
    word: str
    start_ms: int
    end_ms: int


@dataclass
class Segment:
    """A transcribed text segment with timestamps."""
    text: str
    start_ms: int
    end_ms: int
    words: list[WordTimestamp] = field(default_factory=list)


def _get_model():
    """Load Whisper model (lazy singleton).

    Uses WHISPER_CACHE_DIR if set (model pre-baked in Docker image).
    """
    global _model
    if _model is None:
        import whisper
        import os
        device = "cuda" if GPU_ENABLED else "cpu"
        cache_dir = os.environ.get("WHISPER_CACHE_DIR")
        logger.info("Loading Whisper model '%s' on %s (cache=%s)...",
                     WHISPER_MODEL, device, cache_dir or "default")
        t0 = time.time()
        kwargs = {"device": device}
        if cache_dir:
            kwargs["download_root"] = cache_dir
        _model = whisper.load_model(WHISPER_MODEL, **kwargs)
        logger.info("Model loaded in %.1fs", time.time() - t0)
    return _model


def whisper_transcribe(
    wav_path: str,
    language_hint: Optional[str] = None,
) -> tuple[list[Segment], str]:
    """
    Transcribe a WAV file using Whisper.

    Args:
        wav_path: Path to 16kHz mono WAV file.
        language_hint: Optional language code (e.g. "en") to pass to Whisper
            instead of auto-detection. Prevents hallucinating wrong languages
            on noisy audio.

    Returns:
        Tuple of (list of Segments, detected language code e.g. "en").
    """
    model = _get_model()

    logger.info("Transcribing %s (language_hint=%s)...", wav_path, language_hint)
    t0 = time.time()

    transcribe_kwargs = dict(
        condition_on_previous_text=False,  # prevent hallucination loops
        word_timestamps=True,
        verbose=False,
    )
    if language_hint:
        transcribe_kwargs["language"] = language_hint

    result = model.transcribe(wav_path, **transcribe_kwargs)

    elapsed = time.time() - t0
    language = result.get("language", "en")

    segments = []
    for seg in result.get("segments", []):
        words = []
        for w in seg.get("words", []):
            words.append(WordTimestamp(
                word=w.get("word", "").strip(),
                start_ms=int(w["start"] * 1000),
                end_ms=int(w["end"] * 1000),
            ))

        segments.append(Segment(
            text=seg["text"].strip(),
            start_ms=int(seg["start"] * 1000),
            end_ms=int(seg["end"] * 1000),
            words=words,
        ))

    total_words = sum(len(s.words) for s in segments)
    logger.info(
        "Transcribed %d segments (%d words) in %.1fs, language=%s",
        len(segments), total_words, elapsed, language,
    )
    return segments, language
