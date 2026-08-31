---
status: week
type: bug
rank: 88
severity: medium
date_reported: '2026-08-31'
created_date: '2026-08-31'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [navigation, routing, auth, instrumentation]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1197: Clicking a nav item while the app is still loading lands the user back on /feed

## Summary

The founder reports that navigating away from a still-loading page ends up back on `/feed`, with the
address bar changing to `/feed` — recurring after P938 fixed the related freeze:
> "while it's loading, if I click on some other item… I go to events and it goes back to feed"

## Root Cause

**Under investigation.** Six scenarios were built and run against a local build with an injected
session; each one that could exercise a redirect was paired with a control proving the harness
reached that redirect. **None reproduced the bounce.** In every case where the click landed, the
navigation stuck.

Ruled out, each with a passing control:

| Hypothesis | Control result | With the click |
|---|---|---|
| `HomeRedirect` (`src/App.tsx:116`) fires late and overrides the click | `/` → `/feed` fires ✅ | lands `/org/cm`, stays |
| `/login` guard redirects after the user clicks away | `/login` → `/` → `/feed` fires ✅ | lands `/org/cm`, stays |
| `/events` redirect chain reaches `/feed` | n/a | chain only reaches `/org/cm` or `/events/list` |

The general mechanism behind the first two — a still-mounted page emitting a redirect during a
pending React Router transition — is **disproved**: React unmounts the source route when the
transition commits, so its redirect never runs.

**Leading hypothesis (unconfirmed): the click never registers, and the ordinary `/` → `/feed`
redirect then fires on its own.** On `/login` during load, Playwright could not click the Events
link at all — repeated `element was detached from the DOM, retrying` until timeout — while a direct
`.click()` dispatch worked immediately. If the same holds on `/`, the sequence is:

1. User opens `claritypledge.com` → on `/`, loader showing while the session resolves
2. User clicks Events → **the click does not register**
3. Session resolves → `HomeRedirect` does its normal job → URL becomes `/feed`

That reproduces the reported symptom exactly, with no bounce existing anywhere. It is a hypothesis:
the un-clickable link was observed on `/login`, **not** on `/`, where clicks landed every time.

Prod was healthy while measured (all Supabase calls <200ms, DOMContentLoaded 138ms), so the slow-load
window that the bug needs was not reproducible on demand either.

## Invariants

- **A nav click that the user perceives as landing must either navigate or visibly do nothing —
  never navigate somewhere the user did not choose.** Whatever the fix, `/` must keep redirecting
  signed-in users to `/feed` (P491/P555); the defect is the interaction with an in-flight click, not
  the redirect itself.
- **The instrument must not become a data collector.** Console-only, opt-in, no network egress, no
  identifiers written anywhere.

## Reproduction Steps

1. Sign in as a verified user, on a cold cache or a throttled connection (the bug needs a slow load).
2. Navigate to `claritypledge.com` (the bare root — **not** `/feed` directly).
3. While the loader / still-loading feed is on screen, click **Events** (or Letters) in the nav.
4. Observe: the address bar ends on `/feed`.

**Reproduction rate:** intermittent for the founder; **0% across six constructed harness scenarios.**

## Expected Behavior

Clicking Events during load navigates to `/org/cm` and stays there. Clicking Letters navigates to
`/letters` and stays there.

## Actual Behavior

The address bar changes to `/feed`. Founder-confirmed: "it changes to /feed" — so a real navigation
occurs, not merely stale content left on screen (which is what P938 fixed).

## Affected Files

Suspected — none confirmed as the source:

- `src/App.tsx:116` — `HomeRedirect`'s `<Navigate to="/feed" replace />`; the only user-reachable
  redirect to `/feed` on this path. Fires correctly in isolation.
- `src/App.tsx:238` — `LazyRoute`, the P938 pathname-keyed Suspense boundary.
- `src/app/components/layout/bottom-nav.tsx:97` — the Partners item is omitted while `slug` is
  undefined, so the mobile bar goes 4 items → 5 mid-load and everything right of Letters shifts
  under the user's finger. A separate mis-tap defect; cannot produce a `/feed` URL (Home is leftmost
  and never moves), but it is live on the same screen during the same window.
- `src/auth/AuthContext.tsx:122-171` — the profile-fetch effect that keeps `isLoading` true.

## Severity

**Medium** — navigation is wrong during a load window, with an obvious workaround (click again once
loaded). No data loss. Raised in impact by being a **repeat** of a symptom the founder has now
reported across at least two prior attempts, which is itself a signal the real cause is still unfound.

## Fix Approach

**Instrument first; do not patch on the current hypotheses — all the specific ones are disproved.**

Add a nav trace behind an opt-in query flag (`?navtrace=1`) that patches `history.pushState` /
`history.replaceState` and logs every URL change with `performance.now()` and a stack trace, plus a
`popstate` listener. Reproducing once with the flag on names the exact line that sends the user to
`/feed`, ending the guesswork.

Two constraints on the instrument:

- **It must be reachable in production**, unlike the existing dev-only debug params
  (`?debugUpload`, `?debugRounds`, `?skipMicCheck`, all gated on `!import.meta.env.PROD` —
  decisions.md 2026-03-24). This bug does not reproduce locally, so a dev-only gate makes the
  instrument useless for the only environment where the bug exists. It is console-only and inert
  unless the flag is present; that is the deviation being requested, and it is deliberate.
- **It must install before the app mounts** (in `src/main.tsx`, before `ReactDOM.createRoot`) —
  the redirect fires within the first seconds, and a hand-pasted DevTools snippet cannot beat it.
  This was measured: manual injection landed at t=5673ms, well after the redirect had happened.

Once the trace names the source, file the actual fix as a follow-up layer on this spec (rewrite mode).

Also worth folding in, both independently confirmed and neither dependent on the investigation:

- Remove the shipped debug logging at `src/app/pages/letters-page.tsx:61,64`
  (`console.log('[AUTH-TRACE] …')`) — leftovers from a previous attempt at this same bug.
- `src/app/pages/login-page.tsx:28` — for a user with a null slug (a supported state per P50), the
  already-signed-in redirect targets `/`, which redirects to `/feed`. **[FOUNDER DECISION: should a
  slug-less signed-in user hitting /login land on /feed, or somewhere else?]** — this is a product
  call, not obviously a defect.

## Acceptance Criteria

- [ ] Loading `claritypledge.com/?navtrace=1` in production prints a trace line for every URL change,
      each with a timestamp and a stack trace naming the calling module
- [ ] Without the flag, the trace prints nothing and patches nothing (verify `history.pushState` is
      the native function when the flag is absent)
- [ ] The trace captures URL changes that happen before the first paint (install precedes
      `ReactDOM.createRoot`)
- [ ] Reproducing the bug with the flag on identifies the code path that navigates to `/feed`, and
      that finding is written into this spec's Root Cause
- [ ] No `[AUTH-TRACE]` output remains in the production console on `/letters`
- [ ] No console errors during the affected flow
