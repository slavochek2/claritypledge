---
status: in-progress
type: bug
rank: 1000757.5
severity: high
workstream: C1
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [csp, security, upload, gcs, regression]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p805-csp-connect-src-gcs.test.ts
  root_cause: "vercel.json:104 CSP connect-src directive missing https://storage.googleapis.com; c64dfd81 (Apr 4) flipped CSP from Report-Only to enforce without outbound-fetch allow-list audit"
  confidence: high
  surfaces_in_scope: [uploadToGCS-api.ts, uploadStoryImage-story-image-service.ts]
  surfaces_deferred: []
  reproduced_at: '2026-04-24'
---

# P805: CSP `connect-src` missing `storage.googleapis.com` blocks every browser PUT to GCS

## Summary

Since April 4 (`c64dfd81` promoted CSP from Report-Only to enforce), every browser-originated `fetch()` PUT to `https://storage.googleapis.com` is blocked by CSP before leaving the browser. Audio chunks, events snapshots, and browser-path story image uploads all silently fail. Sibling of P802 — P802 fixed the signature header, exposing this previously-masked second bug.

## Root Cause

`vercel.json:104` defines the enforcing CSP. The `connect-src` directive lists `'self'`, `*.supabase.co`, `wss://*.supabase.co`, `api-eu.mixpanel.com`, `*.sentry.io`, `*.lr-in-prod.com`, `api.web3forms.com`, `api.unsplash.com` — **and does not include `https://storage.googleapis.com`**. `img-src` does include it, which is why image *display* continues to work while image/audio *uploads* via `fetch()` are blocked pre-network.

Commit `c64dfd81` (Apr 4) flipped the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, converting logged violations into hard blocks. The `connect-src` directive was not audited against the app's outbound-fetch destinations at that time. Before the flip, PUTs reached GCS and (once P802 header issue is accounted for) uploads worked for the March 14–22 window.

Masking chain:
- Pre Mar 22: uploads succeeded
- Mar 22 → Apr 4: Cloud Function added `x-goog-content-length-range` signature requirement → `SignatureDoesNotMatch` → chunks fail at GCS response (P802 root cause)
- Apr 4 → Apr 24: CSP enforced → PUT blocked at browser pre-send. But P802 bug was still the effective first failure, so CSP block went unnoticed
- Apr 24: P802 shipped → signature fixed → CSP block is now the sole, load-bearing blocker

Server-side / script uploads (e.g., `/story-to-image` skill running outside browser) continue to succeed, which is why `gs://claritypledge-story-images/` has uploads from Apr 18 and Apr 21. That path bypasses browser CSP entirely.

## Reproduction Steps

1. Sign in as any verified user on `claritypledge.com`
2. Start a `/live` session with AI Insights **on** (`is_private: false`)
3. Run a round, end the session
4. On the "Session ended" screen, open DevTools → Console
5. Observe: progress bar stuck at 0% "Uploading chunk 1 of N"
6. Observe console error: `Refused to connect to 'https://storage.googleapis.com/claritypledge-ml-training/...' because it violates the document's Content Security Policy.`

**Reproduction rate:** 100% (post-P802 deploy, any non-private session on prod)

## Expected Behavior

Browser sends PUT to `storage.googleapis.com`, GCS accepts it (signature correct after P802), progress bar advances 1/N → N/N, `ml_training_sessions` row reflects uploaded chunks, session eventually appears in Session History after transcription completes.

## Actual Behavior

PUT never leaves the browser. Progress bar pinned at 0%. Chunks remain in IndexedDB until the queue's 10-attempt retry budget is exhausted. Session row exists in `clarity_sessions` but no files land in `gs://claritypledge-ml-training/`. Transcription stays `pending`. Session does not appear in Session History (filter requires `roundCount > 0 || transcriptStatus === 'completed'`).

## Affected Files

