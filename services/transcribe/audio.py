"""
Audio handling: download chunks from GCS, concatenate, decode to WAV.

GCS path pattern:
  gs://claritypledge-ml-training/sessions/{code}/{userName}_chunk_{NNN}.webm

Only chunk_000 has WebM headers; subsequent chunks are raw continuation bytes.
Must cat in order before ffmpeg decode.
"""

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from config import GCS_BUCKET, MOCK_GCS, LOCAL_AUDIO_PATH

logger = logging.getLogger(__name__)


@dataclass
class SessionAudio:
    """Downloaded and decoded audio for a session."""
    # Per-recorder WAV files: { "slava": "/tmp/.../slava.wav", ... }
    recorder_wavs: dict[str, str] = field(default_factory=dict)
    # Merged WAV for single-phone sessions (all speakers on one device)
    merged_wav: Optional[str] = None
    # Events data from the highest-numbered events JSON per recorder
    events: Optional[dict] = None
    # Temp directory (caller should clean up)
    tmp_dir: str = ""
    # Number of recorders
    num_recorders: int = 0


def download_session_audio(session_code: str) -> SessionAudio:
    """
    Download audio chunks and events from GCS (or local path in mock mode),
    concatenate chunks per recorder, decode to 16kHz mono WAV.

    Returns SessionAudio with WAV paths and events data.
    """
    tmp_dir = tempfile.mkdtemp(prefix=f"transcribe_{session_code}_")
    logger.info("Working directory: %s", tmp_dir)

    if MOCK_GCS:
        return _download_local(session_code, tmp_dir)
    else:
        return _download_gcs(session_code, tmp_dir)


def _download_gcs(session_code: str, tmp_dir: str) -> SessionAudio:
    """Download from Google Cloud Storage."""
    from google.cloud import storage

    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    prefix = f"sessions/{session_code}/"

    blobs = list(bucket.list_blobs(prefix=prefix))
    if not blobs:
        raise FileNotFoundError(f"No files found at gs://{GCS_BUCKET}/{prefix}")

    logger.info("Found %d files in GCS for session %s", len(blobs), session_code)

    # Download all files to tmp_dir
    for blob in blobs:
        filename = blob.name.split("/")[-1]
        local_path = os.path.join(tmp_dir, filename)
        blob.download_to_filename(local_path)
        logger.debug("Downloaded %s", filename)

    return _process_downloaded_files(session_code, tmp_dir)


def _download_local(session_code: str, tmp_dir: str) -> SessionAudio:
    """Use local files instead of GCS (for testing)."""
    source_dir = LOCAL_AUDIO_PATH or f"/tmp/test-audio/{session_code}"

    if not os.path.isdir(source_dir):
        raise FileNotFoundError(f"Local audio directory not found: {source_dir}")

    # Copy files to tmp_dir
    import shutil
    for filename in os.listdir(source_dir):
        src = os.path.join(source_dir, filename)
        dst = os.path.join(tmp_dir, filename)
        if os.path.isfile(src):
            shutil.copy2(src, dst)

    return _process_downloaded_files(session_code, tmp_dir)


