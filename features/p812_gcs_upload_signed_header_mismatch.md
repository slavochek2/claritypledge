---
status: week
type: bug
rank: 1000799.0
severity: critical
workstream: C1
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [gcs, upload, ml-training, signer, regression, matryoshka]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P812: GCS rejects PUT with MalformedSecurityHeader on x-goog-content-length-range

## Summary

Every browser PUT to `gs://claritypledge-ml-training/` fails with HTTP 400 `MalformedSecurityHeader` because the client sends `x-goog-content-length-range: 1,5242880` (P802 fix) but the GCP Cloud Function signer does NOT include that header in its signed canonical request. GCS rejects any unsigned header on a signed-URL PUT. Fourth and final layer of the 33-day silent-upload incident (P802 → P805 → P807 → P812).

## Root Cause

Direct probe today (2026-04-24) using the PROD test agent against the same prod edge function and bucket:

**Probe A — PUT WITH `x-goog-content-length-range: 1,5242880` (current client behavior post-P802):**
```
PUT https://storage.googleapis.com/claritypledge-ml-training/sessions/P809CA/_dev_canary_chunk_000.webm
Content-Type: audio/webm;codecs=opus
x-goog-content-length-range: 1,5242880
body: 100 bytes

→ HTTP 400 Bad Request
→ body:
  <?xml version='1.0' encoding='UTF-8'?>
  <Error>
    <Code>MalformedSecurityHeader</Code>
    <Message>Invalid argument.</Message>
    <Details>Your request has a malformed header. Header must be signed.</Details>
    <ParameterName>x-goog-content-length-range</ParameterName>
  </Error>
```

**Probe B — same PUT WITHOUT that header:**
```
PUT (same URL, same body)
Content-Type: audio/webm;codecs=opus
(no x-goog-content-length-range)

→ HTTP 200 OK
```

The GCP Cloud Function signing ml-training URLs (`https://us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url`) constructs a canonical request that omits `x-goog-content-length-range`. GCS's contract is: any non-CanonicalHeaders header included in the request that appears to be a security-controlled `x-goog-*` header must be listed in `SignedHeaders` in the canonical request, or the server returns `MalformedSecurityHeader`.

**Why P802 was wrong in a subtle way:** P802 fixed the client to add `x-goog-content-length-range` because a different class of failure (`SignatureDoesNotMatch`) was occurring. That previous signer behavior is not current; today the signer omits the header from the canonical. The P802 fix, shipped in good faith, silently inverted the failure from "signature doesn't match" to "header not signed" — both are 4xx from GCS but with different error codes. The fix should have been on the signer side (include the header in canonical), not the client.

**Why story-images is not affected:** Story-images uploads go through a DIFFERENT signer — `generate-story-image-url`, a Supabase edge function that signs V4 URLs in-process using Deno crypto and explicitly includes `x-goog-content-length-range` in the canonical request (see `supabase/functions/generate-story-image-url/index.ts`). The two signers are independent implementations; the ml-training GCP Cloud Function is outside this repo.

**Why it took 33 days to surface:** This bug was hidden behind three earlier layers:
- Mar 22 → Apr 24 AM: `SignatureDoesNotMatch` (P802) caused the PUT to fail with a DIFFERENT 4xx before this rejection path was exercised
- Apr 4 → Apr 24 PM: CSP (P805) blocked the fetch entirely BEFORE the browser tried the PUT
- Apr 24 AM: CORS preflight (P807) rejected the browser preflight BEFORE the PUT was sent

Only after P807 shipped did the browser actually reach GCS with the PUT — and then this layer surfaced.

## Invariants

- **Any `x-goog-*` header in the client PUT MUST be included in the signer's canonical request.** GCS rejects unsigned security-controlled headers. The client and signer are a contract: they must agree on the SignedHeaders list.
- **When two buckets share a product surface, audit both signers.** ml-training and story-images use different signer implementations. Changes that touch upload headers must be verified against every signer.
- **Before adding a client-side upload header, verify via direct probe that the signer signs it.** The probe pattern: one script that sends the header, one that omits it — compare responses. See `scripts/probe-gcs-upload.mjs` and `scripts/probe-gcs-upload-no-header.mjs`.

## Reproduction Steps

