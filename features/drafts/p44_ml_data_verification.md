---
status: draft
type: task
workstream: foundation
tags: []
rank: 125369.0
created_date: 2026-01-05
---
# P44: ML Data Verification Plan

## Goal

Verify the ML training data capture pipeline works end-to-end before collecting 100 sessions. Run a 10-session pilot to validate data quality and identify issues.

## Prerequisites

- P28.2 complete (chunked events, reliability safeguards, Mixpanel correlation)
- Production deployment
- GCS bucket accessible: `gs://claritypledge-ml-training/`

## Pilot Test Plan (10 Sessions)

### Step 1: Deploy and Monitor

```bash
# Deploy to production
npm run build && vercel --prod

# Verify Cloud Function is healthy
gcloud functions describe gcs-signed-url --region=us-central1 --format='value(state)'
# Expected: ACTIVE
```

### Step 2: Run 10 Real Sessions

Conduct 10 real live sessions in production (dev sessions are skipped). Each session should:
- Have 2 participants
- Complete at least one understanding check round
- Include at least one rating submission

### Step 3: Verify Each Session

For each session, run:

```bash
./scripts/verify-ml-session.sh SESSION_CODE
```

**Expected output for valid session:**
```
📁 Files in session:
   - slava_chunk_000.webm (bytes)
   - slava_chunk_001.webm (bytes)
   - slava_events_000.json (bytes)
   - slava_events_001.json (bytes)
   - gosha_chunk_000.webm (bytes)
   - events.json (bytes)

🔍 Checking audio chunks...
   ✅ slava: 2 chunks (valid WebM header)
   ✅ gosha: 1 chunks (valid WebM header)

📋 Checking events.json...
   ✅ events.json: 15 events, 5.2min duration
   📝 Participants: Slava, Gosha

=== Summary ===
✅ Session ABC123 is VALID and ready for analysis
```

### Step 4: Stitch and Verify Audio

```bash
# Download and stitch
mkdir ~/pilot-test && cd ~/pilot-test
./scripts/stitch-session.sh SESSION_CODE .

# Play audio to verify quality
open SESSION_CODE_slava.webm
```

**Check for:**
- Audio plays without errors
- No gaps between chunks
- Voice is clear and audible

### Step 5: Validate Events Structure

```bash
# Download events
gsutil cp gs://claritypledge-ml-training/sessions/SESSION_CODE/events.json .

# Check structure
cat events.json | jq '{
  sessionCode,
  durationMs,
  participantCount: (.participants | length),
  eventCount: (.events | length),
  hasUploader: (.uploader != null),
  eventTypes: [.events[].type] | unique
}'
```

**Expected fields:**
- `sessionCode`: Matches session
- `durationMs`: > 0
- `participants`: 2 entries with name/role
- `uploader`: Has `supabaseUserId`, `email`, `name`
- `events`: Array with `live_*` events

### Step 6: Check for Rating Events

```bash
# Count rating events (ground truth labels)
cat events.json | jq '[.events[] | select(.type == "live_rating_submitted")] | length'
```

**Minimum requirement:** At least 1 rating per session.

## How to Detect Session Completion Status

| Scenario | What exists in GCS | How to detect |
|----------|-------------------|---------------|
| **Proper exit** | `events.json` + `{user}_events_XXX.json` | `events.json` present |
| **Browser closed** | Only `{user}_events_XXX.json` | No `events.json`, use highest `_events_XXX.json` |
| **Partner left early** | Chunks stop, events captured | Check `durationMs` < expected |
| **Recording timeout (90min)** | Full chunks + events | `durationMs` ≈ 5400000 (90 min) |

**Detection script:**

```bash
SESSION_CODE=$1

# Check if final events.json exists
if gsutil ls "gs://claritypledge-ml-training/sessions/$SESSION_CODE/events.json" &>/dev/null; then
  echo "✅ Session completed properly (events.json exists)"
else
  # Find highest events snapshot
  LATEST=$(gsutil ls "gs://claritypledge-ml-training/sessions/$SESSION_CODE/*_events_*.json" 2>/dev/null | sort -V | tail -1)
  if [ -n "$LATEST" ]; then
    echo "⚠️ Session abandoned (using $LATEST)"
  else
    echo "❌ No events captured"
  fi
fi
```

## Success Criteria for Pilot

| Metric | Target | How to measure |
|--------|--------|----------------|
| Valid sessions | 8/10 | `verify-ml-session.sh` passes |
| Audio playable | 10/10 | Stitched files play without error |
| Has ratings | 8/10 | At least 1 `live_rating_submitted` event |
| Has uploader info | 10/10 | `uploader.supabaseUserId` present |
| Events parseable | 10/10 | `jq` parses without error |

## Troubleshooting

### Missing chunk_000.webm

**Cause:** Recording started after first chunk interval, or CORS issue on first upload.

**Fix:** Check Cloud Function logs:
```bash
gcloud functions logs read gcs-signed-url --region=us-central1 --limit=50
```

### Events JSON missing or empty

**Cause:** User closed browser before any chunk upload.

**Fix:** Check for `{user}_events_XXX.json` files as backup.

### Audio won't stitch

**Cause:** Missing WebM header in chunk_000.

**Fix:** Verify header:
```bash
gsutil cat gs://claritypledge-ml-training/sessions/XXX/slava_chunk_000.webm | head -c 4 | xxd -p
# Expected: 1a45dfa3
```

### Uploader field missing

**Cause:** User not logged in during session.

**Fix:** Check if `supabaseUserId` is null - guest users won't have this.

## After Pilot: Go/No-Go Decision

After verifying 10 sessions:

**GO (proceed to 100 sessions):**
- 8+ sessions pass all criteria
- No systematic issues found
- Audio quality sufficient for analysis

**PAUSE (fix issues first):**
- < 8 sessions valid
- Systematic upload failures
- Audio quality issues

## Related Docs

- [P28.2 Spec](./p326_2_chunked_events_and_handover.md) - Implementation details
- [ML Data Dictionary](../../docs/archive/ml-data-dictionary.md) - Data format reference
- [ML Training Setup](../../docs/archive/ml-training-setup.md) - Infrastructure guide
