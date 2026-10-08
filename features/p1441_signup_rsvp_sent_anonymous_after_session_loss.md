---
status: week
type: bug
rank: 26
severity: high
workstream: events
date_reported: 2026-10-08
created_date: 2026-10-08
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [auth, rsvp, rls, signup]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [reproduce, create-bug]
---

# P1441: New signup's RSVP is sent anonymously after the browser loses its session; the page still shows them signed in

## Summary

A brand-new signup who confirmed by email was never RSVP'd. The auto-RSVP and every manual
"Reserve" tap went out as the anonymous role and failed RLS (401 / 42501), while the page kept
showing the person as signed in and told them the event "may be full". (Sentry
JAVASCRIPT-REACT-3Q, iPhone Chrome, release de3100ef.)

## Root Cause

**Mechanism confirmed; trigger NOT reproduced.**

Evidence (Sentry breadcrumbs of event e8f1f0b1, prod read-only queries, Mixpanel):

- The confirmation link redeemed correctly: email confirmed and a session created on the same
  device; the callback created the profile (`upsert_my_profile`, `mark_self_verified` → 200).
- About 1.6 s later the client stopped attaching the user's JWT. The same `clarity_letters` query
  went from 200 to 401, `letter_deliveries` returned 401, and every `event_rsvps` INSERT returned
  401 with 42501. That is the anonymous role; a signed-in role gets 403 (inferred from
  PostgREST's documented behaviour, not checked in its source).
- No SIGNED_OUT reached the app (`session_lost_unexplained` absent, and handleRsvp only inserts
  when the app sees a session). No token refresh was attempted: the refresh token was never
  rotated and `auth.sessions.refreshed_at` is null.
- So `supabase.auth.getSession()` returned no session while AuthContext kept its copy.

Ruled out:
- **Profile-id change:** auth id = profile id.
- **Device clock skew:** the `__app_update` timestamp matches server time to about 0.1 s.
- **Event capacity or status:** the event is upcoming with no capacity limit.
- **Something else in the stack:** prod policies match the migrations, there are no triggers on
  `event_rsvps`, our code never touches the `sb-*-auth-token` key, and the fetch wrappers keep the
  `Authorization` header.

What removed the client's session is unknown. Chromium e2e (single tab, and with the signup tab
left open) does not reproduce it. WebKit was not tried; installing it was declined.

**Secondary defect, reproduced:** `AuthCallbackPage`'s effect re-ran `processAuth` whenever
`user` or `session` changed, and its own `refreshProfile()` changes `user`. In prod one signup did
two profile upserts and two auto-RSVPs, and tracked both `profile_created` and `login_complete`.

**Secondary defect, by code read:**
- `cancelRsvp` returned true for an anonymous DELETE: RLS filters it to 0 rows with no error, so
  the page showed "cancelled" while the seat stayed booked.
- `api.ts` `rsvpToEvent` reported failures to the console only, so failed auto-RSVPs never reached
  Sentry.

## Invariants

- An identity-bound write (RSVP insert or cancel) is never reported to the person as anything but
  "please sign in again" when the client cannot act as them. It is never reported as "full", and
  never as success.
- A cancel shows success only when the row was actually deleted (`DELETE … RETURNING` is not empty).
- Recovery never calls `signOut()` and never overwrites a session the client holds for a different
  user. supabase-js `signOut()` revokes the client's current session server-side.
- The callback processes one sign-in once per mount.

## Reproduction Steps

1. As a new visitor on mobile, open an event page and tap Reserve; sign up.
2. Open the confirmation email link (`/auth/verify?token_hash=…&redirect_to=…action=rsvp`).
3. In prod (trigger unknown), the client loses its session about 1.6 s after verifying.
4. Observe: no RSVP row. The page says "Account created! Click Reserve…", and each Reserve tap
   errors with "may be full".

**Reproduction rate:** rare (1 occurrence observed; the trigger is not reproduced locally). The
mechanism is reproduced by unit tests that drop the client session.

## Expected Behavior

The person is RSVP'd. If the client truly cannot act as them, they see "Please sign in again to
reserve your seat." and are sent to login with the RSVP intent kept, and the RSVP completes after
sign-in. A cancel never claims success unless the row is gone.

## Actual Behavior

Anonymous inserts fail RLS. The person sees "Couldn't sign you up. The event may be full…" with no
way forward. The auto-RSVP failure is invisible in Sentry.

## Affected Files

