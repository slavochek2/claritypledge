---
status: all-done
type: bug
rank: 1000952.0
severity: medium
workstream: C1
date_reported: '2026-07-29'
created_date: '2026-07-29'
tags: [sentry, noise, auth, inbox, offline]
pipeline_ran: [create-bug, reproduce, fix]
completed_at: 2026-07-29
---

# P1011: Sentry noise backlog, and a failed inbox poll rendering as an empty inbox

## Summary

Sentry triage of the 6 unresolved issues found 5 that are noise our code should never
have captured, plus 1 real user-facing defect: a transient auth failure made the inbox
render "No letters or responses yet" to a user who had letters.

## Root Cause

Three distinct causes, one per fix:

**1. Browser-extension-thrown errors reached Sentry** (`JAVASCRIPT-REACT-2P`, `-2N`, `-2M`).
Errors thrown from `chrome-extension://` / `moz-extension://` frames were captured as
application errors. This is rung 3 of the noise ladder (decisions.md 2026-07-15, P882
pattern): our code never touches these, so the only place to classify them is
`beforeSend`, keyed on stack frames — the messages are not stably matchable.

**2. Every auth-callback miss was captured as an error** (`JAVASCRIPT-REACT-2K`, `-2`).
`AuthCallbackPage` called `Sentry.captureMessage` unconditionally whenever
`!session`. An expired magic link is an *expected* outcome — Supabase signals it in the
URL as `error_code=otp_expired` / `error=access_denied`. But `!session` also covers
genuinely unexplained failures (PKCE opened in the wrong browser, misconfigured Redirect
URL, GoTrue outage, hydration failure), so deleting the capture outright would have
blinded us to real auth breakage.

**3. Stale JWT after wake-from-sleep, surfacing as an empty inbox** (`JAVASCRIPT-REACT-2F`).
Established from the breadcrumb trail on both prod events: polls run cleanly every 15s
until the machine sleeps; ~3 hours later, on wake, a Supabase fetch fails with
`TypeError: Failed to fetch` because the network is not up yet; 3.5s later the polled
`get_inbox_items` RPC goes out carrying the token that therefore never refreshed, and
PostgREST rejects it with 401 `PGRST303 JWT expired`. `auth-js` deliberately keeps the
session rather than signing the user out on a retryable fetch error
(`GoTrueClient.js:1962`), which is what lets the stale token reach the wire. The next
poll (15s later) succeeds unaided.

The **user-visible** half of (3) was the worse bug: `getInboxItems` swallowed the error
and returned `[]`, which the caller could not distinguish from a genuinely empty inbox —
so a user with letters saw the empty state.

## Invariants

- **Noise ladder rung selection is settled** (decisions.md 2026-07-15). Our code never
  sees it → `beforeSend`. Our code sees it and the whole class is expected → the
  `logDbError` choke point. Our code has an expected/unexpected branch → classify at the
  service layer before logging. Do not re-derive; do not add broad `beforeSend` *message*
  filters (rejected in P883, re-rejected in P990).
- **`isNetworkBlip` cannot host any coded error.** `src/lib/network-blip.ts:64` returns
  false for any error carrying a `code`. PGRST303 legitimately carries one — PostgREST
  really did reject the token; the blip is *upstream* of it. Coded transients belong in
  `logDbError`, beside the P913 42501 branch.
- **A suppression must leave a breadcrumb.** Every drop site calls `noteSuppression`, so
  an over-suppression mistake stays discoverable without creating a Sentry issue (P990).
- **Returning `[]` on failure is a defect, not a graceful degradation**, wherever the
  caller renders an empty state. Failure and emptiness must be distinguishable at the
  service boundary.

## Reproduction Steps

**Issue 1 (extension noise):**
1. Load any page with an extension that throws from its own injected script.
2. Observe: Sentry captures an issue whose throw-site frame is `chrome-extension://…`.

**Issue 2 (auth callback):**
1. Request a magic link, wait for it to expire, then click it.
2. Land on `/auth/callback#error_code=otp_expired&…`.
3. Observe: Sentry error issue created for an entirely expected user action.

**Issue 3 (stale JWT / empty inbox):**
1. Sign in, open `/letters`, leave the tab open with the 15s inbox poll running.
2. Sleep the machine for longer than the token lifetime (observed: ~3h).
3. Wake it; the first poll fires before the network is up.
4. Observe: the poll fails with `PGRST303`, and the inbox renders
   "No letters or responses yet" despite the user having letters.

**Reproduction rate:** 1 and 2 are 100% given the trigger. 3 is intermittent — it needs a
failed refresh to coincide with a poll, and self-heals on the next 15s tick.

## Expected Behavior

- Extension-thrown errors never reach Sentry.
- Expired/denied magic links are tracked as analytics, not captured as errors; an
  *unexplained* callback failure is still captured.
- A failed inbox poll shows the last-known list plus a "can't reach the server, retrying"
  notice — never the empty state. A genuinely empty inbox still shows the empty state.
