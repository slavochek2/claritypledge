---
status: week
type: story
rank: 106
workstream: C1
created_date: '2026-09-16'
tags: [auth, magic-link, events, activation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
pipeline_plan: [create-spec, challenge-prd, architect, generate-tests, dev, verify]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1325: The signup link only works in the browser that asked for it

## Problem

**Situation:** Almost every new account starts from an event page: enter name and email, get a
"Check Your Email" screen, click the link in the email, land signed in with the seat reserved.
The link carries a PKCE `?code=` that can only be exchanged in the browser holding the matching
verifier in `localStorage` (`flowType: 'pkce'`, `src/lib/supabase.ts:16`, deliberate since P608).

**Complication:** People open the email somewhere else — phone mail app, another browser, a
private window. There, `@supabase/auth-js` 2.84.0 silently declines to treat the URL as a callback
(`_isPKCECallback` requires the verifier, `GoTrueClient.js:1535`), no exchange request is made,
and the page says "Link Expired or Invalid". Worse, by then the link is already **spent**: the
GET to `/auth/v1/verify` consumed the token and confirmed the email before the browser ever
loaded. Nothing the person does with that email can work again.

Measured (Mixpanel `auth_callback_failed`, a floor — it no-ops under tracker blockers):
June–July 4 events; **Aug 1 – Sep 16: 17 events, ~10 episodes, 6 of them this exact shape**
(`no_session` with `?code=` in the URL), 4 `otp_expired`. Nearly all are event-RSVP signups.
Three September people never got in at all. Evidence and per-case table:
`.private/incidents/2026-09-16-signup-link-opened-in-other-browser.md`.

> Founder framing, verbatim: *"Okay, and is this a problem that he did or something that we need to fix?"*

Answered in conversation by the rule that a person doing something normal — opening the mail on
another device, asking for a resend — must not break the flow.

**Question:** How do we let a person finish signup from wherever they open the email, without
making the link easier for mail scanners to burn than it is today?

### A premise this spec corrects

decisions.md 2026-09-03 records the cross-browser break as the price of P608's protection
against link pre-fetchers, and rejects moving the callback to `token_hash` "while the prefetch
question is open". The 2026-09-16 prod log shows the premise does not hold for **consumption**:
`GET /verify` → `303 user_signedup`, `email_confirmed_at` set, and no `/token?grant_type=pkce`
ever followed. The token was spent by the GET alone. PKCE stops a scanner from *obtaining a
session*; it does not stop a scanner from *burning the link*. A link that is only redeemed when
page JavaScript runs `verifyOtp` survives any non-executing fetcher, which today's link does not.
**UNTESTED** against a JS-executing scanner (Defender Safe Links) — for those, both designs are
presumed equal, and that presumption is what the acceptance test checks.

## Appetite

- **Blast radius:** high — every new signup and every emailed login.
- **Reversibility:** high — the link format lives in two hosted email templates; reverting is
  restoring the saved template text. The app-side change is additive to an existing route.
- **Decision density:** low — two copy calls (below). The technical direction is evidence-led.

## Invariants

- `AuthCallbackPage` remains the **only** writer of profiles and the only place post-auth intent
  (`redirect`, `action=rsvp`, auth-gate params) is executed. The new path establishes a session
  and hands off to it — the P1257 pattern (decisions.md 2026-09-07).
- `flowType: 'pkce'` stays on. `/auth/callback` keeps handling `?code=` links exactly as today,
  so any mail already sitting in an inbox when the template changes still works.
- Nothing forwarded from an email link may widen where a person can be redirected: a carried
  redirect target is accepted only if it is this site's `/auth/callback`, and the existing
  `isSafeRedirectPath` check downstream is not weakened.
- `AuthCallbackPage.tsx` carries "DO NOT MODIFY WITHOUT E2E TEST APPROVAL" — any edit to it
  needs E2E coverage first.

## Solution

**Part 1 — the link works in any browser.** Change the hosted *Confirm signup* and *Magic link*
email templates so the button points at the existing `/auth/verify` route with the template's
token hash and the original redirect target, instead of GoTrue's `/auth/v1/verify` URL.
`/auth/verify` redeems it with `verifyOtp({ token_hash, type })` and hands off to
`/auth/callback` with the original `source`/`redirect`/`action` intact. Make `/auth/verify`
understand the carried redirect target (today it only forwards flat query params). Change
**test** first, prove it end-to-end with a real inbox and a *different* browser context, then prod.

**Part 2 — the code in the email is a fallback when the link can't be used.** Put the one-time
code (prod `mailer_otp_length = 8`) in the same emails, and add a "type the code" field to the
"Check Your Email" screens, verified with `verifyOtp({ email, token, type })` in the tab the
person is already in, then the same hand-off to `/auth/callback`. This covers mail clients that
disable links (the Outlook junk case in P1258) and people who read mail on one device and sign up
on another. `/architect` confirms the exact list of screens; grep today finds
`signup-page.tsx`, `login-form.tsx`, `sign-pledge-page.tsx`.

Part 2 ships only if `/challenge-prd` and `/architect` keep it; Part 1 stands alone.

[FOUNDER DECISION: email wording around the button and the code — draft proposed at the review
gate, in the conversational tone decisions.md records for email templates.]
[FOUNDER DECISION: the words on the "Check Your Email" screen for the code field — draft proposed
at the same gate.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Template edit breaks every signup at once | MITIGATE | Test project first with a real inbox; save the prod template text before editing; revert is a paste |
| Mails already sent carry the old `?code=` link | ACCEPT | `/auth/callback` is untouched, so they behave exactly as today |
| `verifyOtp` with a token hash rejects a PKCE-issued token | MITIGATE | UNTESTED; the first thing the test-project run proves. If it fails, Part 1 is dead and Part 2 carries the fix |
| JS-executing scanner (Defender) burns the new link | ACCEPT | Burns today's link too (see premise); Part 2's code survives because typing it needs a person |
| Carried redirect target becomes an open-redirect vector | MITIGATE | Invariant above; unit tests for foreign origin, other path, malformed URL |
| Code brute force | ACCEPT | 8 digits, 1-hour expiry, `rate_limit_verify = 30` on prod |
| A resend still kills earlier mails | DEFER | Inherent to single-use tokens; Part 2's screen names the newest mail. Unblocked by founder copy decision |
| Existing tests assume `/auth/v1/verify` links | MITIGATE | `/generate-tests` greps e2e for link parsing before the template changes |

**Non-Goals**
- Do NOT turn PKCE off or change `/auth/callback`'s handling of `?code=`.
- Do NOT change the sending provider or headers — that is P1258.
- Do NOT touch session persistence after sign-in — that is P1240.
- Do NOT change rate limits or resend throttling.

## Acceptance Criteria

- [ ] On **test**, a signup started in browser context A, with the email's link opened in a fresh
      context B (no shared storage), lands signed in with the event RSVP created — captured by
      screenshot plus a DB read of the RSVP row.
- [ ] Same run, opening the link a second time shows the "can't be used" page, not a crash, and a
      person already signed in stays signed in.
- [ ] A non-executing fetch (`curl`) of the new link, followed by a real browser click, still
      signs the person in — the scanner-burn premise verified, not assumed.
- [ ] (Part 2) Typing the code on the "Check Your Email" screen signs in and reserves the seat,
      with no link clicked.
- [ ] A link from the old template, still in an inbox, behaves exactly as before in the
      requesting browser.
- [ ] Prod templates changed only after the test run above, with the previous text saved to
      `.private/`. `[post-deploy]` one real prod signup completed cross-browser.

## Done-When

- [ ] Both founder copy decisions recorded in this spec.
- [ ] decisions.md entry correcting the 2026-09-03 premise, citing the log evidence and the test result.

## Alternatives Considered

- **Error-page copy only** ("open it in the browser you signed up in") — rejected: the link is
  already spent when that page shows, so the advice cannot be followed from that email.
- **Code entry only, link unchanged** — keeps the dead-link experience for the 6-of-10 shape; the
  person must know to go back to the original tab. Kept as Part 2, not as the whole fix.
- **Turn PKCE off (implicit flow)** — rejected: tokens in URL fragments, and it gives up the
  session protection P608 bought for nothing Part 1 doesn't already provide.

## Related

P608 (PKCE introduced) · P1240 (session loss after sign-in; decisions 2026-09-03 premise) ·
P1257 (`/auth/verify` route, done) · P1258 (junk placement, links disabled) · P1228 (callback
failures rising) · decisions.md 2026-09-03 [technical], 2026-09-07 [technical]
