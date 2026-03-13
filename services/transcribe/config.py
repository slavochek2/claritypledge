"""
Environment configuration for the transcription pipeline.

All settings are read from environment variables with sensible defaults
for local development.
"""

import os
import logging

logger = logging.getLogger(__name__)


# GCS
GCS_BUCKET = os.getenv("GCS_BUCKET", "claritypledge-ml-training")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# HuggingFace (for pyannote gated models)
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Whisper
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")

# GPU auto-detection
def _detect_gpu() -> bool:
    gpu_env = os.getenv("GPU_ENABLED")
    if gpu_env is not None:
        return gpu_env.lower() in ("true", "1", "yes")
    try:
        import torch
        available = torch.cuda.is_available()
        if available:
            logger.info("GPU detected: %s", torch.cuda.get_device_name(0))
        return available
    except ImportError:
        return False

GPU_ENABLED = _detect_gpu()

# Mock modes for local development
MOCK_DIARIZATION = os.getenv("MOCK_DIARIZATION", "false").lower() in ("true", "1", "yes")
MOCK_GCS = os.getenv("MOCK_GCS", "false").lower() in ("true", "1", "yes")
LOCAL_AUDIO_PATH = os.getenv("LOCAL_AUDIO_PATH", "")

# Service
PORT = int(os.getenv("PORT", "8080"))

# Voice profile matching
VOICE_MATCH_CONFIDENCE_THRESHOLD = 0.75