- `vercel.json` line 104 — `connect-src` directive missing `https://storage.googleapis.com`
- `src/app/data/api.ts:2857-2862` — `uploadToGCS()` PUT target (no code change needed; CSP is the blocker)
- `src/app/data/story-image-service.ts:74-82` — `uploadStoryImage()` PUT target (browser path — also affected, though server-side /story-to-image bypasses)
- No app-code changes; single-config-file fix

## Severity

**High** — a major data-collection feature (ML training audio + events for all non-private sessions) has been silently broken for every browser user since Apr 4. No user-visible error (the UI stalls indefinitely but doesn't crash). Scope is all `/live` sessions; no workaround for users.

## Fix Approach

Single-line change: add `https://storage.googleapis.com` to the `connect-src` directive in `vercel.json:104`. **Exact position:** between `wss://*.supabase.co` and `https://api-eu.mixpanel.com`.

Before:
```
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api-eu.mixpanel.com https://*.sentry.io https://*.lr-in-prod.com https://api.web3forms.com https://api.unsplash.com
```

After:
```
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://storage.googleapis.com https://api-eu.mixpanel.com https://*.sentry.io https://*.lr-in-prod.com https://api.web3forms.com https://api.unsplash.com
```

### Fix Steps (mandatory — do all in a single commit)

1. **Edit `vercel.json:104`** — insert `https://storage.googleapis.com ` (with trailing space) between `wss://*.supabase.co ` and `https://api-eu.mixpanel.com` in the `/(.*)` route's `Content-Security-Policy` header. Do not touch the `/point/(.*)` or `/story/(.*)` routes (those are out of scope).
2. **Remove `.fails()` marker from canary** — `src/tests/p805-csp-connect-src-gcs.test.ts` line 62: change `it.fails(` back to `it(`. Also delete the 6-line comment block immediately above that line (`// /fix p805: remove \`.fails\` when the bug is fixed ...`) — that comment exists only to guide this step; keeping it after the fix is stale context.
3. **Run the full test suite** — `npm test -- --run`. All 4 P805 assertions must pass, including the one that was previously `.fails()`. If Vitest flags a `.fails` modifier false-positive, step 2 was missed.
4. **Commit with explicit file paths** — `git add vercel.json src/tests/p805-csp-connect-src-gcs.test.ts` then `git commit -- vercel.json src/tests/p805-csp-connect-src-gcs.test.ts`. Parallel Claude sessions may be mutating the working tree; do not stage bystander files. Do not commit any other file.

Risk: we already trust `storage.googleapis.com` for `img-src`. Extending that trust to `connect-src` is the same domain of trust — does not meaningfully widen attack surface.

Canary test: parse `vercel.json` in a Vitest unit test, assert the enforcing CSP string contains `storage.googleapis.com` within the `connect-src` directive. Fails before fix (wrapped in `.fails()`), passes after (with `.fails()` removed).

Meta-follow-up for `/kdd`: the pattern "security posture change without outbound-fetch allow-list audit" caused BOTH the Mar 22 Cloud Function break (added signature header) and the Apr 4 CSP enforce flip. Worth a standing checklist: before flipping any CSP directive from Report-Only to enforce, grep all `fetch(` calls in the app for non-`self` destinations and verify each is in the policy.

## Acceptance Criteria

- [ ] Browser successfully PUTs audio chunks to `storage.googleapis.com` — verified by a new session's chunks appearing in `gs://claritypledge-ml-training/sessions/<code>/` within 60s of session end
- [ ] DevTools Console shows zero CSP violations during a `/live` session end
- [ ] `ml_training_sessions` row created with `chunk_count` matching the actual file count in the bucket
- [ ] Completed session appears in Session History after transcription completes
- [ ] Browser-path story image upload (create a story with an image attachment in `/create-story`) succeeds without CSP violation
- [x] Unit canary: test file parses `vercel.json` and asserts `connect-src` directive contains `storage.googleapis.com`
- [x] No regression on any other `connect-src` destination (existing entries remain unchanged)
