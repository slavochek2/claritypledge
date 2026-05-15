---
type: bug
rank: 1000766.0
severity: high
workstream: infra
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [letter-response, signup, edge-function, validation]
status: all-done
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p835-reproduce.test.ts
  root_cause: "Client UI exposes 0–10 rating scale (RATING_OPTIONS in src/app/components/partners/constants.ts:8), but edge function isValidRatingsArray (supabase/functions/request-letter-response-signin/index.ts:209-210) accepts only rating >= 1 && <= 7. Any user picking 0, 8, 9, or 10 triggers RATINGS_SHAPE validation_fail → 400 'Invalid request.'"
  confidence: high
  surfaces_in_scope: [request-letter-response-signin-edge]
  surfaces_deferred: []
  reproduced_at: '2026-05-15'
completed_at: 2026-05-15
---

# P835: Letter-response signup returns 400 "Invalid request" on form submit

## Summary

Mobile user submitting the post-letter response signup form ("Save your responses") receives a red inline error "Invalid request. Please check your input and try again." and cannot complete signup or save their letter response.

## Root Cause

**Confirmed (2026-05-15, high confidence — no live logs required):**

Client/server rating-scale mismatch. The reading flow renders `RatingButtons` (`src/app/components/partners/shared.tsx:29`) backed by `RATING_OPTIONS` (`src/app/components/partners/constants.ts:8`), which exposes values **0, 1, 2, …, 10**. The accompanying card declares itself a "0-10 comprehension rating card" (`comprehension-rating-card.tsx:3`, `aria-label="Rating scale from 0 to 10"`). Any selected value is written verbatim into the sessionStorage draft (`letter-reading-page.tsx:1206-1207`) and forwarded to the edge function (`signup-page.tsx:107`).

The edge function's `isValidRatingsArray` (`request-letter-response-signin/index.ts:199-212`) rejects any rating outside `>= 1 && <= 7`. So:

- **Rating = 0** ("Not at all" — leftmost button) → `RATINGS_SHAPE` fail → 400 "Invalid request"
- **Rating = 8, 9, or 10** ("Complete cognitive understanding" end) → same fail
- **Rating = 1–7** → passes (the only reason this isn't a 100% repro rate)

Confirmed by canary unit test `src/tests/p835-reproduce.test.ts`, which imports the live `RATING_OPTIONS` and runs them through a verbatim copy of the edge-function predicate. The test fails on values 0, 8, 9, 10 — exactly matching the bug.

The 1–7 bound looks like a Likert-scale leftover from an earlier rating shape (cf. `EU_LIKERT`). The 0–10 scale is the production behavior across `/live` and letter reading; the edge function is the side that drifted.

### Fix scope

Single file: change `>= 1 && <= 7` → `>= 0 && <= 10` in `supabase/functions/request-letter-response-signin/index.ts:209-210`. No other validation gates use this bound (verified by grep). The post-magic-link confirm path (`save-letter-response/index.ts` if any) writes via a separate endpoint and uses the same draft — re-check during `/fix` to confirm no second gate exists.

### Original hypotheses log (kept for reference)

The exact error string is unique to `supabase/functions/request-letter-response-signin/index.ts:49` (`validationError()`), which is returned for any of 10 input-validation branches before any DB or auth work occurs. The deployed function (version 5, updated 2026-04-21) includes the `[P719-DIAG]` console.warn diagnostics added in commit `cabb4362`, but the analytics SQL endpoint (`function_logs`, `function_edge_logs`, `edge_logs`) returns zero rows for the prod project (`besjtuodziykmjidubzw`) over the last 72h — so the specific failing branch has not yet been read.

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

- [x] The specific validation branch that fired for the 2026-05-15 incident is identified and documented in this spec's Root Cause section.
- [x] No 400 "Invalid request" error is returned for any well-formed sessionStorage draft (all ratings 0–10 from the production UI, all UUIDs valid, position numeric). Bound widened from `>=1 && <=7` to `>=0 && <=10` in `request-letter-response-signin/index.ts:209-210` to match the client `RATING_OPTIONS` (0–10) scale.
- [x] Canary unit test `src/tests/p835-reproduce.test.ts` flipped from `it.fails` to plain `it()` and passes — every value in `RATING_OPTIONS` round-trips through the edge predicate. [post-deploy] verifies on prod after function deploy.
- [ ] [post-deploy] A user filling out the letter-response flow on a sealed one-to-many letter on mobile can submit the "Save my responses" form and reach the "Check your email" confirmation screen.
- [ ] [post-deploy] No console errors during the affected flow.
- [x] Corrupt-draft recovery message — withdrawn. This AC was speculative when the root cause was unknown (`Phase 2` of the original Fix Approach hypothesised draft corruption). Once root cause was confirmed as a server-side bound mismatch — not a corrupt draft — a specific recoverable UI is unnecessary for this fix. The unified `validationError()` response is intentional (anti-enumeration). If a future "draft hardening" feature is desired, file separately.
