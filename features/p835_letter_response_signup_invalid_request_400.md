---
status: week
type: bug
rank: 1000766.0
severity: high
workstream: infra
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [letter-response, signup, edge-function, validation]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P835: Letter-response signup returns 400 "Invalid request" on form submit

## Summary

Mobile user submitting the post-letter response signup form ("Save your responses") receives a red inline error "Invalid request. Please check your input and try again." and cannot complete signup or save their letter response.

## Root Cause

Under investigation. The exact error string is unique to `supabase/functions/request-letter-response-signin/index.ts:49` (`validationError()`), which is returned for any of 10 input-validation branches before any DB or auth work occurs. The deployed function (version 5, updated 2026-04-21) includes the `[P719-DIAG]` console.warn diagnostics added in commit `cabb4362`, but the analytics SQL endpoint (`function_logs`, `function_edge_logs`, `edge_logs`) returns zero rows for the prod project (`besjtuodziykmjidubzw`) over the last 72h — so the specific failing branch has not yet been read.

**Top hypothesis (ranked):**

1. **`RATINGS_SHAPE`** — sessionStorage draft contains a rating of `0` (skipped story included in array), a non-integer, or a `storyId` that is not a UUID. Edge function requires every rating to satisfy `Number.isInteger && >=1 && <=7`.
2. **`POSITIONS_SHAPE`** — `pointId` not a UUID, or position not a number. Client maps `POSITION_VALUES[p.position as PositionType] ?? 0`; a stale-schema draft silently coerces to `0` (passes type check, but suggests upstream drift).
3. **`LETTER_ID` empty** — only if the user reached `/signup?source=letter-response` without the `letterId` query param. All four URL generators in the codebase include it correctly, so this requires a non-standard entry path.

Ruled out:
- `EMAIL_FORMAT` — `countdown_prenatal475@silomails.com` passes the `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` regex.
- `TERMS_VERSION` — client sends `'v1.2'` from `src/lib/constants.ts:8`, which matches the edge function allowlist `['v1.2']`.
- `NAME_EMPTY` — "countdown prenatal" is 18 chars after trim.
- Letter lookup failure — would return "Something went wrong" (different string).
- Mailgun env vars missing — would return 500 "Something went wrong" (different status and string).
- P834 (`IP_HASH_SECRET` missing) — different function, different error string, different HTTP status; user is past that failure point.

## Reproduction Steps

1. Open a sealed, `mode='one-to-many'` letter on mobile (e.g. a /letter/:id public reading URL).
2. Read through the letter and complete all rating + position interactions.
3. On the final "Save your responses" screen, fill name + email + check terms.
4. Tap "Save my responses".
5. Observe: red inline error "Invalid request. Please check your input and try again." renders below the email field. Form does not submit; no email is sent.

**Reproduction rate:** Unknown — observed at least once on mobile (2026-05-15 ~10:43 device time, see screenshot `~/Downloads/photo_2026-05-15_15-47-55.jpg`). Need to confirm whether it reproduces with a fresh sessionStorage draft.

## Expected Behavior

After "Save my responses" is tapped with a valid letter draft + name + email + terms accepted:

- Edge function returns `{ ok: true }`.
- Branded email is sent to the entered address with a magic-link to `/letter/:letterId/confirm?token_hash=...`.
- UI transitions to a "Check your email" confirmation screen.
- A row is written to `letter_response_pending` with the user's draft.

## Actual Behavior

- Red inline error "Invalid request. Please check your input and try again." renders below the email field.
- Form does not submit; no email is sent.
- No user-visible indication of which field is at fault (by design — the edge function returns a unified error to prevent enumeration oracles).
- The user is blocked from completing the letter-response flow.

## Affected Files

- `supabase/functions/request-letter-response-signin/index.ts:49` — error string source (`validationError()`)
- `supabase/functions/request-letter-response-signin/index.ts:267-316` — 10 validation branches that can trigger the error
- `src/app/pages/signup-page.tsx:101-112` — client caller; constructs the payload from `searchParams` + sessionStorage draft
- `src/app/pages/letter-reading-page.tsx:768-777` — writes the sessionStorage draft and navigates to the signup form
- `src/lib/constants.ts:8` — `CURRENT_TERMS_VERSION` (verified consistent with edge function allowlist)
- `src/app/data/letters-service.ts:963-987` — `requestLetterResponseSignin` invoker; parses `FunctionsHttpError.context` to surface the edge function's error message

## Severity

**High** — blocks new signups via the letter-response path for affected users. The path is the primary conversion funnel for one-to-many letter recipients. Repro rate and population size unknown until logs are read, but the symptom is a hard block with no recovery affordance.

## Fix Approach

Two phases:

**Phase 1 — Diagnose (the goal of `/reproduce`):**
1. Read the live `P719-DIAG` validation_fail line from the Supabase dashboard logs UI (analytics SQL endpoint is empty for this function; dashboard pipeline is the alternate path).
2. If dashboard logs are also dry, add a one-line dev-mode client-side `console.log` of the exact POST payload before submit in `signup-page.tsx`, then ask the user to repro on mobile with remote DevTools attached.
3. Inspect the actual `ratings` and `positions` arrays in the sessionStorage draft for the affected letter — `JSON.parse(sessionStorage.getItem('letter-response-draft-<uuid>'))`.

**Phase 2 — Fix (once branch is known):**
- If `RATINGS_SHAPE` or `POSITIONS_SHAPE`: harden the client to filter/normalize draft entries before submit — never send `rating=0`, validate UUIDs and integer ranges client-side, surface a specific human-readable error if the draft is corrupt.
- If `LETTER_ID` empty: add a client-side guard that redirects back to the letter URL when `searchParams.get('letterId')` is missing, instead of letting the request hit the server with an empty string.
- Either way: improve the dev-mode payload-tap so the next "Invalid request" outage takes minutes to diagnose, not hours.

## Acceptance Criteria

- [ ] The specific validation branch that fired for the 2026-05-15 incident is identified and documented in this spec's Root Cause section.
- [ ] A user filling out the letter-response flow on a sealed one-to-many letter on mobile can submit the "Save my responses" form and reach the "Check your email" confirmation screen.
- [ ] No 400 "Invalid request" error is returned for any well-formed sessionStorage draft (all ratings 1–7, all UUIDs valid, position numeric).
- [ ] If the sessionStorage draft is corrupt, the user sees a specific, recoverable message (not the generic "Invalid request"), with a path back to re-read the letter.
- [ ] Regression test (`e2e/p835-letter-response-signup-validation.spec.ts` or similar) exercises the affected flow against a sealed test letter and asserts a successful submission.
- [ ] No console errors during the affected flow.