1. Authenticate as any prod user via `/live`
2. Start a non-private session (AI Insights on), run for ~60 s, end session
3. Open DevTools Network, filter `storage.googleapis.com`
4. Observe: red PUTs with status 400. Response body is hidden by Chrome as "Provisional headers are shown" but the server IS returning the error body.

**Direct server-side reproduction (no browser needed):**
```bash
node scripts/probe-gcs-upload.mjs
# Exit code 2, body includes <Code>MalformedSecurityHeader</Code>
node scripts/probe-gcs-upload-no-header.mjs
# Exit code 0, status 200
```

**Reproduction rate:** 100% (any PUT with the header against ml-training bucket)

## Expected Behavior

Browser PUT to GCS returns 200 OK. Chunks land in `gs://claritypledge-ml-training/sessions/<code>/`. `ml_training_sessions` row created with `chunk_count > 0`.

## Actual Behavior

Browser PUT returns 400 with `MalformedSecurityHeader`. Chunks lost. `ml_training_sessions` row never created. "Uploading chunk 1 of N" stuck at 0% in the UI.

## Affected Files

- `src/app/data/api.ts:2866` — `uploadToGCS` sends `'x-goog-content-length-range': '1,5242880'` — **this is the line to remove**
- `scripts/probe-gcs-upload.mjs` — reproduces the bug (exit 2)
- `scripts/probe-gcs-upload-no-header.mjs` — proves the fix (exit 0)
- **NOT affected:** `src/app/data/story-image-service.ts:74-82` — uses `generate-story-image-url` signer which correctly signs the header. Leave it alone.

## Severity

**Critical** — same incident as P802/P805/P807. 33 days of silent audio upload failure for every non-private `/live` session on prod. No user-visible error.

## Fix Approach

**One-line change:** remove `'x-goog-content-length-range': '1,5242880',` from the headers object in `uploadToGCS` (`src/app/data/api.ts:2866`).

**Why not fix the Cloud Function instead:** The Cloud Function is an external GCP resource outside this repo. Modifying it requires GCP access + deployment out of band. The client-side removal is one line, achieves the same user-visible outcome (chunks land in bucket), and the 5 MB bucket-side range guard is not load-bearing (chunks are 30 s of audio ≈ <1 MB; runaway multi-MB uploads are blocked upstream by the 30-s chunk cadence).

**Why not port ml-training to a Supabase edge function signer (like story-images):** Long-term the right thing, but it's a bigger refactor. File that as a follow-up task. The incident needs to close today.

**Canary:** `scripts/probe-gcs-upload.mjs` and `scripts/probe-gcs-upload-no-header.mjs` are already written. Post-fix, both should still behave as named (probe-with-header fails, probe-without-header succeeds — because the probes hit prod directly with explicit headers regardless of the client code). For a per-line regression guard in the codebase, add a source-read test asserting the header is NOT in `uploadToGCS`.

**Matryoshka checklist from now on (P802/P805/P807/P812 combined lesson):** when a signer adds or changes a required signed header:
1. Audit every client PUT caller's headers (P802-class)
2. Audit CSP `connect-src` for the upload destination (P805-class)
3. Audit every bucket's CORS `responseHeader` for the new header (P807-class)
4. **Probe the signer directly with exact PUT headers to verify SignedHeaders contract (P812-class)**

## Acceptance Criteria

- [x] `scripts/probe-gcs-upload.mjs` exists and reproduces the bug (exit 2, MalformedSecurityHeader in body) — verified 2026-04-24
- [x] `scripts/probe-gcs-upload-no-header.mjs` exists and proves the fix approach (exit 0, status 200) — verified 2026-04-24
- [ ] `uploadToGCS` in `src/app/data/api.ts` no longer sends `x-goog-content-length-range`
- [ ] Source-read canary test asserts the header is absent from `uploadToGCS`
- [ ] Full test suite passes with zero regressions (2028/2028 or current baseline)
- [ ] [post-deploy] Run one non-private `/live` session on prod — chunks appear in `gs://claritypledge-ml-training/sessions/<new-code>/` within 60 s of session end
- [ ] [post-deploy] `ml_training_sessions` row exists for the new session with `chunk_count > 0`
- [ ] [post-deploy] DevTools Network tab shows green (200) PUTs to `storage.googleapis.com` during a fresh session — no 400s, no CORS errors
