---
status: backlog
type: bug
rank: 5
flow: fix
tags:
  - recording
  - infrastructure
  - live
---

# P566: Audio Chunk Upload Reliability

## Problem Statement

Multi-phone /live session recordings have significant chunk loss. E7QDTX shows 35% of Slava's chunks missing (57 of 87 expected). Missing chunks create audio gaps that no transcription pipeline can recover from.

Chunk pattern: `{recorder}_chunk_{NNN}.webm`. Only chunk_000 has WebM headers — if any chunk is lost, the audio has a gap at that position. Some "uploaded" chunks are near-empty (905 bytes, 4KB) — likely failed mid-upload.

## Root Cause (suspected)

Browser MediaRecorder API produces chunks periodically. The upload mechanism (likely fetch/XHR to GCS signed URL) can fail silently when:
- Network drops momentarily (mobile on WiFi)
- Browser tab is backgrounded (OS throttles)
- Large chunk + slow upload = timeout before next chunk is ready

No retry mechanism, no upload verification, no gap detection on the client side.

## Acceptance Criteria

- [ ] Investigate client-side recording code — how chunks are produced and uploaded
- [ ] Add retry logic for failed chunk uploads (exponential backoff, 3 retries)
- [ ] Detect and log chunk gaps client-side (missing sequence numbers)
- [ ] Surface upload health to the user ("recording quality: X%")
- [ ] Verify fix on 3 new sessions with zero chunk loss

## Impact

Blocks transcription quality improvements. Even perfect speaker attribution can't work on audio that doesn't exist. This is the foundation — fix before iterating on attribution.
