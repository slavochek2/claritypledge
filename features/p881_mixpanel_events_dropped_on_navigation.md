---
status: in-progress
type: bug
rank: 1000771.0
severity: high
workstream: analytics
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [mixpanel, analytics, auth-callback, event-loss]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p881-reproduce.spec.ts
  root_cause: "Default ~5s batch flush window: page death without pagehide (mobile app-switch/OS kill, in-app browser discard) strands the localStorage queue; non-returning users never flush it. Track-then-navigate is NOT the mechanism — pagehide sendBeacon flush handles it (verified)."
  confidence: medium
  surfaces_in_scope: [auth-callback-profile-created]
  surfaces_deferred: [P895]
  reproduced_at: 2026-06-04
---

# P881: Mixpanel `profile_created` stranded in the ~5s batch window (~45% lost; navigation ruled out)

## Summary

Critical Mixpanel events sit in the default ~5s batch queue; when the page dies without `pagehide` and the user never returns, the event is lost permanently — measured against prod DB ground truth, only 6 of 11 signups in the last 30 days produced a `profile_created` event (~45% loss). (Originally filed as "dropped on navigation" — that mechanism was falsified during /reproduce; see Root Cause.)

## Root Cause

**Confirmed (reproduce session, behavioral harness + prod data):** The Mixpanel snippet in `index.html:90` uses default batching (~5s flush interval, queue persisted to localStorage). A critical event tracked into that window is lost permanently when the page dies **without firing `pagehide`** (mobile app-switch → OS tab kill, in-app browser discard) AND the user never loads the site again in that browser context — the persisted queue only flushes on the next mixpanel init.

**Falsified — the original "hard navigation kills the queue" mechanism (was claimed confirmed at 7 call sites):** `mixpanel-2-latest` flushes the queue via `sendBeacon` on `pagehide`. Verified with the verbatim prod snippet against a real local HTTPS server: the event is delivered during unload on both `window.location.reload()` (delivered ~389ms after track) and a cross-origin OAuth-style redirect (~568ms). The 6 `nav_cta_clicked` reload sites and `google_auth_initiated` are safe wherever pagehide fires. (Caveat: a Playwright `page.route` interception cannot observe beacons during a cross-origin process swap — a naive e2e shows false loss. The real-server harness was the decisive check.)

**Falsified — misclassification direction (new user logged as returning):** all 28 `login_complete` events in the 30-day window belong to the founder + already-captured signups. The 5 missing users have zero events of any kind under their UUIDs.

**Falsified — anon-identity loss:** no `profile_created` under `$device:`/anonymous distinct IDs in the window.

**Corroboration for the stranded-queue mechanism:** every signup whose `profile_created` was captured also has later `login_complete` events (the user returned, giving the persisted queue a flush opportunity); none of the 5 missing users ever returned. Capture correlates exactly with returning.

**Measured flush timing (harness, live config):** no-navigation flush at ~5.2s after `track()` — the vulnerability window for `profile_created`, which is followed only by SPA `navigate()` (no unload, no pagehide flush).

**Residual uncertainty (confidence: medium):** the no-pagehide page-death + never-return chain can't be triggered deterministically locally; final disproof is the post-fix 30-day capture rate (AC #3).

**Related discovery (separate ticket P895):** `profile_created` also fired for the founder's existing profile on a plain login (`registration_source: login`) — `isReturningUser` misclassification inflates `profile_created` in the opposite direction.

## Reproduction Steps

1. Visit claritypledge.com in production as a new user (no profile)
2. Complete Google OAuth signup → land on `/auth/callback`
3. Callback upserts profile, fires `profile_created`, immediately redirects
4. Check Mixpanel Events feed for the new user's UUID

**Reproduction rate:** intermittent (~45% of signups over last 30 days; 5 of 11 missing: 7aced63e Philip, 43ab8db6, 4b688eee Ines, 75ef7019 Romain, 3be35687 Rasika)

## Expected Behavior

Every signup that reaches `/auth/callback` produces exactly one `profile_created` (or `login_complete`) event under the user's UUID in Mixpanel.

## Actual Behavior

~45% of signups produce zero Mixpanel events under their UUID — `profile_created` sits in the ~5s batch queue, the page dies without pagehide (mobile app-switch/OS kill or in-app browser discard), and the localStorage-persisted queue never flushes because the user never returns. Funnel/activation boards undercount signups.

## Affected Files

- `index.html` — line 90 — `mixpanel.init` uses default ~5s batching; no fast-delivery path for critical events
- `src/auth/AuthCallbackPage.tsx` — lines 434–446 — `profile_created`/`login_complete` tracked into the 5s window, followed only by SPA `navigate()` (no pagehide flush)
- `src/lib/mixpanel.ts` — wrapper; candidate place for a flush-aware helper
- ~~`google-auth-button.tsx:80`, `simple-navigation.tsx` × 6~~ — **verified safe** (pagehide sendBeacon flush delivers events through reload and OAuth redirect); no per-site changes needed
- Audit result: ~203 other `analytics.track()` call sites verified safe (SPA navigation or no navigation)
- Canary: `e2e/p881-reproduce.spec.ts` — FAILS pre-fix (event still queued at 2s); includes a passing regression guard for the pagehide flush

## Severity

**High** — analytics on the most important conversion event (signup) undercounts by ~45%; all funnel and activation metrics built on `profile_created` are wrong for a class of users.

## Fix Approach

**Goal: critical events leave the browser within ~1s of `track()`, instead of waiting out the ~5s batch window.** Candidates (pick in /fix):
- Lower `batch_flush_interval_ms` in `mixpanel.init` (config-level — the canary harness reads the live config, so it verifies this automatically), or
- `send_immediately`/track-callback for the critical events in `AuthCallbackPage` via a flush-aware helper in `src/lib/mixpanel.ts` (per-site — the canary harness must then be extended to load the helper; see note in the test file).

**Do NOT** add per-site changes to the track-then-navigate sites (`google-auth-button`, `simple-navigation`) — verified safe via the pagehide sendBeacon flush; the canary's regression guard protects this.

Note: verify session recording (`record_sessions_percent: 100`) still functions after any init config change.

## Acceptance Criteria

- [ ] A fresh prod signup produces `profile_created` under the user's UUID in Mixpanel (verified live after deploy)
- [ ] Returning-user login produces `login_complete` under the UUID
- [ ] Signup→`profile_created` capture rate over the following 30 days ≈ 100% of DB signups (excluding localhost/dev)
- [ ] Session recording still records after transport change
- [x] Audit list of other track-then-navigate call sites produced and addressed — resolved in /reproduce: all verified safe via pagehide sendBeacon flush; regression guard in `e2e/p881-reproduce.spec.ts`
- [ ] Canary test (`e2e/p881-reproduce.spec.ts`) passes after fix