- `PGRST303` produces no Sentry issue, but leaves a `jwt-expired` breadcrumb.

## Actual Behavior (before fix)

- 6 unresolved Sentry issues, 5 of them pure noise, drowning real DB errors.
- A user with letters saw "No letters or responses yet" after waking their machine.

## Affected Files

- `src/lib/sentry-filters.ts` — added `dropBrowserExtensionNoise`, composed into
  `sentryBeforeSend`
- `src/auth/AuthCallbackPage.tsx` — discriminate expected expired-link params from
  unexplained failures before capturing
- `src/app/data/db-error-logger.ts` — `PGRST303` branch beside the P913 `42501` branch;
  `noteSuppression` parameterized with a reason
- `src/app/data/letters-service.ts` — `getInboxItems` throws via `throwDbError` instead of
  returning `[]`
- `src/app/components/letters/inbox-tab.tsx` — `stale` fetch state, last-known list
  retained, toast once per failure streak

## Severity

**Medium** — issue 3 is user-facing but intermittent, self-healing within 15s, and
observed on 2 prod events. Issues 1 and 2 are observability debt: no user impact, but
they degrade the signal-to-noise of the channel that would surface a real incident.

## Fix Approach

Three independent fixes, one commit each, each landing on the rung of the noise ladder
its class belongs to. Full rationale is recorded inline at each site (the comments carry
the "why not the other rung" reasoning, which is the part that decays fastest).

## Acceptance Criteria

- [x] An error thrown from a `chrome-extension://` frame produces no Sentry event
- [x] An application error that merely *passes through* an extension wrapper mid-stack is
      still reported (narrowness proven by mutation: reverting the last-frame check kills
      only this test)
- [x] An application error whose `Error.cause` came from an extension is still reported
      (narrowness proven by mutation: reverting the last-value check kills only this test)
- [x] An expired magic link (`error_code=otp_expired`) creates no Sentry issue, and still
      fires the `auth_callback_failed` analytics event
- [x] An unexplained callback failure (no error param) still captures to Sentry
- [x] `PGRST303` creates no Sentry issue and leaves a `db-error-suppressed` breadcrumb
      with `reason: jwt-expired`
- [x] A different PostgREST error (`PGRST116`) still reports — the code check is narrow
- [x] A failed inbox poll after a successful one retains the previous list and shows the
      stale notice, not the empty state
- [x] A failed *first* poll shows the error state, not a misleading empty inbox
- [x] The failure toast fires once per failure streak, not once per 15s tick
- [x] A genuinely empty inbox still renders the empty state
- [x] A failure of ONLY the secondary explain-back counts leaves the letter list on
      screen — no error screen, no stale notice (found in code review; mutation-proven)
- [x] Full suite green; no console errors in the affected flows
- [ ] Post-deploy: `JAVASCRIPT-REACT-2F` records no new events (left unresolved in Sentry
      deliberately, so a recurrence is visible)

## Verification Notes

Every canary was observed **failing before** the corresponding fix (epistemic gate 7), and
the two narrowness guards were mutation-tested — reverting each narrowing kills exactly
one test and no others.

**Code review (3 parallel reviewers)** found one HIGH defect in the first cut of fix 3:
`hasLoadedOnce` was set after the secondary explain-back fetch, so a failure in that
call collapsed an already-rendered list into the error screen — this bug class,
reintroduced through a second call in the same fetch cycle. Fixed in `8dd08a80` and
mutation-proven.

**Reviewer coverage (corrected after this spec was first written).** 2 of 3 reviewers
reported. The UX reviewer delivered late — after the ship — and independently found the
same two issues already fixed, confirming both resolved; its 7 remaining findings are
open UX polish (see below). The **over-suppression reviewer never reported at all**
despite three requests. That is the lens this change most needed, since every fix here
*suppresses* error reports and the failure mode of an over-broad filter is silence, not
noise. Treat the suppression breadth as reviewed by the code-review lens only.

**Open UX findings (not blocking, filed here rather than fixed):** the "retrying…" copy
overstates immediacy — the retry is the unchanged 15s poll, with no immediate refetch on
entering the stale state and no incremental feedback; and a genuinely empty inbox whose
next poll fails renders a notice claiming to show a "last update" that never existed.
Both involve user-facing copy decisions ([FOUNDER DECISION]). Lower-severity: no manual
retry affordance in the stale state (the error state has one), divergence from the
existing `LetterLiveBanner` status-banner pattern, and unverified contrast of the muted
`text-xs` line against the blue-tinted rows below it.

**Not verified in a live browser:** the inbox stale-state UI. `/letters` is auth-gated and
reaching the stale state requires inducing a network failure mid-session. Covered by unit
tests at the component level only.

## Sentry Issue Status

`2P`, `2N`, `2M`, `2K`, `2` resolved during triage. `2F` deliberately left unresolved
until this ships, so the fix can be confirmed against real traffic.

## Branch

`feature/p1011-sentry-noise-and-stale-jwt`
