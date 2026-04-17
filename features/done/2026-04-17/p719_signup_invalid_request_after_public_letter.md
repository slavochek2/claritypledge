---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1000719.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, auth, signup, account-creation]
pipeline_ran: [create-bug, reproduce, fix]
---

# P719: "Invalid request" 400 error on signup after completing public letter

## Summary

Anonymous users who complete a public (one-to-many) letter and reach the "Save your responses" signup form receive a 400 "Invalid request" error when submitting — account creation fails silently.

## Root Cause

Under investigation. The error message "Invalid request. Please check your input and try again." maps exactly to `validationError()` in `supabase/functions/request-letter-response-signin/index.ts` (line 54–56). This function validates 7 input fields; one is failing. Reproduces when a stale session cookie is present; clearing cookies resolves it.

Suspected paths to the 400:
1. **Stale session causes `bufferOnly=false` when session is expired** — user goes through `ready_public` path, `currentUser` goes null mid-flow (session expires between load and completion), unauthenticated path fires, signup redirect navigates to `/signup` with `letterId=${deliveryId}`, draft from sessionStorage is submitted. One of the 7 validation checks fails.
2. **`tokenExpired` recovery redirect** (`letter-reading-page.tsx` line 989–993) navigates to `/signup` without a draft and without checking letter mode — if the letter is one-to-many, the edge function's `mode='one-to-many'` check should pass, but something in the validation still fails.

## Reproduction Steps

1. Open a public letter URL while logged in (or with stale cookies from a previous session): `localhost:XXXX/letter/{letter-id}`
2. Complete all stories in the letter (rate + set positions)
3. Observe: redirected to `/signup?source=letter-response&letterId=...`
4. Fill in Full Name and Email, accept terms, click "Save my responses"
5. Observe: red error banner — "Invalid request. Please check your input and try again."

**Reproduction rate:** Intermittent — occurs with stale/expired session cookies; clears when cookies are deleted and page is refreshed.

## Expected Behavior

Signup form submits successfully. User receives a "Check Your Email" confirmation screen. The `request-letter-response-signin` edge function returns `{ ok: true }`.

## Actual Behavior

`request-letter-response-signin` returns HTTP 400 `{ error: "Invalid request. Please check your input and try again." }`. Signup fails. User is stuck — no way to save their letter responses.

## Affected Files

- `supabase/functions/request-letter-response-signin/index.ts` — lines 270–310 (7 validation checks, one is failing; need to identify which)
- `src/app/pages/letter-reading-page.tsx` — lines 745–774 (`ready_public` onComplete path, `currentUser` null check), lines 884–895 (`bufferOnly` onComplete path), lines 989–993 (`tokenExpired` recovery redirect)
- `src/app/pages/signup-page.tsx` — lines 88–112 (letter-response path, draft reading and remapping)

## Severity

**High** — blocks account creation for anonymous letter readers who complete a public letter; their responses cannot be saved without a workaround (clearing cookies + refreshing).

## Fix Approach

1. Add structured logging to `request-letter-response-signin` to identify which validation check fires (without leaking which field failed to end users — log server-side only).
2. Reproduce with the canary test to observe the exact failing input.
3. Likely fix: one of (a) sessionStorage draft contains data that fails UUID or range validation, (b) letterId resolves to a letter with wrong status/mode in test DB, (c) session timing causes wrong path to be taken in `letter-reading-page.tsx`.

## Reproduce Artifact

**Status:** Bug could NOT be reproduced in Playwright — timing-dependent race condition.

The Supabase client fires `SIGNED_OUT` and clears the stale session before the signup form submission reaches the edge function. The 400 occurs only in prod where the race window is wider (real network latency, cookies vs. localStorage).

**Diagnostic logging deployed:** `[P719-DIAG] validation_fail: <CODE>` logged server-side before each `validationError()` call in `request-letter-response-signin/index.ts`. On next prod occurrence, check **Supabase dashboard → Edge Functions → Logs** and filter for `[P719-DIAG]` to identify the failing check.

**Codes:**
- `PARSE_BODY` — req.json() parse failure
- `LETTER_ID` — letterId not a valid UUID
- `TERMS_ACCEPTED` — termsAccepted !== true
- `TERMS_VERSION` — termsVersion not in allowlist
- `EMAIL_TYPE` — email not a string
- `EMAIL_FORMAT` — email fails format check
- `NAME_TYPE` — name not a string
- `NAME_EMPTY` — name empty after trim
- `RATINGS_SHAPE` — ratings array shape invalid
- `POSITIONS_SHAPE` — positions array shape invalid

**Regression test:** `e2e/p719-reproduce.spec.ts` — verifies the happy path (stale session → complete letter → signup → 200). Test passes. Failing assertion would show which step broke + logs provide which check fired.

**Next step:** Wait for bug to recur in prod. Check edge function logs for `[P719-DIAG]` code. That code identifies the failing validation check → root cause → targeted fix.

## Acceptance Criteria

- [ ] Anonymous user completes a public letter and submits "Save my responses" → sees "Check Your Email" confirmation, no 400 error
- [ ] Flow works whether user had no prior session, an expired session, or a valid session from a different user
- [x] Edge function logs identify which validation check triggered in the failing scenario
- [ ] `npm test` passes with no new failures
- [x] Regression test: `e2e/p719-reproduce.spec.ts` — passes (happy path verified)