def _process_downloaded_files(session_code: str, tmp_dir: str) -> SessionAudio:
    """
    Process downloaded files: group chunks by recorder, find events,
    concatenate and decode.
    """
    files = os.listdir(tmp_dir)

    # Group chunks by recorder name
    # Pattern: {userName}_chunk_{NNN}.webm
    chunks_by_recorder: dict[str, list[str]] = {}
    events_files: list[str] = []

    for f in files:
        if "_chunk_" in f and f.endswith(".webm"):
            recorder = f.split("_chunk_")[0]
            chunks_by_recorder.setdefault(recorder, []).append(f)
        elif "_events_" in f and f.endswith(".json"):
            events_files.append(f)
        elif f == "events.json":
            events_files.append(f)

    if not chunks_by_recorder:
        raise FileNotFoundError(f"No audio chunks found for session {session_code}")

    # Sort chunks within each recorder by number
    for recorder in chunks_by_recorder:
        chunks_by_recorder[recorder].sort()

    logger.info(
        "Session %s: %d recorders (%s), %d event files",
        session_code,
        len(chunks_by_recorder),
        ", ".join(chunks_by_recorder.keys()),
        len(events_files),
    )

    # Load events from highest-numbered events file
    events = _load_events(tmp_dir, events_files)

    # Concatenate and decode per recorder
    recorder_wavs: dict[str, str] = {}
    for recorder, chunk_files in chunks_by_recorder.items():
        wav_path = _concat_and_decode(tmp_dir, recorder, chunk_files)
        recorder_wavs[recorder] = wav_path

    # For single-phone sessions, the single WAV is also the merged WAV
    merged_wav = None
    if len(recorder_wavs) == 1:
        merged_wav = list(recorder_wavs.values())[0]
    else:
        # Multi-phone: merge all recorder WAVs into one
        merged_wav = _merge_wavs(tmp_dir, list(recorder_wavs.values()))

    return SessionAudio(
        recorder_wavs=recorder_wavs,
        merged_wav=merged_wav,
        events=events,
        tmp_dir=tmp_dir,
        num_recorders=len(recorder_wavs),
    )


def _load_events(tmp_dir: str, events_files: list[str]) -> Optional[dict]:
    """Load events from the highest-numbered events JSON file."""
    if not events_files:
        logger.warning("No events files found")
        return None

    # Sort to get the highest-numbered (most complete) events file
    events_files.sort()
    latest = events_files[-1]

    with open(os.path.join(tmp_dir, latest), "r") as f:
        events = json.load(f)

    logger.info("Loaded events from %s (%d events)", latest, len(events.get("events", [])))
    return events


def _concat_and_decode(tmp_dir: str, recorder: str, chunk_files: list[str]) -> str:
    """
    Concatenate WebM chunks (only chunk_000 has headers) and decode
    to 16kHz mono WAV using ffmpeg.
    """
    # Cat all chunks in order into a single WebM file
    concat_path = os.path.join(tmp_dir, f"{recorder}_concat.webm")
    with open(concat_path, "wb") as out:
        for chunk_file in chunk_files:
            chunk_path = os.path.join(tmp_dir, chunk_file)
            with open(chunk_path, "rb") as inp:
                out.write(inp.read())

    logger.info("Concatenated %d chunks for %s (%.1f MB)",
                len(chunk_files), recorder,
                os.path.getsize(concat_path) / (1024 * 1024))

    # Decode to 16kHz mono WAV using ffmpeg
    wav_path = os.path.join(tmp_dir, f"{recorder}.wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", concat_path,
        "-ac", "1",         # mono
        "-ar", "16000",     # 16kHz (Whisper expects this)
        "-f", "wav",
        wav_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("ffmpeg failed for %s: %s", recorder, result.stderr)
        raise RuntimeError(f"ffmpeg decode failed for {recorder}: {result.stderr}")

    logger.info("Decoded %s to WAV: %.1f MB", recorder,
                os.path.getsize(wav_path) / (1024 * 1024))
    return wav_path


def _merge_wavs(tmp_dir: str, wav_paths: list[str]) -> str:
    """Merge multiple WAV files into one using ffmpeg amix filter."""
    merged_path = os.path.join(tmp_dir, "merged.wav")

    if len(wav_paths) == 1:
        return wav_paths[0]

    # Build ffmpeg filter for mixing
    inputs = []
    for path in wav_paths:
        inputs.extend(["-i", path])

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", f"amix=inputs={len(wav_paths)}:duration=longest",
        "-ac", "1",
        "-ar", "16000",
        "-f", "wav",
        merged_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("ffmpeg merge failed: %s", result.stderr)
        raise RuntimeError(f"ffmpeg merge failed: {result.stderr}")

    logger.info("Merged %d WAVs to: %.1f MB", len(wav_paths),
                os.path.getsize(merged_path) / (1024 * 1024))
    return merged_path
