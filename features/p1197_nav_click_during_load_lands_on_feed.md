---
status: qa
type: bug
rank: 88
severity: medium
date_reported: '2026-08-31'
created_date: '2026-08-31'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [navigation, routing, auth, instrumentation]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
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

### New suspect, found by the instrument on first contact (2026-08-31)

Running the trace against a **production build** surfaced something no local scenario could reach:

```
[navtrace] 16133.6ms pushState → /login [sinceClick=0ms clicked=/login activation=true]
    at window.history.pushState (index-DkHq0uwy.js:64:224)
    at History.u [as pushState] (https://cdn.lgrckt-in.com/logger-1.min.js:1:353224)
```

**LogRocket monkeypatches `history.pushState` in production.** It initialises only under
`import.meta.env.PROD` (`src/main.tsx:15`), so every one of the six local scenarios ran against a
history API that LogRocket had never touched — the third-party patch was structurally absent from
the entire investigation.

Compounding it, the same session logged `LogRocket: Session quota exceeded … Disabling`. If
LogRocket patches history when it initialises and stops when quota-disabled, then whether a
third-party wrapper sits in the navigation path **varies between page loads** — which is the shape
of an intermittent bug. This is a hypothesis, not a finding: it has not been tested, and the
falsifier is cheap — load with `?navtrace=1` twice, once with LogRocket active and once
quota-disabled, and compare the traces.

## Invariants

- **A nav click that the user perceives as landing must either navigate or visibly do nothing —
  never navigate somewhere the user did not choose.** Whatever the fix, `/` must keep redirecting
  signed-in users to `/feed` (P491/P555); the defect is the interaction with an in-flight click, not
  the redirect itself.
- **The instrument must not become a data collector.** Console-only, opt-in, no network egress, no
  identifiers written anywhere.
- **No URL this instrument prints may carry its querystring or hash.** Six in-app routes
  navigate with a live access token in the query — `letter-reading-page.tsx:726`,
  `letters-section.tsx:171`, and three agreement-accept routes. P488 already strips those from
  the address bar because a token in a URL is a leak; printing one to the console reintroduces it.
  "Console-only" is **not** containment: LogRocket and Sentry are both live on the page
  (`main.tsx:15-60`) and both capture console output, so a printed value is one hop from leaving
  the browser. Every logged URL goes through `redactUrl()` — destinations included, not only the
  clicked link. Found by code review after a first fix covered only the click path.

- **Any prod diagnostic must carry signal that survives minification.** The build uses
  `sourcemap: 'hidden'` (`vite.config.ts:96`) — maps are produced for Sentry but never served, so
  every stack frame reaching the founder's console reads as `at ye (index-abc123.js:42:1337)`. A
  diagnostic whose conclusion depends on reading a function name is useless in the only environment
  where this bug exists. Record the fact directly instead of inferring it from a name.

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

**Built, 2026-08-31** — `src/lib/nav-trace.ts`, installed at `src/main.tsx` before `createRoot`.
Beyond the stack, each line carries `[sinceClick=… clicked=… activation=…]`: how long ago the user
last clicked, which link, and whether the browser considers a user activation live. That is the
P1197 question stated directly — *did the click register, or did a redirect fire on its own* — and
unlike a frame name it survives minification. `sinceClick=never` on the line that lands on `/feed`
confirms the leading hypothesis; `clicked=/org/cm` on a line that lands on `/feed` refutes it and
proves a real bounce.

Also worth folding in, both independently confirmed and neither dependent on the investigation:

- Remove the shipped debug logging at `src/app/pages/letters-page.tsx:61,64`
  (`console.log('[AUTH-TRACE] …')`) — leftovers from a previous attempt at this same bug.
- `src/app/pages/login-page.tsx:28` — for a user with a null slug (a supported state per P50), the
  already-signed-in redirect targets `/`, which redirects to `/feed`. **[FOUNDER DECISION: should a
  slug-less signed-in user hitting /login land on /feed, or somewhere else?]** — this is a product
  call, not obviously a defect.

## Acceptance Criteria

- [x] Loading `?navtrace=1` prints a trace line for every URL change, each with a timestamp and a
      stack — verified against a **production build** (`vite preview`), not only dev
- [x] Without the flag, the trace prints nothing and patches nothing — asserted on function
      identity in `src/tests/p1197-nav-trace.test.ts`, and the assertion is mutation-verified
- [x] The trace captures URL changes before first paint — installed at 54.8ms in the prod build,
      and it recorded React Router's own init `replaceState` at 57.9ms
- [ ] [post-deploy] Reproducing the bug with the flag on identifies the code path that navigates to
      `/feed`, and that finding is written into this spec's Root Cause
- [x] No `[AUTH-TRACE]` output remains — both lines removed; `grep -rn AUTH-TRACE src/ e2e/` is empty
- [x] No console errors during the affected flow (prod build: zero errors; one unrelated LogRocket quota warning)
- [x] No trace line prints a URL querystring or hash — verified in a production build:
      `pushState → /letter/deliv-1?…` with the token absent
