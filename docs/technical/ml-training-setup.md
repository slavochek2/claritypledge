# ML Training Data Capture - Setup Guide

This document describes the configuration for P28.1 Audio + Event Data Capture.

## Overview

The ML training data capture feature records audio and behavioral events during live sessions. This data is used to validate whether voice/audio patterns correlate with understanding gaps.

## Architecture

```
Browser                     Cloud Function              GCS Bucket
   │                             │                          │
   │  1. Request signed URL      │                          │
   ├────────────────────────────►│                          │
   │                             │                          │
   │  2. Return signed URL       │                          │
   │◄────────────────────────────┤                          │
   │                             │                          │
   │  3. Upload directly to GCS  │                          │
   ├─────────────────────────────┼─────────────────────────►│
   │                             │                          │
   │  4. Track in Supabase DB    │                          │
   └──────────────────────────────────────► Supabase        │
```

- **Audio + Events** → Google Cloud Storage (`gs://claritypledge-ml-training/`)
- **Tracking DB** → Supabase `ml_training_sessions` table

## GCS Resources (Already Deployed)

- **Bucket:** `gs://claritypledge-ml-training/` (us-central1)
- **Cloud Function:** `https://us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url`
- **Project:** `gen-lang-client-0869694595` (cursor)

## Required Supabase Configuration

### 1. Create Database Table (for tracking)

Run this SQL in the Supabase SQL Editor:

```sql
-- Minimal tracking table for ML training sessions
CREATE TABLE ml_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by session code
CREATE INDEX idx_ml_sessions_code ON ml_training_sessions(session_code);

-- RLS Policy: Allow any user (including guests) to insert recordings
ALTER TABLE ml_training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert ML training sessions"
  ON ml_training_sessions
  FOR INSERT
  WITH CHECK (true);  -- No auth check = works for anon/guests too

CREATE POLICY "Admins can view ML training sessions"
  ON ml_training_sessions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
```

Note: Storage policies are NOT needed - we're using GCS instead of Supabase Storage.

### 2. Configure GCS CORS (Required for Browser Uploads)

The bucket needs CORS configuration to allow browser uploads:

```bash
# Create cors.json
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["http://localhost:5200", "http://localhost:5173", "https://claritypledge.com", "https://www.claritypledge.com"],
    "method": ["PUT", "GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "Content-MD5", "x-goog-*"],
    "maxAgeSeconds": 3600
  }
]
EOF

# Apply to bucket
gsutil cors set /tmp/cors.json gs://claritypledge-ml-training

# Verify
gsutil cors get gs://claritypledge-ml-training
```

### 3. Grant IAM Permissions (Required for Signed URLs)

The Cloud Function service account needs permission to sign URLs:

```bash
# Get the service account
SA_EMAIL=$(gcloud functions describe gcs-signed-url --region=us-central1 --format='value(serviceConfig.serviceAccountEmail)')

# Grant token creator role
gcloud projects add-iam-policy-binding gen-lang-client-0869694595 \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator"
```

## Data Structure

Data is organized in GCS as:

```
gs://claritypledge-ml-training/
└── sessions/
    └── {session_code}/
        ├── {user1-name}.webm   # Audio from user 1
        ├── {user2-name}.webm   # Audio from user 2 (partner)
        └── events.json          # Behavioral events + timestamps
```

## Working with GCS Data

### Prerequisites

Install Google Cloud CLI if not already:
```bash
# macOS
brew install google-cloud-sdk

# Then authenticate
gcloud auth login
gcloud config set project gen-lang-client-0869694595
```

### List All Sessions

```bash
# List all session folders
gsutil ls gs://claritypledge-ml-training/sessions/

# Example output:
# gs://claritypledge-ml-training/sessions/ABC123/
# gs://claritypledge-ml-training/sessions/XYZ789/
```

### List Files in a Session

```bash
gsutil ls gs://claritypledge-ml-training/sessions/ABC123/

# Example output:
# gs://claritypledge-ml-training/sessions/ABC123/slava.webm
# gs://claritypledge-ml-training/sessions/ABC123/guest.webm
# gs://claritypledge-ml-training/sessions/ABC123/events.json
```

### Download Audio Recordings

```bash
# Download single file
gsutil cp gs://claritypledge-ml-training/sessions/ABC123/slava.webm ./

# Download entire session
gsutil -m cp -r gs://claritypledge-ml-training/sessions/ABC123/ ./ABC123/

# Download all sessions
gsutil -m cp -r gs://claritypledge-ml-training/sessions/ ./all-sessions/
```

### View Events JSON

```bash
# View in terminal
gsutil cat gs://claritypledge-ml-training/sessions/ABC123/events.json

# Download and view
gsutil cp gs://claritypledge-ml-training/sessions/ABC123/events.json ./
cat events.json | jq .  # Pretty print with jq
```

### Events JSON Structure

```json
{
  "sessionCode": "ABC123",
  "capturedAt": "2026-01-04T15:30:00.000Z",
  "sessionStartedAt": 1704383400000,
  "sessionEndedAt": 1704384000000,
  "durationMs": 600000,
  "participants": [
    { "name": "Slava", "role": "creator" },
    { "name": "Guest", "role": "joiner" }
  ],
  "events": [
    {
      "type": "live_rating_submitted",
      "timestamp": 45000,
      "properties": { "rating": 7, "role": "checker" }
    },
    {
      "type": "live_explain_back_done",
      "timestamp": 120000,
      "properties": { "round": 1 }
    }
  ]
}
```

