# ML Training Data Capture - Supabase Setup

This document describes the manual Supabase configuration required for P28.1 Audio + Event Data Capture.

## Overview

The ML training data capture feature records audio and behavioral events during live sessions. This data is used to validate whether voice/audio patterns correlate with understanding gaps.

## Required Supabase Configuration

### 1. Create Storage Bucket

Create a private storage bucket for ML training data:

1. Go to Supabase Dashboard > Storage
2. Click "New bucket"
3. Configure:
   - **Name:** `ml-training`
   - **Public:** No (private bucket)
   - **File size limit:** 100MB (enough for ~30 min audio)
   - **Allowed MIME types:** Leave empty (allow all)

### 2. Create Database Table

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

-- RLS Policy: Allow authenticated users to insert their own recordings
ALTER TABLE ml_training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert ML training sessions"
  ON ml_training_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view ML training sessions"
  ON ml_training_sessions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
```

### 3. Configure Storage Policies

Run this SQL to allow authenticated users to upload to the storage bucket:

```sql
-- Allow authenticated users to upload to ml-training bucket
CREATE POLICY "Allow authenticated uploads to ml-training"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ml-training'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their uploads (for upsert)
CREATE POLICY "Allow authenticated updates to ml-training"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'ml-training'
    AND auth.role() = 'authenticated'
  );

-- Allow reading from ml-training for checking if events.json exists
CREATE POLICY "Allow authenticated reads from ml-training"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ml-training'
    AND auth.role() = 'authenticated'
  );
```

## Data Structure

After configuration, data will be organized as:

```
storage/ml-training/
└── ml-training-sessions/
    └── {session_code}/
        ├── {user1-name}.webm   # Audio from user 1
        ├── {user2-name}.webm   # Audio from user 2 (partner)
        └── events.json          # Behavioral events snapshot
```

## Verification

To verify the setup is working:

1. Start a live session between two users
2. Complete at least one understanding check round
3. Exit the session
4. Check Supabase:
   - **Storage:** Look for `ml-training/ml-training-sessions/{code}/` folder
   - **Database:** Query `SELECT * FROM ml_training_sessions ORDER BY created_at DESC LIMIT 5;`

## Monitoring

Monitor data collection progress:

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
- Verify storage bucket exists and policies are correct
- Ensure user is authenticated

### Events Not Captured
- The first user to exit uploads events.json
- If both exit simultaneously, one should succeed
- Check for `[EventsCollector]` logs in console

### Table Insert Fails
- Verify RLS policies allow INSERT
- Check that session_code and user_name are not null
