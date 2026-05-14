---
status: all-done
type: bug
rank: 1000757.6
severity: high
workstream: C1
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags:
  - cors
  - gcs
  - upload
  - infrastructure
  - regression
delivery_stage: fix
pipeline_ran:
  - create-bug
  - reproduce
  - fix
reproduce_artifact:
  canary_script: scripts/canary-gcs-cors-preflight.sh
  root_cause: >-
    GCS CORS handler does NOT expand the `x-goog-*` glob in responseHeader
    during preflight; the bucket must list `x-goog-content-length-range`
    explicitly, the same way `claritypledge-story-images` already does.
  confidence: high
  surfaces_in_scope:
    - ml-training-bucket-cors
  surfaces_not_affected:
    - >-
      claritypledge-story-images — already correctly configured with explicit
      `x-goog-content-length-range` (verified 2026-04-24 via curl preflight)
  reproduced_at: '2026-04-24'
locked_at: '2026-05-12T10:01:36.992Z'
---

# P807: GCS bucket CORS `x-goog-*` wildcard does not match `x-goog-content-length-range` in preflights

## Summary

Every browser PUT to `gs://claritypledge-ml-training/` has been blocked by a failed CORS preflight since audio uploads started sending `x-goog-content-length-range` (on Mar 22, when the GCS signer began requiring it). The bucket CORS config uses an `x-goog-*` wildcard in `responseHeader`, but GCS does not expand this wildcard to match the specific header in preflight responses. Third and final layer of the 33-day silent-upload incident (P802 → P805 → P807).

## Root Cause

Verified by direct curl today (2026-04-24):

**Test A — preflight WITHOUT `x-goog-content-length-range`:**
```
OPTIONS /claritypledge-ml-training/.../foo.webm
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type
Origin: https://claritypledge.com

→ HTTP/2 200
→ access-control-allow-origin: https://claritypledge.com
→ access-control-allow-methods: PUT,GET,HEAD,OPTIONS
→ access-control-allow-headers: Content-Type,Content-Length,Content-MD5,x-goog-*
```

**Test B — preflight WITH `x-goog-content-length-range`:**
```
OPTIONS (same path)
Access-Control-Request-Headers: x-goog-content-length-range

→ HTTP/2 200
→ (NO access-control-* headers — just vary: Origin)
```

The browser treats an absent `Access-Control-Allow-Headers` response as preflight failure and aborts the PUT without ever sending it. This is the CORS spec, not a bug.

**Current bucket CORS config** (`gsutil cors get gs://claritypledge-ml-training`):
```json
[{
  "maxAgeSeconds": 3600,
  "method": ["PUT", "GET", "HEAD", "OPTIONS"],
  "origin": ["http://localhost:5200", "http://localhost:5173",
             "https://claritypledge.com", "https://www.claritypledge.com"],
  "responseHeader": ["Content-Type", "Content-Length", "Content-MD5", "x-goog-*"]
}]
```

The `x-goog-*` glob is not interpreted as a pattern by GCS's CORS preflight handler — it would need to be an exact header name (case-insensitive) or the special wildcard `*`.

This bug was hidden for 33 days behind two upstream failures:
- Mar 22 → Apr 24 AM: `SignatureDoesNotMatch` (P802) caused upload failure BEFORE the browser sent a preflight with the header — bucket-level CORS was never exercised with this header from the browser
- Apr 4 → Apr 24 PM: CSP enforcement (P805) blocked the fetch entirely BEFORE the preflight attempt

Only after both upstream fixes landed could the browser actually make the preflight — and then this layer surfaced.

## Invariants

- **CORS on GCS must list every `x-goog-*` request header explicitly.** Glob wildcards like `x-goog-*` are accepted in `responseHeader` (no gsutil error) but GCS does NOT expand them in preflight responses. Any new signed-upload header must be added explicitly to the bucket's CORS config on the same day the signer starts requiring it.
- **Preflight audit is required when adding a signed-request header.** When `uploadToGCS()` adds a new request header, the implementing change MUST also update every bucket's CORS `responseHeader` list. Both buckets (`claritypledge-ml-training`, `claritypledge-story-images`, and any future bucket) must be audited together.

## Reproduction Steps

1. Verified user on `claritypledge.com/live`
2. Start a session with AI Insights **on** (`is_private: false`)
3. Run 1-2 rounds for ~60s to produce events + chunks
4. End session
5. Open DevTools Network tab, filter on `storage.googleapis.com`
6. Observe: red (failed) PUT rows for `*_chunk_NNN.webm` and `*_events_NNN.json` with "Provisional headers are shown" + "Failed to load response data"

**Server-side reproduction (curl):**
```bash
curl -X OPTIONS 'https://storage.googleapis.com/claritypledge-ml-training/sessions/TEST/foo.webm' \
  -H 'Origin: https://claritypledge.com' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: x-goog-content-length-range' \
  -i | grep -i access-control
# expected AFTER fix: access-control-allow-headers includes x-goog-content-length-range
# actual BEFORE fix: no access-control-* headers at all
```

**Reproduction rate:** 100% (any PUT with `x-goog-content-length-range` header against this bucket today)