**Note:** `timestamp` values are milliseconds from session start - use them to align with audio.

### Count Sessions

```bash
# Count total sessions
gsutil ls gs://claritypledge-ml-training/sessions/ | wc -l

# Count total files
gsutil ls -r gs://claritypledge-ml-training/sessions/** | wc -l
```

### Delete a Session (if needed)

```bash
# Delete single session
gsutil -m rm -r gs://claritypledge-ml-training/sessions/ABC123/
```

## Chunked Recordings

For reliability, audio is uploaded in 30-second chunks. This ensures we capture data even if users close their browser without clicking "Exit".

### Chunk File Naming

```
gs://claritypledge-ml-training/sessions/{session_code}/
├── slava_chunk_000.webm    # First 30 seconds
├── slava_chunk_001.webm    # 30-60 seconds
├── slava_chunk_002.webm    # 60-90 seconds
├── guest_chunk_000.webm    # Partner's chunks
├── guest_chunk_001.webm
└── events.json
```

### Stitching Chunks with FFmpeg

To combine chunks into a single file for analysis:

```bash
# Download all chunks for a user
gsutil cp "gs://claritypledge-ml-training/sessions/ABC123/slava_chunk_*.webm" ./chunks/

# Create a file list for FFmpeg
ls -1 ./chunks/slava_chunk_*.webm | sort -V | while read f; do
  echo "file '$f'"
done > chunks.txt

# Concatenate into single file
ffmpeg -f concat -safe 0 -i chunks.txt -c copy slava_full.webm

# Or as a one-liner:
ls -1 ./chunks/slava_chunk_*.webm | sort -V | \
  sed "s/^/file '/;s/$/'/" > chunks.txt && \
  ffmpeg -f concat -safe 0 -i chunks.txt -c copy slava_full.webm
```

### Batch Stitching Script

```bash
#!/bin/bash
# stitch-session.sh - Stitch all chunks for a session

SESSION_CODE=$1
OUTPUT_DIR=${2:-.}

if [ -z "$SESSION_CODE" ]; then
  echo "Usage: ./stitch-session.sh SESSION_CODE [OUTPUT_DIR]"
  exit 1
fi

# Download session
TEMP_DIR=$(mktemp -d)
gsutil -m cp -r "gs://claritypledge-ml-training/sessions/$SESSION_CODE/" "$TEMP_DIR/"

# Find all unique users (extract name from chunk files)
USERS=$(ls "$TEMP_DIR/$SESSION_CODE/"*_chunk_*.webm 2>/dev/null | \
  sed 's/.*\/\([^_]*\)_chunk_.*/\1/' | sort -u)

for USER in $USERS; do
  echo "Stitching chunks for: $USER"

  # Create file list
  ls -1 "$TEMP_DIR/$SESSION_CODE/${USER}_chunk_"*.webm | sort -V | \
    sed "s/^/file '/;s/$/'/" > "$TEMP_DIR/chunks_$USER.txt"

  # Concatenate
  ffmpeg -f concat -safe 0 -i "$TEMP_DIR/chunks_$USER.txt" \
    -c copy "$OUTPUT_DIR/${SESSION_CODE}_${USER}.webm" -y -loglevel warning

  echo "  -> $OUTPUT_DIR/${SESSION_CODE}_${USER}.webm"
done

# Copy events.json
cp "$TEMP_DIR/$SESSION_CODE/events.json" "$OUTPUT_DIR/${SESSION_CODE}_events.json" 2>/dev/null

# Cleanup
rm -rf "$TEMP_DIR"
echo "Done!"
```

## Verification

To verify the setup is working:

1. Start a live session between two users at http://localhost:5200/live
2. Complete at least one understanding check round
3. Exit the session (click Exit button)
4. Check:
   ```bash
   gsutil ls gs://claritypledge-ml-training/sessions/
   ```

## Monitoring (Supabase)

The Supabase table tracks uploads for easy querying:

```sql
-- Count total sessions captured
SELECT COUNT(DISTINCT session_code) as sessions,
       COUNT(*) as recordings
FROM ml_training_sessions;

-- Recent captures
SELECT session_code, user_name, duration_ms, created_at
FROM ml_training_sessions
ORDER BY created_at DESC
LIMIT 10;

-- Average session duration
SELECT AVG(duration_ms) / 1000 / 60 as avg_minutes
FROM ml_training_sessions;
```

## Troubleshooting

### Audio Upload Fails
- Check browser console for `[ML Upload]` logs
- Verify Cloud Function is running: `gcloud functions describe gcs-signed-url --region=us-central1`
- Check Cloud Function logs: `gcloud functions logs read gcs-signed-url --region=us-central1`

### Events Not Captured
- The first user to exit uploads events.json
- If both exit simultaneously, one should succeed
- Check for `[EventsCollector]` logs in console

### Signed URL Fails
- Check CORS headers in Cloud Function response
- Verify bucket exists: `gsutil ls gs://claritypledge-ml-training/`

### Table Insert Fails
- Verify RLS policies allow INSERT
- Check that session_code and user_name are not null
