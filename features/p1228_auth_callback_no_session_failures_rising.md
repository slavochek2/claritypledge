---
status: week
type: bug
rank: 1000067
severity: medium
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: opus
exec_effort: high
tags: [auth, magic-link, oauth, sentry, mixpanel]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1228: "Auth callback: no session, unexplained" — failures rising alongside a login-page spike

## Summary

Sentry issue `JAVASCRIPT-REACT-31` — message `Auth callback: no session, unexplained` on
`/auth/callback` — fired 3× between 2026-08-31 and 2026-09-01 (release `72dae037`, Safari 26.6 on
macOS), after being absent for the preceding 30 days. In the same week Mixpanel shows
`login_page_viewed` at 83 (partial week) against 1–11 per week for the prior seven weeks, and
`auth_callback_failed` at 4 (prior weeks: 0–1). No existing spec contains the phrase
"no session, unexplained" (`grep -rl` over `features/` and `features/done/`: no hits).

Found by the 2026-09-01 production health sweep. **No fix on this branch — evidence and a
reproduction plan only.**

## Root Cause

Under investigation. What the evidence says:

- The latest event's breadcrumbs end with a `POST` to the Supabase auth endpoint that returned
  **HTTP 422** (request body 183 B, response 84 B) immediately before the "no session" message.
  A 422 from GoTrue on the callback path is the shape of a rejected token exchange (expired or
  already-consumed magic link / OTP, or a PKCE verifier that does not match the code).
- All three events are on the release that went live after the P1148 credential rotation and the
  P1215/P1207 work; the anon key in the live bundle is the new publishable key, so this is not the
  "Legacy API keys are disabled" failure (that issue, `-2X`/`-2Y`, last fired 08-28).
- `login_page_viewed` jumping from ~5/week to 83 is either (a) users being bounced back to `/login`
  after a failed callback and retrying, (b) a crawler/monitor hitting `/login` (the sweep also found
  ~56/week of near-constant synthetic traffic on `signup_page_viewed` and `live_meeting_page_view`),
  or (c) a new inbound campaign. (a) and (b) are distinguishable by user-agent and by whether the
  same distinct id fires `auth_callback_failed`.

**Hypothesis:** the magic-link / OAuth redirect lands on `/auth/callback` with a code that GoTrue
rejects (422) — most likely a link opened twice or after expiry (Safari link preview / mail-client
prefetch consumes the single-use token before the user's click), and the callback page reports the
resulting absent session as "unexplained" because it only classifies the `no_session` and
`profile_upsert_failed` reasons.

**Cheapest disproof:** read the Sentry event's `extra.supabaseError` and `extra.url` (the page
already records both — `src/auth/AuthCallbackPage.tsx:113`; note the message is only sent when the
error is NOT the bare `otp_expired`/`access_denied` that decisions.md 2026-03-07 classifies as an
expired link, so the plain-expiry hypothesis is already partly excluded) and the 422 response body
from the request breadcrumb (84 bytes — GoTrue's `{"code":...,"msg":"..."}` fits). If it says the token is expired/invalid, the
hypothesis stands and the fix is a classified, user-facing "this link was already used — request a
new one" state. If it is a PKCE/verifier mismatch, the cause is in the client flow and the
repro is: start login in one browser profile, complete the link in another.

## Reproduction Steps (to be confirmed)

1. Anonymous, Safari (macOS). Go to `https://claritypledge.com/login`, request a magic link.
2. Open the link once (consume the token), then open the same link again — or wait past expiry.
3. Observe `/auth/callback`.

## Expected Behavior

A classified, user-facing message that names the cause (expired / already used) and offers a
one-click re-send; Sentry receives a tagged reason, not "unexplained".

## Actual Behavior

Callback reports `Auth callback: no session, unexplained` to Sentry; the user's next step is
unrecorded (Mixpanel `auth_callback_failed` reason property should say — check it).

## Affected Files

- `src/auth/AuthCallbackPage.tsx:113` — `Sentry.captureMessage('Auth callback: no session, unexplained', …)`
- `docs/technical/analytics.md` — `auth_callback_failed.reason` enumerates only `no_session`, `profile_upsert_failed`

## Severity

**medium** — 3 events, 0 identified users so far, but it sits on the only path into the product and
the login-page spike suggests more attempts than Sentry records.

## Fix Approach

1. Run the cheapest disproof above; record the 422 body in this spec.
2. Classify the 422 reasons on the callback page and report each as its own `reason`.
3. Decide whether the `login_page_viewed` spike is humans or a monitor (Mixpanel breakdown by
   `$browser` / `$initial_referrer` for the week of 08-31); if a monitor, filter it — it is also
   inflating the signup and live funnels' top step.

## Acceptance Criteria

- [ ] The 422 response body for at least one `-31` event is recorded here and the root cause is named
- [ ] `/auth/callback` reports a specific `reason` for a rejected token exchange (no more "unexplained" for this class)
- [ ] The user sees an actionable message with a re-send action instead of a silent bounce
- [ ] The `login_page_viewed` spike is attributed (human vs synthetic) with the query recorded

## Evidence

- Sentry: `JAVASCRIPT-REACT-31`, 3 events, first 2026-08-31, last 2026-09-01, url `/auth/callback`, release `72dae037`, browser Safari 26.6 / macOS; last breadcrumb `POST … 422`.
- Mixpanel (project 3968494, weekly totals, weeks of 07-13 … 08-31): `login_page_viewed` 2, 4, 3, 11, 4, 1, 11, **83**; `auth_callback_failed` 0, 0, 0, 1, 0, 0, 1, **4**; `login_complete` 4, 4, 0, 8, 2, 0, 11, 7; `google_auth_initiated` 2, 2, 0, 8, 1, 0, 11, 15.