## Expected Behavior

Browser's CORS preflight to GCS returns `Access-Control-Allow-Headers` that includes `x-goog-content-length-range`. Browser then sends the PUT. File lands in bucket. `ml_training_sessions` row created.

## Actual Behavior

CORS preflight returns 200 with no `Access-Control-*` headers. Browser blocks the PUT silently. Network tab shows failed PUT with "Provisional headers are shown". Bucket stays empty. `ml_training_sessions` row is never created.

## Affected Files

- `gs://claritypledge-ml-training/` — **CORS config needs update** (no code change; infra change via `gsutil cors set`)
- `gs://claritypledge-story-images/` — **NOT affected.** Verified 2026-04-24 via curl preflight: bucket already returns `access-control-allow-headers: Content-Type,Content-Length,x-goog-content-length-range` (explicit listing, not a glob). `scripts/set-gcs-cors.sh` + `scripts/gcs-cors.json` already encode the correct config for this bucket.
- `src/app/data/api.ts:2857-2862` — `uploadToGCS` sends the header (correct code, blocked by bucket CORS)
- `src/app/data/story-image-service.ts:74-82` — `uploadStoryImage` sends the header (same)
- `scripts/canary-gcs-cors-preflight.sh` — **NEW** canary, added 2026-04-24 during `/reproduce`. Fails today against the broken `ml-training` bucket; must pass after fix.

No application code changes required. This is pure infra.

## Severity

**High** — same incident as P802/P805. 33 days of silent audio upload failure for every non-private `/live` session. No user-visible error (UI stalls indefinitely or claims "recording" while nothing reaches GCS).

## Fix Approach

Single `gsutil cors set` command per affected bucket. Update `responseHeader` to list every `x-goog-*` header we actually send — drop the non-working `x-goog-*` glob.

**Minimal change (just the broken header):**
```json
{
  "responseHeader": ["Content-Type", "Content-Length", "Content-MD5",
                     "x-goog-content-length-range", "x-goog-*"]
}
```

**Recommended (explicit list, future-proof):**
```json
{
  "responseHeader": ["Content-Type", "Content-Length", "Content-MD5",
                     "x-goog-content-length-range", "x-goog-resumable",
                     "x-goog-meta-*"]
}
```

Apply with:
```bash
echo '[...config...]' > /tmp/cors.json
gsutil cors set /tmp/cors.json gs://claritypledge-ml-training
# then verify:
curl -X OPTIONS 'https://storage.googleapis.com/claritypledge-ml-training/foo.webm' \
  -H 'Origin: https://claritypledge.com' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: x-goog-content-length-range' \
  -i | grep -i access-control
```

Apply the same change to `gs://claritypledge-story-images/` if the curl test confirms it has the same gap.

**Canary:** a shell script committed to `scripts/` (or an e2e test that shells out) that runs the curl preflight against each bucket and asserts `x-goog-content-length-range` is echoed in `Access-Control-Allow-Headers`. Fails before fix, passes after. Naming: `scripts/canary-gcs-cors-preflight.sh`.

**Surface spread check:** grep for every header appended in `uploadToGCS` or `uploadStoryImage` and ensure each is in the bucket's CORS responseHeader list.

**Meta-follow-up for `/kdd`:** the matryoshka (P802 → P805 → P807) cost 33 days because each outer bug hid the next. Standard checklist from now on when a signer adds a required request header:
1. Update every `uploadToGCS`-style PUT caller to send the header (P802-class)
2. Audit CSP `connect-src` for the upload destination (P805-class)
3. Audit every bucket's CORS `responseHeader` for the new header (P807-class)

## Acceptance Criteria

- [x] Canary script `scripts/canary-gcs-cors-preflight.sh` exists and fails against the broken bucket (verified 2026-04-24 during `/reproduce`, exit code 1, failing bucket = `claritypledge-ml-training`)
- [x] `gs://claritypledge-story-images/` confirmed NOT affected (preflight already echoes `x-goog-content-length-range`; see `scripts/gcs-cors.json`)
- [x] `curl -X OPTIONS` preflight to `gs://claritypledge-ml-training/` with `Access-Control-Request-Headers: x-goog-content-length-range` returns a response that includes `x-goog-content-length-range` in `access-control-allow-headers` (verified 2026-04-24 via canary)
- [x] `gsutil cors get gs://claritypledge-ml-training` output contains `x-goog-content-length-range` in `responseHeader` (verified 2026-04-24 post-apply)
- [x] Canary `scripts/canary-gcs-cors-preflight.sh` exits 0 (both buckets green) after fix is applied (verified 2026-04-24)
- [ ] [post-deploy] Run one non-private `/live` session on prod — chunks appear in `gs://claritypledge-ml-training/sessions/<new-code>/` within 60s of session end
- [ ] [post-deploy] `ml_training_sessions` row exists for the new session with `chunk_count` > 0 matching the file count in the bucket
- [ ] [post-deploy] DevTools Network tab shows green (200) PUTs to `storage.googleapis.com` during a fresh session — no red rows, no CORS errors in Console
