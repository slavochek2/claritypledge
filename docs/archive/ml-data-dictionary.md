# ML Training Data Dictionary

This document explains the data captured for ML training (P28) and how to use it.

## Purpose

We capture audio + behavioral events during live "understanding check" sessions to validate if voice/audio patterns correlate with understanding gaps. The goal is to build a model that can predict when users don't understand each other.

## Quick Start

```bash
# 1. List available sessions
gsutil ls gs://claritypledge-ml-training/sessions/

# 2. Verify a session is valid
./scripts/verify-ml-session.sh SESSION_CODE

# 3. Download and stitch a session
mkdir ~/ml-data && cd ~/ml-data
gsutil -m cp -r gs://claritypledge-ml-training/sessions/SESSION_CODE/ .
# Then use FFmpeg to stitch chunks (see ml-training-setup.md)
```

## Data Format

### Audio Files

| Property | Value |
|----------|-------|
| Format | WebM container with Opus codec |
| Sample rate | 48 kHz (browser default) |
| Channels | Mono (single microphone) |
| Bitrate | 128 kbps |
| Chunk duration | 30 seconds |

**File naming:**
- `{username}_chunk_000.webm` - First 30 seconds
- `{username}_chunk_001.webm` - Seconds 30-60
- etc.

**Critical:** `chunk_000` contains the WebM header. Without it, audio cannot be stitched.

### Events JSON

Each session has events files with behavioral data:

```json
{
  "sessionCode": "ABC123",
  "capturedAt": "2025-01-05T14:30:00Z",
  "sessionStartedAt": 1735913400000,
  "sessionEndedAt": 1735914300000,
  "durationMs": 900000,
  "participants": [
    { "name": "Slava", "role": "creator" },
    { "name": "Gosha", "role": "joiner" }
  ],
  "uploader": {
    "supabaseUserId": "abc-123-def",
    "email": "slava@example.com",
    "name": "Slava"
  },
  "events": [...]
}
```

## Event Types & Meanings

### Ground Truth Events (Labels)

| Event | What it means | ML significance |
|-------|---------------|-----------------|
| `live_rating_submitted` | User rated their understanding (1-10) | **Primary label** - self-reported understanding |
| `live_understanding_revealed` | Both ratings shown | Contains `checker_rating` and `responder_rating` |
| `live_perfect_understanding` | Both rated 10/10 | Positive outcome signal |
| `live_explain_back_rated` | Re-rating after correction | Shows if correction worked |

### Behavioral Events (Features)

| Event | What it means | ML significance |
|-------|---------------|-----------------|
| `live_explain_back_started` | User began explaining back | Correction loop entry |
| `live_explain_back_done` | User finished explaining | Duration signal |
| `live_clarify_started` | Speaker started clarifying | Confusion marker |
| `live_clarify_done` | Speaker finished clarifying | Clarification duration |
| `live_round_skipped` | User skipped understanding check | Tolerance threshold signal |
| `live_share_perspective_requested` | Listener wants to speak | Cognitive friction signal |
| `live_role_switch_*` | Role negotiation events | Communication breakdown signal |

### Event Properties

Each event has properties. Key ones:

| Property | Type | Meaning |
|----------|------|---------|
| `rating` | 1-10 | Self-reported understanding level |
| `role` | "checker" \| "responder" | Who is rating |
| `round` | number | Which correction round (0 = initial) |
| `session_code` | string | Session identifier |

## Timestamp Alignment

**Critical:** `events[].timestamp` is **relative** to `sessionStartedAt` in milliseconds.

To align with audio:
```python
# Event at timestamp=45000 happened at 45 seconds into recording
audio_position_seconds = event['timestamp'] / 1000
```

## Hypothesis to Validate

**Question:** Can we predict the `checker_rating` value from audio features captured in the 30 seconds before the rating was submitted?

**Feature extraction window:** 30 seconds of audio before each `live_rating_submitted` event.

**Labels:**
- Binary: rating < 8 = "misunderstanding", rating >= 8 = "understanding"
- Ordinal: raw 1-10 rating

## Correlating with Mixpanel

To get full user journey for a session uploader:

1. Get `supabaseUserId` from events.json `uploader` field
2. Query Mixpanel by `$user_id = supabaseUserId`
3. This gives you user's history before/after the session

## Data Quality Checklist

Before analysis, verify:

- [ ] `chunk_000.webm` exists (has WebM header)
- [ ] Audio plays correctly when stitched
- [ ] `events.json` or highest `_events_XXX.json` parses correctly
- [ ] At least one `live_rating_submitted` event exists
- [ ] `sessionStartedAt` < all event timestamps < `sessionEndedAt`

Use `./scripts/verify-ml-session.sh SESSION_CODE` for automated checks.

## Sample Analysis Code

```python
import json
from pydub import AudioSegment

# Load events
with open('session_events.json') as f:
    data = json.load(f)

# Load stitched audio
audio = AudioSegment.from_file('session_slava.webm', format='webm')

# Extract 30s before each rating
for event in data['events']:
    if event['type'] == 'live_rating_submitted':
        end_ms = event['timestamp']
        start_ms = max(0, end_ms - 30000)

        segment = audio[start_ms:end_ms]
        rating = event['properties']['rating']

        # Now extract features from segment and correlate with rating
        print(f"Rating {rating} at {end_ms}ms, segment duration: {len(segment)}ms")
```

## Access & Permissions

To grant access to an ML engineer:

```bash
# Add viewer access to the bucket
gsutil iam ch user:engineer@email.com:objectViewer gs://claritypledge-ml-training

# Or download everything and share via other means
gsutil -m cp -r gs://claritypledge-ml-training/sessions/ ./all-sessions/
```

## Success Criteria

| Metric | Target | How to measure |
|--------|--------|----------------|
| Valid sessions | 100 | `verify-ml-session.sh` passes |
| Rating-audio correlation | r > 0.3 | Pearson correlation |
| Classification accuracy | > 60% | Binary rating prediction |

**GO decision:** If correlation > 0.3, proceed to build real-time coaching (P29).
**NO-GO decision:** Pivot to text/behavior-only models.
