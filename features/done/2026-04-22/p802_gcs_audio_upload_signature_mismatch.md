---
status: all-done
type: bug
rank: 1000754.5
severity: critical
workstream: live
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [live, recording, gcs, upload]
pipeline_ran: [create-bug, fix, ship]
root_cause: uploadToGCS() PUT missing x-goog-content-length-range header — Cloud Function signs URLs with it, GCS rejects without it
date_resolved: '2026-04-24'
completed_at: 2026-04-24
---

# P802: GCS audio upload fails with SignatureDoesNotMatch — chunks stuck at 0% since 2026-03-22

## Summary

Every `/live` session's audio chunks (and events JSON) fail to upload to GCS with a `SignatureDoesNotMatch` error. The Cloud Function signs PUT URLs *with* `x-goog-content-length-range`, but `uploadToGCS()` sends the PUT without that header. GCS rejects every attempt. The silent `withRetry` loop stalls for ~7 s then fails without surfacing an error to the user. Result: 33 days of zero audio reaching GCS, all sessions missing from Session History.

## Root Cause

`uploadToGCS()` in `src/app/data/api.ts` sends the GCS signed-URL PUT with only `Content-Type` in the request headers. The Cloud Function that issues the signed URL includes `x-goog-content-length-range: 1,5242880` in the signing parameters, so GCS validates that the PUT carries that header. It doesn't — GCS returns 403 `SignatureDoesNotMatch`. `withRetry` treats this as a transient failure, loops 3×, then discards the error silently.

The identical bug was fixed for story images in commit `bee33fba` (2026-03-28) by adding `'x-goog-content-length-range': '1,5242880'` to `src/app/data/story-image-service.ts:74-82`. The audio upload path was not updated.

## Invariants

- The `x-goog-content-length-range` header value **must exactly match** the value the Cloud Function used when signing the URL. Currently confirmed as `'1,5242880'` (5 MB ceiling) for both story images and audio. Any other value will produce a new `SignatureDoesNotMatch`.
- `withRetry` must **not** retry 403 `SignatureDoesNotMatch` responses — they are deterministic rejections, not transient failures.

## Reproduction Steps

1. Log in as a verified user on `claritypledge.com`
2. Start a non-private `/live` session with two participants
3. Complete ≥1 round (~30 s of audio)
4. End the session
5. Observe the post-session screen: "Uploading chunk 1 of N" stays at 0% for ~7–21 s, then disappears without confirmation
6. Open Session History on the profile page — the completed session is absent

**Reproduction rate:** 100% (all non-private /live sessions since 2026-03-22)

**Supporting evidence:**
- GCS bucket `gs://claritypledge-ml-training/sessions/` — 51 session folders, newest mtime `2026-03-22T11:49Z` (session `K6RAC5`)
- Cloud Function logs confirm signed URLs are still being issued today (sessions `N7SEGG`, `JT72AD`, `Z4F5FC`) — signer is healthy
- CORS allows PUT from `https://claritypledge.com` — not a CORS issue

## Expected Behavior

After session ends, chunks upload successfully to GCS, `transcription_jobs` row is created, and within 1–3 min the session appears in Session History.

## Actual Behavior

Upload progress hangs at 0% for ~7 s (three `withRetry` attempts, each returning GCS 403 `SignatureDoesNotMatch`), then silently fails. No error toast is shown. `transcription_jobs` row is never created. Session is permanently missing from Session History.

## Affected Files

- `src/app/data/api.ts` lines ~2857–2880 — `uploadToGCS()` PUT headers missing `x-goog-content-length-range`
- `src/app/data/api.ts` lines ~2760–2794 — `withRetry` does not classify 403 `SignatureDoesNotMatch` as non-retryable

## Severity

**Critical** — core feature (session recording + transcription + Session History) has been completely non-functional for 33 days for all non-private /live sessions.

## Fix Approach

**Change 1 — add header to `uploadToGCS()`:**
Add `'x-goog-content-length-range': '1,5242880'` to the PUT request headers inside `uploadToGCS()`. This mirrors the fix in `src/app/data/story-image-service.ts:74-82` (commit `bee33fba`), which uses the same Cloud Function signer.

**Change 2 — harden `withRetry` for `SignatureDoesNotMatch`:**
In the error path of `withRetry` (or `uploadToGCS`'s catch block), detect 403 responses whose body contains `SignatureDoesNotMatch` and throw a non-retryable error immediately. This prevents the 7-second stall pattern from masking future signature bugs.

**Canary test:**
Vitest unit test in `src/tests/p802-gcs-upload-header.test.ts` — mocks `fetch`, calls `uploadToGCS()`, asserts the PUT request includes `x-goog-content-length-range: '1,5242880'`. Must fail pre-fix, pass post-fix.

Reference: `src/tests/chunkUploadQueue.test.ts` for `vi.fn()` fetch-mock pattern.

## Acceptance Criteria

- [x] Canary test `src/tests/p802-gcs-upload-header.test.ts` fails before the fix and passes after
- [x] `uploadToGCS()` PUT request includes header `x-goog-content-length-range: '1,5242880'` (verified by canary test via both `uploadAudioChunk` and `uploadSingleChunk` entry points)
- [x] `chunkUploadQueue.test.ts` still passes (no regression)
- [x] 403 `SignatureDoesNotMatch` responses do not trigger retries in `withRetry` (non-retryable error thrown immediately)

## Post-deploy Verification (run after `/ship`)

Steps — run one live `/live` session (~90 s, ≥3 rounds) on `claritypledge.com`:

```bash
# 1. Confirm chunks landed in GCS (within 60 s of session end)
gsutil ls "gs://claritypledge-ml-training/sessions/<new-code>/"
# expect: *_chunk_000.webm ... *_chunk_N.webm + events.json

# 2. Confirm DB row
PROD_KEY=$(grep PROD_SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/ml_training_sessions?session_code=eq.<new-code>&select=*" \
  -H "apikey: $PROD_KEY" -H "Authorization: Bearer $PROD_KEY"
# expect: row with chunk_count matching files above
```

- [ ] Chunks appear in GCS bucket within 60 s
- [ ] `ml_training_sessions` row has correct `chunk_count`
- [ ] Session History shows the completed session after transcription (~1–3 min)
- [ ] Sentry shows zero `SignatureDoesNotMatch` errors under `ml_training` tag in the hour after deploy
