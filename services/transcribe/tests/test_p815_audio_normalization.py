"""
P815 canary: audio passed to Whisper must be loudness-normalized.

Root cause: Cloud Run pipeline concats WebM chunks and decodes to 16kHz mono
WAV without normalization. Quiet recordings (mean volume < -25 dB) cause
Whisper to hallucinate (e.g., VG6CJR session at -40.6 dB transcribed
"I'm into a new day" as "Pour it into a new nail").

This test fails on current code (no normalization step in audio.py) and
passes after the fix adds a normalization stage to `_concat_and_decode`
or introduces a `normalize_audio()` helper invoked before Whisper.

Run: cd services/transcribe && python -m pytest tests/test_p815_audio_normalization.py -v
"""

import os
import re
import subprocess
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Required for audio module import (env-gated config)
os.environ.setdefault("MOCK_GCS", "true")


MIN_MEAN_VOLUME_DB = -25.0


def _measure_mean_volume_db(wav_path: str) -> float:
    """Return mean volume in dB via ffmpeg volumedetect."""
    result = subprocess.run(
        ["ffmpeg", "-i", wav_path, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    match = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", result.stderr)
    if not match:
        raise RuntimeError(f"Could not parse mean_volume from ffmpeg output:\n{result.stderr}")
    return float(match.group(1))


def _make_quiet_wav(path: str, duration_s: float = 3.0, level_db: float = -40.0) -> None:
    """Generate a sine-wave WAV at the requested level — proxy for a quiet recording."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"sine=frequency=440:duration={duration_s}",
            "-af", f"volume={level_db}dB",
            "-ac", "1", "-ar", "16000", "-f", "wav",
            path,
        ],
        capture_output=True, check=True,
    )


class TestAudioNormalization:
    """Whisper-bound audio must have mean volume above the hallucination threshold."""

    def test_quiet_input_is_normalized_before_whisper(self, tmp_path):
        # Arrange: a quiet recording, mimicking VG6CJR's -40.6 dB output.
        quiet_wav = str(tmp_path / "quiet_input.wav")
        _make_quiet_wav(quiet_wav, duration_s=3.0, level_db=-40.0)
        assert _measure_mean_volume_db(quiet_wav) < -30.0, "Fixture not actually quiet"

        # Act: invoke the pipeline's audio preparation step.
        # Fix MUST expose a callable that produces the WAV fed to Whisper, with
        # normalization applied. Until then this import or call fails.
        from audio import normalize_audio  # noqa: F401  (added by fix)

        normalized_wav = normalize_audio(quiet_wav)

        # Assert: the WAV that Whisper sees must clear the hallucination threshold.
        mean_db = _measure_mean_volume_db(normalized_wav)
        assert mean_db > MIN_MEAN_VOLUME_DB, (
            f"Audio fed to Whisper has mean volume {mean_db:.1f} dB — "
            f"below the -25 dB threshold below which Whisper hallucinates "
            f"(see P815: VG6CJR transcribed 'be like a woman' as 'be like a woman to')"
        )
