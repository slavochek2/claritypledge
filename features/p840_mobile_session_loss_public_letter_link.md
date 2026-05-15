---
status: week
type: bug
rank: 1000771.0
severity: high
workstream: C1
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [auth, mobile, in-app-browser, public-letter, session]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P840: Mobile session lost when public letter share link is tapped from email

## Summary

A user who signed up earlier the same day on their mobile phone (same device, same email client) was unauthenticated when they tapped a public letter share link delivered via email — despite never closing the browser or restarting the phone.

## Root Cause

Under investigation. Working hypothesis: Gmail mobile in-app WebView creates a fresh, isolated cookie jar per link-tap session. The session cookie set during the signup-via-WebView flow does not survive to a subsequent WebView spawned by a later link tap, so the public share link route (no token, relies on existing session cookie) loads unauthenticated.

This is consistent with the observed evidence:

- Both touchpoints were Gmail-delivered links (signup link + public share link).
- The signup path ran the server-side `confirm-letter-response` edge function (anon→signup flow) — no client-side `google_auth_initiated` or `signup_magic_link_sent` Mixpanel events fired, which matches DB-only evidence.
- The user did not close the browser or restart the phone between touchpoints; only "went to email" — which on mobile typically means the OS spawns a new WebView instance.

To be falsified in `/reproduce` by Playwright contexts simulating WebView → fresh-WebView handoff (different storage state) vs same-context control. If both fail to authenticate, the cause is elsewhere (cookie attributes, RLS, public-letter route explicitly clearing auth).

## Reproduction Steps

1. As founder: seal a public-mode letter and add a recipient by email (recipient does not yet have a CP profile).
2. Recipient receives delivery email, taps the per-receiver link from their mobile Gmail app — `confirm-letter-response` edge function creates the profile; recipient lands authenticated inside the Gmail WebView.
3. Founder copies the public share URL (no token, the shareable letter URL) and sends it to the same recipient via the platform's email-sending function (a second Gmail email).
4. Recipient taps the second link from the same Gmail app, same phone, same session — without restarting phone, without explicitly closing the WebView.
5. Observe: recipient lands on the public letter page as **anonymous**. `currentUser` is null. `letter_opened` fires with `distinct_id=undefined`. The public-share path runs the anon branch in `letter-reading-page.tsx`.

**Reproduction rate:** 100% in-person observation on 2026-05-14 (n=1, founder physically present). To be confirmed as 100% reproducible via Playwright canary in `/reproduce`.

## Expected Behavior

A user who is already authenticated on the device should be recognized as authenticated when they tap the public share link from the same email client on the same device, regardless of whether the OS spawns a new WebView instance. The public letter page should show `currentUser` populated and skip the anon-buffer branch.

## Actual Behavior

User lands anonymous. The anon branch runs. `letter_opened` fires with `distinct_id=undefined`. Per-receiver delivery state (already linked via `receiver_profile_id`) is not associated with the viewing session, even though the underlying account exists and the prior session was on the same device.

## Affected Files

- `src/app/pages/letter-reading-page.tsx` — anon branches at ~lines 803, 917; reads `currentUser` to gate authenticated path.
- `src/app/lib/supabase/client.ts` — Supabase client init (cookie config, `detectSessionInUrl`, `flowType`) — suspected area.
- `src/app/auth/callback/route.ts` or equivalent — OAuth/edge-function callback that persists session cookie — suspected area.
- `supabase/functions/confirm-letter-response/` — anon→signup edge function; needs verification of whether the response sets a session cookie reachable to subsequent same-origin WebView requests, or only returns tokens consumed client-side.
- Cookie attributes (`SameSite`, `Secure`, `Domain`) on the session cookie — suspected area; may be incompatible with in-app WebView storage partitioning.

## Severity

**High** — affects new-user activation when the activation funnel relies on email-delivered links being opened from mobile in-app browsers. Concrete evidence is n=1 in-person, but the failure mode is structural (in-app browser cookie isolation), so the latent impact spans a class of users, not one. Workaround for the user (open in system browser) is non-obvious. Not critical because the broader app and authenticated desktop flows are unaffected.

## Fix Approach

Investigation-first. In `/reproduce`:

1. **Falsify the in-app-browser-isolation hypothesis.** Playwright with two `browser.newContext()` instances both routed via `storageState` snapshots — context A signs up, context B opens the public link with a *separate* storage state (simulates fresh WebView). Control: same-context open. If A→B fails and same-context succeeds → hypothesis confirmed; the fix space is "session persistence beyond per-WebView storage" (durable token via URL/localStorage, or recognizing the user from the per-receiver delivery's `receiver_profile_id` even on the public-share route).
2. **If both contexts fail** → cause is in our code, not WebView isolation. Check: cookie `SameSite`/`Secure`/`Domain` attributes, public-share route auth handling, `confirm-letter-response` cookie-setting behavior.
3. **Surface audit:** any other route relying on session cookie surviving a WebView re-spawn (post-signup celebration, magic-link return, OAuth return).

Candidate fix directions (pre-investigation):

- If hypothesis confirmed: route public share-link visitors through a brief identity-check that consults `letter_deliveries.receiver_profile_id` when the email-recipient match is available (e.g., delivery_id encoded in the share link or recoverable from a 1-tap re-auth nudge).
- Alternative: surface a banner "Looks like you're signed up — sign in to see your letter" on the public-share page when the URL came from an email referrer or a known recipient.
- Long-term: PWA install nudge for users who arrive via email links (avoids WebView entirely on subsequent visits).

[FOUNDER DECISION: which fix direction to commit to — depends on /reproduce findings.]

## Acceptance Criteria

- [ ] `/reproduce` produces a failing Playwright canary that reproduces the auth-loss in a fresh-WebView (separate storageState) context, and the same canary passes in a same-context control.
- [ ] `reproduce_artifact` block populated in this spec's frontmatter with root cause confirmed.
- [ ] Fix direction selected by founder (see Fix Approach `[FOUNDER DECISION]`).
- [ ] After fix: same Playwright canary passes — recipient lands authenticated on the public share link from a fresh-WebView context.
- [ ] No regression in same-context open (existing happy-path letter view continues to work).
- [ ] Mobile real-device manual UAT: founder + one recipient confirm in-person that the failure mode no longer occurs.
- [ ] No console errors or Sentry events during the fixed flow on mobile Safari and Android Chrome.

## Evidence Trail

Anonymized per `feedback_anonymize_incident_details` — no PII in this spec.

- **Affected user:** distinct_id `75ef7019-085b-4cba-8b70-0d8da03c2f64`
- **Letter:** id `23071b16-6f0d-411a-aac0-e982e40130f6`
- **Delivery:** id `f4a7e0ca-6083-4f2b-8e41-787b2d000f02`, status `opened`, opened_at `2026-05-14T21:03:00 UTC`
- **Signup observed:** 2026-05-14T10:26:20 UTC (profile created via anon→signup edge function path, ~7 min after delivery row created at 10:19:47)
- **In-person observation:** founder physically present with recipient when public share link was tapped on recipient's mobile phone; recipient confirmed no phone restart, no browser close between signup and the failed open
- **Mixpanel signal:** all 3 `letter_opened` events on 2026-05-14 have `distinct_id=undefined`; zero `google_auth_initiated`/`signup_magic_link_sent`/`signup_page_viewed` events fired across 2026-05-13 → 2026-05-15, consistent with the server-side anon→signup edge function path (no client telemetry hook)
- **Base commit at time of reporting:** `82b57f00`
