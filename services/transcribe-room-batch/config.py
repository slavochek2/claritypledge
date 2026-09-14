"""
P1307 Decision 5: configuration for the room whole-recording pass.

Every tunable that encodes a measurement or a product rule lives here with its source, so a
change to one is a change in one place.
"""

import os

GCS_BUCKET = os.getenv("GCS_BUCKET", "claritypledge-ml-training")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# The BATCH project key (P1162), never the interactive one — same key transcribe-slice reads.
GEMINI_API_KEY = os.getenv("GEMINI_BATCH_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-transcribe")
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "300"))

PORT = int(os.getenv("PORT", "8080"))

# P1237 RQ5: Gemini with diarization off accepts a long file, bills all of it, and returns
# roughly the opening five minutes with HTTP 200. Segments are therefore never longer than
# five minutes. Do not raise this without re-measuring.
SEGMENT_SECONDS = 300

# The room client's MediaRecorder flush cadence (transcribe capture, CHUNK_INTERVAL_MS).
CHUNK_SECONDS = 30

# The sweep ends a member after this much silence from their device (transcribe_room_sweep_tick
# c_stale). A capture_ended_at more than this far past last_seen_at was stamped by the sweep,
# not by the member's own End — the tab most likely died, and its last chunk with it.
STALE_MINUTES = 10

# Decision 5: cross-member near-duplicates are kept and labelled "also heard by", never deleted.
DUPLICATE_WINDOW_MS = 15_000
DUPLICATE_MIN_SIMILARITY = 0.6

# Crash recovery for claimed jobs.
STALE_PROCESSING_MINUTES = 30
MAX_ATTEMPTS = 3
