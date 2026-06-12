---
status: qa
type: bug
rank: 3910.0
severity: high
workstream: C1
date_reported: '2026-06-12'
created_date: '2026-06-12'
date_resolved: '2026-06-12'
root_cause: signup-page.tsx had no useAuth guard (unlike login-page.tsx), so an authenticated user landing on /signup?source=letter-response re-rendered the anonymous gate and their sessionStorage draft was never submitted.
tags: [letter-response, auth-gate, signup, sessionstorage]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P935: Authenticated user shown anonymous "Save your responses" signup gate

## Summary

An already-logged-in user who completes a public letter (`/letter/:id`) is shown the anonymous "Save your responses / Continue with Google / create account" signup gate instead of having their responses saved — their draft sits in sessionStorage and nothing submits it.

## Root Cause

`signup-page.tsx` has **zero `useAuth()` references** — it has no authenticated-user guard. Compare `login-page.tsx:21-32`, which bounces a logged-in user out via `if (user) navigate(safeRedirect, { replace: true })`. The signup page has no equivalent, so any authenticated user landing on `/signup?source=letter-response` re-renders the anonymous gate. The authenticated submit path (`submitLetterResponseAuthenticated`) exists only on `letter-reading-page.tsx`, not on the gate — so there is no path on this page that saves a logged-in user's draft.

**Contributing factor:** Two P714 recovery navigations route users to the gate **without a `redirect` param**, so even after logging in there is nothing to forward them to:
- `letter-reading-page.tsx:1075` (token-path submit failed)
- `letter-response-confirm-page.tsx:211` (token expired)

Both build `/signup?source=letter-response&letterId=...&senderName=...` with no `redirect=`. The *normal* submit paths (`letter-reading-page.tsx:777/871`) DO include `redirect`, and `signInWithGoogle` preserves it through the OAuth round-trip (`api.ts:486-498`), so the happy path correctly lands on the confirm page.

## Reproduction Steps

1. As an existing (registered) user, open a public letter link `/letter/:deliveryId` in a session where you are **not yet authenticated**.
2. Read through and fill in responses (ratings + positions). The draft is held in sessionStorage at key `letter-response-draft-${letterId}`.
3. Reach the save gate — the page navigates to `/signup?source=letter-response&letterId=...&senderName=...`.
4. Authenticate (click "Already have an account? Log in", or "Continue with Google" on the gate).
5. Observe: after auth completes, the page still shows the anonymous "Save your responses" gate (with authenticated chrome — avatar + bottom nav visible). Responses are never submitted.

**Reproduction rate:** 100% when reaching the gate via a redirect-less P714 recovery path; any authenticated render of `/signup?source=letter-response` reproduces the gate.

## Expected Behavior

An authenticated user on `/signup?source=letter-response` should have their sessionStorage draft submitted via `submitLetterResponseAuthenticated` and be navigated to the letter-response confirm page — never shown the anonymous create-account form. (Mirrors `login-page.tsx`, which never shows a logged-in user the login form.)

## Actual Behavior

The anonymous "Save your responses / Continue with Google / Full Name / Email / I accept the Terms / Save my responses / Already have an account? Log in" form renders for the authenticated user. The draft is never submitted; the user's responses are silently lost.

## Affected Files

- `src/app/pages/signup-page.tsx` — no `useAuth()` guard; renders anonymous gate regardless of auth state
- `src/app/pages/letter-reading-page.tsx` — line ~1075, P714 recovery nav omits `redirect` param
- `src/app/pages/letter-response-confirm-page.tsx` — line ~211, P714 recovery nav omits `redirect` param

## Severity

**High** — breaks letter-response completion for existing users arriving via public letter links; their responses are silently discarded with no error.

## Fix Approach

1. **Add a `useAuth()` guard to `signup-page.tsx`.** When `user` is present:
   - If `source === 'letter-response'`: read the draft from `sessionStorage` (`letter-response-draft-${letterId}`), submit via `submitLetterResponseAuthenticated`, then navigate to the confirm page (`replace: true`). On missing/empty draft, fall back to the confirm page or letter results.
   - Otherwise: bounce out the same way `login-page.tsx:21-32` does (honor a safe `redirect` param, else `/p/:slug` or `/`).
   - Gate on `sessionChecked && !isLoading` before deciding (same as login-page) to avoid a transient `user=null` flash.
2. **Add `redirect` to the two P714 recovery navigations** (`letter-reading-page.tsx:1075`, `letter-response-confirm-page.tsx:211`) so even without the guard the user is forwarded correctly post-auth.

## Acceptance Criteria

- [x] An authenticated user landing on `/signup?source=letter-response&letterId=...` does NOT see the anonymous "Save your responses" form
- [x] An authenticated user's sessionStorage draft is submitted and they land on the letter-response confirm page
- [x] An authenticated user landing on a non-letter `/signup` is bounced out (to redirect target or profile), as `login-page.tsx` already does for `/login`
- [x] Anonymous users still see the signup gate normally (no regression to the unauthenticated flow)
- [x] The two P714 recovery navigations include a `redirect` param pointing at the confirm page
- [x] Regression test passes: `src/tests/p935-authed-signup-gate.test.tsx` (4 tests)
- [x] No console errors during the affected flow (only an unrelated pre-existing `Invalid Refresh Token` artifact from the browser's stale token)
