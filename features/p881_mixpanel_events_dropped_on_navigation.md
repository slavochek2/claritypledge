---
status: week
type: bug
rank: 1000771.0
severity: high
workstream: analytics
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [mixpanel, analytics, auth-callback, event-loss]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P881: Mixpanel events fired immediately before navigation are silently dropped (~45% of profile_created lost)

## Summary

Mixpanel events tracked right before a client-side navigation are lost in flight — measured against prod DB ground truth, only 6 of 11 signups in the last 30 days produced a `profile_created` event (~45% loss).

## Root Cause

The Mixpanel snippet in `index.html:90` initializes with default transport (batched XHR with flush interval, no `api_transport` setting). Two loss mechanisms, confirmed by a codebase audit:

1. **Hard navigation kills the queue (confirmed at 7 call sites):**
   - `google_auth_initiated` in `src/app/components/auth/google-auth-button.tsx:80` — fires, then `supabase.auth.signInWithOAuth()` full-redirects to Google. Used on /login, /signup, /live.
   - `nav_cta_clicked` × 6 in `src/app/components/layout/simple-navigation.tsx` (188, 220, 261, 326, 380, 446) — track → `window.location.reload()` when already on /live.

2. **`profile_created` loss (hypothesis, ~45% measured):** `AuthCallbackPage.tsx` fires `identify()` (434) + `track()` (446) followed only by SPA `navigate()` — which does NOT unload the page, so simple navigation is ruled out. Remaining mechanism: default batch flush delay + user closing/backgrounding the tab shortly after the OAuth callback (mobile tab freeze kills the unflushed queue). Cheapest disproof: after deploying sendBeacon/flush-on-pagehide, capture rate should rise to ~100%; if it doesn't, re-diagnose (cookie/storage partitioning, tracker blocking at identified stage).

Evidence ruling out alternatives:
- Identity bridge works: all 6 captured `profile_created` events carry proper UUID distinct IDs (identify runs before track in code order).
- Ad blockers are not the primary cause: anonymous pre-auth events (`landing_page_viewed`, `signup_page_viewed`) from the same users' devices DO arrive — e.g. Philip Keay's signup window shows anonymous device activity but no `profile_created`.
- Loss is intermittent (race): Kieran O'Brien tracked, Ines Ganowsky (signed up 2 min later, same flow) did not.

## Reproduction Steps

1. Visit claritypledge.com in production as a new user (no profile)
2. Complete Google OAuth signup → land on `/auth/callback`
3. Callback upserts profile, fires `profile_created`, immediately redirects
4. Check Mixpanel Events feed for the new user's UUID

**Reproduction rate:** intermittent (~45% of signups over last 30 days; 5 of 11 missing: 7aced63e Philip, 43ab8db6, 4b688eee Ines, 75ef7019 Romain, 3be35687 Rasika)

## Expected Behavior

Every signup that reaches `/auth/callback` produces exactly one `profile_created` (or `login_complete`) event under the user's UUID in Mixpanel.

## Actual Behavior

~45% of signups produce zero Mixpanel events under their UUID — the event is queued but the in-flight request is killed by the immediate post-callback navigation. Funnel/activation boards undercount signups.

## Affected Files

- `index.html` — line 90 — `mixpanel.init` lacks `api_transport: 'sendBeacon'` / batching config
- `src/app/components/auth/google-auth-button.tsx` — line 80 — `google_auth_initiated` then OAuth full redirect (confirmed unsafe)
- `src/app/components/layout/simple-navigation.tsx` — lines 188, 220, 261, 326, 380, 446 — `nav_cta_clicked` then `window.location.reload()` (confirmed unsafe; also evaluate whether the reload is needed at all — SPA navigate precedes it)
- `src/auth/AuthCallbackPage.tsx` — lines 434–446 — `profile_created`/`login_complete` loss via batch-flush + tab close/freeze (hypothesis)
- `src/lib/mixpanel.ts` — wrapper; candidate place for a flush-aware helper
- Audit result: ~203 other `analytics.track()` call sites verified safe (SPA navigation or no navigation)

## Severity

**High** — analytics on the most important conversion event (signup) undercounts by ~45%; all funnel and activation metrics built on `profile_created` are wrong for a class of users.

## Fix Approach

Set `api_transport: 'sendBeacon'` in `mixpanel.init` (survives page unload/navigation) — single-config-line candidate fix. Alternative/complement: use the track callback or `send_immediately` before navigation in `AuthCallbackPage`. Audit other track-then-navigate sites across `src/` and apply one consistent mechanism rather than per-site patches.

Note: events sent via sendBeacon get no retry; verify session recording (`record_sessions_percent: 100`) still functions with the changed transport.

## Acceptance Criteria

- [ ] A fresh prod signup produces `profile_created` under the user's UUID in Mixpanel (verified live after deploy)
- [ ] Returning-user login produces `login_complete` under the UUID
- [ ] Signup→`profile_created` capture rate over the following 30 days ≈ 100% of DB signups (excluding localhost/dev)
- [ ] Session recording still records after transport change
- [ ] Audit list of other track-then-navigate call sites produced and addressed (or explicitly deferred with list in spec)