- `src/auth/AuthCallbackPage.tsx`: the effect re-runs `processAuth`; auto-RSVP error handling
- `src/app/data/api.ts`: `rsvpToEvent` (used by the callback), `cancelRsvp`
- `src/app/data/events-service-real.ts`: `rsvpToEvent`, `cancelRsvp`
- `src/app/prototypes/events/components/EventDetail.tsx`: Reserve and cancel handlers
- `src/app/prototypes/events/close/EventClosePage.tsx`: "Reserve my place"
- `src/app/prototypes/events/arrival/EventArrivingPage.tsx`: "can't make it" cancel
- `src/auth/AuthContext.tsx`: the app's session copy

## Severity

**High.** A new signup (the conversion moment) cannot RSVP and is told the event is full.

## Fix Approach

Defensive guard, founder-approved (option A), since the trigger was not reproduced:

- **`src/lib/session-guard.ts`:**
  - AuthContext reports its session to the guard.
  - Right before an RSVP insert or cancel, the guard checks that the client holds the same user.
    If the client holds nobody, it re-syncs once from the app copy, and only while that copy's
    access token stays valid for at least 60 s more.
  - Otherwise it throws `SessionMismatchError`.
  - A server 401/42501 on the insert, or a 0-row cancel with the session gone, is mapped to the
    same error.
- **`useSignInAgain`:** never calls `signOut()`. supabase-js signs out whatever session the client
  holds at that instant, server-side, so another tab's sign-in could be revoked.
  - If the client holds nobody: full-page navigation to login, which drops the stale app copy, and
    the login page shows the reason once. An RSVP keeps `action=rsvp`; a cancel carries no action,
    so it is never replayed as a booking.
  - If the client holds someone (another account, or the same person whose session came back):
    reload the event page. No action is carried, so no loop.
- **Re-sync guards:** it aborts if the app session changed while it was awaiting (a sign-out
  mid-check is never undone), and it re-reads the client right before `setSession`. A zero-row
  cancel re-checks WITHOUT a re-sync.
- **Callback:** a run-once ref. Auto-RSVP failures go to Sentry.
- **Follow-up if it recurs:** the guard leaves Sentry and Mixpanel signals, and finding the real
  trigger needs WebKit or a device.

## Acceptance Criteria

Evidence: `e2e/p1441-uat.spec.ts` (6 states, Chromium, local dev + TEST DB; screenshots at 1280 / 375 / 320, independent visual-QA verdict PASS) and the full vitest run, 2026-10-08.

- [x] A new signup confirming by email is RSVP'd once and lands on the confirmation page — UAT (a) + `e2e/p1441-signup-auto-rsvp.spec.ts`: `/confirm` reached, exactly 1 row
- [x] One signup produces exactly one profile write and one auto-RSVP attempt — `src/tests/p1441-auth-callback.test.tsx` (unit; failed "called 2 times" before the fix)
- [x] With the client session lost and not recoverable, Reserve shows "Please sign in again to reserve your seat." and opens login with `redirect=/events/<slug>&action=rsvp`, and no "may be full" message appears — UAT (b1): URL, notice text, no "may be full", 0 rows
- [x] After that sign-in, the RSVP completes without another tap — UAT (b2): `/confirm`, 1 row. The sign-in link is generated to the exact shape `signInWithEmail` sends; the real email delivery was not exercised
- [x] With the client session lost, cancel shows "Please sign in again to cancel your seat.", the seat is not shown as released, and signing in does not re-book — UAT (d1/d2): no `action` in the login URL, notice text, booking count stays 1
- [x] A cancel that fails for any other reason shows "Couldn't cancel your seat. Please try again." on the event page instead of closing silently — UAT (e)
- [x] A cancel that deletes no row while the seat is still held shows the failure state, never "cancelled" — UAT (e): "Can't make it" still shown, 1 row. (A zero-row cancel whose row is confirmed already gone reports cancelled: unit tests in `src/tests/p1441-session-guard.test.ts`)
- [x] After a successful cancel, the canceller leaves the Participants list without a reload — UAT (c) + `src/tests/p1441-cancel-participants.test.tsx` (found by visual QA)
- [ ] A browser where another tab signed in as a different account is never signed out by this recovery — unit-tested only (`p1441-auth-callback.test.tsx`, "SOMEONE ELSE"); two real tabs not exercised in a browser
- [ ] A failed auto-RSVP insert appears in Sentry as `DB error in rsvpToEvent` — unit-tested only (`p1441-session-guard.test.ts` asserts `logDbError`); Sentry is production-only, so not observable locally
- [x] No console errors during the normal signup → RSVP flow — UAT (a) asserts none (it caught a 406 from `isUserRsvpd`'s `.single()`, fixed with `maybeSingle()`)
