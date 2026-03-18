"""
Voice Activity Detection preprocessing for the transcription pipeline.

Uses pyannote VAD to identify speech regions, then creates a new WAV
containing only those regions. This eliminates Whisper hallucinations
on silence and ambient noise.

P546: Added to fix hallucinations ("Thank you" x53) and language
misattribution caused by Whisper processing non-speech audio.
"""

import logging
import os
import wave
import struct
from typing import Optional

from config import HF_TOKEN, GPU_ENABLED, MOCK_DIARIZATION

logger = logging.getLogger(__name__)

# If VAD strips audio below this ratio of the original, something is wrong
MIN_SPEECH_RATIO = 0.05  # 5% — if less than 5% is speech, likely miscalibrated


def strip_silence(wav_path: str) -> Optional[str]:
    """
    Strip non-speech regions from a WAV file using pyannote VAD.

    Args:
        wav_path: Path to 16kHz mono WAV file.

    Returns:
        Path to new WAV with only speech regions, or None if VAD
        produces too little output (safety check).
    """
    if MOCK_DIARIZATION:
        # In mock mode, skip VAD — return original audio
        logger.info("Mock mode — skipping VAD")
        return wav_path

    speech_regions = _detect_speech(wav_path)

    if not speech_regions:
        logger.warning("VAD found no speech regions in %s", wav_path)
        return None

    # Safety check: ensure we're not stripping too much
    original_duration = _get_wav_duration_ms(wav_path)
    speech_duration = sum(end - start for start, end in speech_regions)

    if original_duration > 0:
        ratio = speech_duration / original_duration
        logger.info(
            "VAD: %.1f%% speech (%.1fs of %.1fs), %d regions",
            ratio * 100,
            speech_duration / 1000,
            original_duration / 1000,
            len(speech_regions),
        )

        if ratio < MIN_SPEECH_RATIO:
            logger.warning(
                "VAD speech ratio %.1f%% is below threshold %.1f%% — "
                "returning original audio to avoid data loss",
                ratio * 100, MIN_SPEECH_RATIO * 100,
            )
            return None

    # Create new WAV with only speech regions
    output_path = wav_path.replace(".wav", "_vad.wav")
    _extract_regions(wav_path, speech_regions, output_path)

    return output_path


def _detect_speech(wav_path: str) -> list[tuple[int, int]]:
    """
    Detect speech regions using pyannote VAD.

    Returns list of (start_ms, end_ms) tuples for speech regions.
    """
    from pyannote.audio import Pipeline
    import torch

    if not HF_TOKEN:
        logger.warning("No HF_TOKEN — cannot run VAD")
        return []

    logger.info("Running pyannote VAD on %s...", wav_path)

    pipeline = Pipeline.from_pretrained(
        "pyannote/voice-activity-detection",
        use_auth_token=HF_TOKEN,
    )

    if GPU_ENABLED:
        pipeline.to(torch.device("cuda"))

    vad_result = pipeline(wav_path)

    regions = []
    for speech_turn in vad_result.get_timeline().support():
        start_ms = int(speech_turn.start * 1000)
        end_ms = int(speech_turn.end * 1000)
        regions.append((start_ms, end_ms))

    return regions


def _get_wav_duration_ms(wav_path: str) -> int:
    """Get WAV file duration in milliseconds."""
    try:
        with wave.open(wav_path, "r") as wf:
            return int(wf.getnframes() / wf.getframerate() * 1000)
    except Exception:
        return 0


def _extract_regions(
    wav_path: str,
    regions: list[tuple[int, int]],
    output_path: str,
) -> None:
    """
    Extract speech regions from a WAV file and write to a new file.

    Inserts 50ms silence between regions to prevent words from running
    together at region boundaries.
    """
    with wave.open(wav_path, "r") as wf:
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        n_channels = wf.getnchannels()
        all_frames = wf.readframes(wf.getnframes())

    bytes_per_sample = sample_width * n_channels
    gap_samples = int(sample_rate * 0.05)  # 50ms silence gap
    gap_bytes = b'\x00' * (gap_samples * bytes_per_sample)

    output_frames = bytearray()

    for i, (start_ms, end_ms) in enumerate(regions):
        start_sample = int(start_ms * sample_rate / 1000)
        end_sample = int(end_ms * sample_rate / 1000)

        start_byte = start_sample * bytes_per_sample
        end_byte = end_sample * bytes_per_sample

        # Clamp to file bounds
        start_byte = max(0, min(start_byte, len(all_frames)))
        end_byte = max(0, min(end_byte, len(all_frames)))

        output_frames.extend(all_frames[start_byte:end_byte])

        # Add silence gap between regions (not after the last one)
        if i < len(regions) - 1:
            output_frames.extend(gap_bytes)

    with wave.open(output_path, "w") as out:
        out.setnchannels(n_channels)
        out.setsampwidth(sample_width)
        out.setframerate(sample_rate)
        out.writeframes(bytes(output_frames))

    logger.info("VAD output: %s (%d bytes)", output_path, len(output_frames))
