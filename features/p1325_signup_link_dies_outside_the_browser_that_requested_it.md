---
status: qa
type: story
rank: 106
workstream: C1
created_date: '2026-09-16'
tags: [auth, magic-link, events, activation]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, challenge-prd, dev, ship]
pipeline_plan: [create-spec, challenge-prd, dev, verify]
pipeline_skipped: ["architect -- security design settled by two external adversarial reviews plus four live experiments on test; Technical Design section below", "generate-tests -- tests written test-first inside /dev against the Technical Design"]
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
(`no_session` with `?code=` in the URL — the verifier was absent in the browser that opened the link, whether that was another browser, cleared storage or a private window), 4 `otp_expired`. Nearly all are event-RSVP signups.
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

**Verified on the test project, 2026-09-16** (`supabase-js` with `flowType: 'pkce'`, magic-link
mail to the ops mailbox, token hash read from `auth.one_time_tokens`, which carries the `pkce_`
prefix):

| # | Experiment | Result |
|---|---|---|
| E1 | Mail requested in client A (verifier stored); `verifyOtp({ token_hash, type: 'magiclink' })` from a fresh client B with empty storage | **session established** — cross-browser redemption works for PKCE-issued tokens |
| E2 | Plain `GET /auth/v1/verify?token=…` (today's link shape, no JS), then `verifyOtp` from client B | GET → `303` with `?code=`; `verifyOtp` → **"Email link is invalid or has expired"** — a non-executing fetch burns today's link |
| E3 | Same as E1 with `type: 'email'`; then the same hash again | **session**; replay → **rejected** |
| E4 | Test user set unconfirmed; PKCE `signInWithOtp` issues a `confirmation_token` (`pkce_`); `verifyOtp({ token_hash, type: 'email' })` from a fresh client | **session**, email confirmed — the signup type works |

Not yet covered: whether the hosted template's `{{ .TokenHash }}` renders the stored hash, and how
`{{ .RedirectTo }}` is escaped — the first steps of the test-project template run.

## Appetite

- **Blast radius:** high — every new signup and every emailed login.
- **Reversibility:** high — the link format lives in two hosted email templates; reverting is
  restoring the saved template text. The app-side change is additive to an existing route.
- **Decision density:** zero after review — the email wording does not change, only the link target.

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

**The link works in any browser.** Change the hosted *Confirm signup* and *Magic link* email
templates so the button points at the existing `/auth/verify` route with the template's token
hash and the original redirect target, instead of GoTrue's `/auth/v1/verify` URL. `/auth/verify`
redeems it with `verifyOtp({ token_hash, type: 'email' })` — verified for both token types (E1,
E4) — and hands off to `/auth/callback` with `source`/`redirect`/`action` intact. Change **test**
first, prove it end-to-end, then prod, and only after the app code is live.

Hardening that ships with it, because this change routes **every** signup through `/auth/verify`
(each item came out of review and was verified, see below):

1. **Carried redirect is parsed, not forwarded.** `redirect_to` is accepted only when it parses as
   an absolute URL whose origin is this site and whose path is exactly `/auth/callback`; only its
   query params are forwarded. Anything else is dropped (sign-in still proceeds, to the default
   destination). The existing flat-param forwarding stays for P1257 operator links.
2. **A transient failure never destroys the link.** supabase-js *returns* network failures and
   5xx as `AuthRetryableFetchError` rather than throwing (`lib/fetch.js` `handleError`), so the
   page's `.catch` branch never sees them: today a network blip strips a still-good token and says
   "can't be used". Retryable errors (and 429) must keep the token and offer "Try again".
3. **Already signed in → carry on.** If redemption fails but this browser already holds a
   session (the link was clicked twice), go to the allowlisted destination page instead of the
   error page — never through the callback, which would run its actions (code review, below).
4. **The failure page keeps the RSVP intent.** "Send me a new link" carries the allowlisted
   `redirect`, `action` and auth-gate params, and goes to `/signup` for a failed signup and
   `/sign-pledge` for a failed pledge — `/login` refuses anyone without a profile, which is exactly
   the person whose confirmation just failed.
5. **The token never reaches analytics.** Mixpanel autocaptures every pageview with the full URL
   and records 100% of sessions (`index.html` init); today only `/live` room codes are redacted
   (P1304). Extend that redaction to `token_hash`, `code`, `access_token`, `refresh_token`, and turn
   session recording off on `/auth/verify`. Same for Sentry's URL redaction. (Mixpanel already
   holds one full `#access_token=` URL from 2026-09-07.)

Templates must not interpolate user-supplied metadata (name) — the link is the only change.

## Technical Design

- **Template href** (both templates, both the VML and the HTML button):
  `https://claritypledge.com/auth/verify?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}`
  — host written literally because prod `site_url` ends in `/`. **Verified live on test:** GoTrue
  renders `{{ .RedirectTo }}` URL-escaped with lowercase hex, `{{ .TokenHash }}` equals the stored
  hash, and Brevo wraps the link in its click-tracking redirect without breaking it. The parser
  therefore accepts only the escaped form.
- **`AuthVerifyPage.tsx`**: add `redirect_to` parsing (1), error classification (2), session check
  on failure (3), intent-preserving CTA (4). `type` from the link is still allowlist-parsed.
- **Redaction**: extend the P1304 hook in `index.html` and `src/lib/sentry-filters.ts` with an
  auth-token pattern; recording off when `pathname === '/auth/verify'`. The existing test asserting
  the two patterns stay identical must keep passing.
- **`AuthCallbackPage.tsx` is not modified.** `/auth/callback` keeps handling `?code=`.
- **Rollout order**: app code live on prod → prod templates changed (previous text saved to
  `.private/`) → one real cross-browser signup. Revert = paste the saved template.

## Adversarial Review — 2026-09-16

Run in place of the `/challenge-prd` skill, as the founder asked: **Codex (gpt-5.6-sol)** with repo
access and **Gemini (gemini-3.8-flash, served model verified)** on the spec plus source.
**Reports: 2 of 2.** Every load-bearing claim was re-run before being accepted or rejected.

| Finding | Source | Verdict | Disposition |
|---|---|---|---|
| Signup token type unproven | both, BLOCK | **Resolved by test** — E4: PKCE signup token redeemed from a fresh client, `type: 'email'` | Design uses `type: 'email'` for both templates |
| Login CSRF: attacker forwards own link, victim lands in attacker's account | Codex, BLOCK | **Real, pre-existing** — the token in today's GoTrue link *is* the hash (E2 passed the stored hash as `token=` and GoTrue accepted it), and `/auth/verify` has been live since P1257, so anyone can build this link today | ACCEPT — not widened by this spec. A user-gesture interstitial would narrow it; out of scope, noted |
| Token in URL reaches logs / analytics before stripping | Codex, BLOCK | **Real, pre-existing, and widened** — Mixpanel pageview autocapture + 100% session recording, redaction covers room codes only | MITIGATE — hardening 5 |
| Nested `redirect_to` drops RSVP intent / open redirect | both | Real | MITIGATE — hardening 1 |
| 5xx / 429 / network failure strips a good token | Gemini (Codex: related) | **Confirmed, worse than stated** — retryable errors are returned, not thrown | MITIGATE — hardening 2 |
| Re-click while signed in shows a dead-end error | Gemini | Real (no session check, read in code) | MITIGATE — hardening 3 |
| Failure CTA drops RSVP intent | Codex | Real (`/login` with no params) | MITIGATE — hardening 4 |
| Open redirect via `/events/..//attacker.com` in the allowlist | Gemini | **Rejected** — `new URL('/events/..//attacker.com', origin)` resolves to `https://claritypledge.com//attacker.com`; navigation is same-origin | None |
| "6 cross-browser cases" over-attributed | Codex | Fair — the shape proves the verifier was **absent**, not why (other browser, cleared storage, private mode) | Wording fixed; the fix covers every cause of an absent verifier |
| JS-executing scanners (Defender) still burn the link | Codex | Real | ACCEPT — today's link is burned by *any* GET (E2), the new one only by JS executors: strictly better |
| Part 2 (typed code) unjustified by the measurement | Codex | Agreed — one Outlook case, three screens, extra credential form | **Dropped** from this spec; belongs with P1258 if the junk case recurs |
| Brute force of the code | Codex | Moot with Part 2 dropped, and pre-existing: `POST /verify` with email + code is public today | None |
| Template injection | Codex | Valid constraint | Templates interpolate no user metadata |
| Resend reordering | Codex | Real, inherent to single-use tokens | ACCEPT |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Template edit breaks every signup at once | MITIGATE | Test project first with the real signup UI; prod template text saved first; revert is a paste |
| Mails already sent carry the old `?code=` link | ACCEPT | `/auth/callback` untouched — they behave exactly as today |
| Prod template changed before app code is live | MITIGATE | Rollout order in Technical Design; template step checks the deployed bundle contains the `redirect_to` parser |
| `.RedirectTo` escaping differs from the unit-test assumption | MITIGATE | Parser handles raw and escaped; the test-project template run decides |
| Login CSRF via a forwarded link | ACCEPT | Pre-existing since P1257 (see review table) |
| JS-executing scanner burns the link | ACCEPT | Strictly less exposed than today (E2) |
| Redaction regex misses a token shape | MITIGATE | Unit test per shape; `?token_hash=`, `&code=`, `#access_token=`, `refresh_token=` |

**Non-Goals**
- Do NOT turn PKCE off or modify `AuthCallbackPage.tsx`.
- Do NOT add a code-entry field (dropped after review).
- Do NOT change the sending provider, headers or email wording — that is P1258.
- Do NOT touch session persistence after sign-in — that is P1240.
- Do NOT change rate limits.

## Acceptance Criteria

Evidence runs: test project, dev server on the feature branch, 2026-09-16. Scripts and screenshots
were kept in the session scratchpad; results are quoted here.

- [x] On **test**, through the real event signup UI, the email's link opened in a fresh browser
      context (no shared storage) lands signed in with the event RSVP created — both templates
      (magic link, signup confirmation) changed on test, real mail read from the ops mailbox, link
      opened in a new Playwright context → `/events/<slug>/confirm`; RSVP row read from the DB
      (`rsvpCreatedThisRound: true`); page text "You're Registered!"; visual QA PASS at 1280/375/320.
- [x] Opening the same link again in that signed-in browser continues to the event, not an error —
      re-click lands on `/events/<slug>`, no error text (live, after the code-review change).
- [x] Opening a used link in a browser with no session shows "can't be used", and its button keeps
      the event intent — `href="/signup?redirect=%2Fevents%2F<slug>&action=rsvp"`, token stripped
      from the URL, no horizontal scroll at 1280/375/320.
- [x] A `curl` of the new link followed by a real browser click still signs the person in — a plain
      GET of the tracked link (200) before the browser click, both rounds; the click still landed on
      the confirmation page.
- [x] With the network cut at the moment of redemption, the page offers "Try again" and a retry
      after reconnecting signs in — Playwright aborted `/auth/v1/verify`: "Try again" shown, token
      kept in the URL; route restored, click → `/events/<slug>/confirm`.
- [x] A link from the old template still works in the requesting browser — login through the UI in
      context A, GoTrue `/auth/v1/verify?token=` link built from the stored `pkce_` token opened in
      the same context → `/events/<slug>`, no error. `AuthCallbackPage.tsx` is unchanged.
- [x] No Mixpanel or Sentry payload captured during the signup run contains the token value —
      verified against the verbatim `index.html` block and the Sentry hooks (10 tests, both
      redactions mutation-checked); Mixpanel does not load on localhost, so no live payload exists
      to capture pre-deploy. `[post-deploy]` read one `$mp_web_page_view` for `/auth/verify` in
      Mixpanel and confirm `[redacted]`.
- [x] Prod template text prepared and the previous text saved to `.private/docs/p1325-rollout/`
      (read 2026-09-16; 2 links per template replaced, 0 `ConfirmationURL` left), with a
      snapshot-guarded apply/revert script. `[post-deploy]` apply only after the app code is live,
      then one real prod signup completed cross-browser.

## Done-When

- [x] decisions.md entry correcting the 2026-09-03 premise, citing E2 and the review.
- [x] Unit tests: redirect_to parsing (same-origin callback, foreign origin, other path, malformed,
      raw vs escaped), error classification, redaction per token shape — all failing first, then
      passing (16/19 and 10/10 failing before implementation; 44 + 10 passing after; full suite
      4425 passed).

## Code Review — 2026-09-16

Founder asked for Codex Sol and Gemini 3.8. **Reports: 1 of 2.** Codex (gpt-5.6-sol) delivered;
Gemini's wrapper **refused the payload** (exit 2, credential-shape scan matched the obviously fake
test token) and, per its contract, the payload was not altered to get past it — that lens was done
inline instead. A separate visual-QA agent ran twice: FAIL (screenshots taken before paint), then PASS.

| Codex finding | Verdict | Disposition |
|---|---|---|
| BLOCK: signed-in fallback lets a dead link run callback actions for a signed-in victim | Real; the same is **pre-existing** by linking straight to `/auth/callback?action=…` (`AuthCallbackPage` only checks a session exists, line 71) | Fixed for this path: fallback goes to the destination page, never the callback |
| BLOCK: raw `redirect_to` smuggles trailing params | **Rejected** — its example gives `pathname "/auth/callback&action=join-org&…"`, which fails the exact-path check; pinned by a test | Raw form removed anyway: the template renders escaped (verified live) |
| WARN: "still good" copy on 5xx may be wrong if the token was consumed | Real but narrow (response lost after GoTrue consumed it) | ACCEPT — retry then shows "can't be used" with a way out; copy is P1257's |
| WARN: redaction stops at `%` | True in principle; real token hashes, JWTs and codes contain no `%` | ACCEPT |
| WARN: `code` param redacted on every route | No `?code=` producer outside auth exists (`grep` of `src/`) | ACCEPT |
| WARN: recovery drops set-position params | Real | Fixed — carries `pointId`, `position`, `pointTitle`, `letterId` |
| WARN: state update after unmount | Harmless (navigate/setState on a gone page) | ACCEPT |
| NOTE: unit suite mocks GoTrue | True by design | Covered by the live runs above |
| Inline (Gemini lens): failed pledge signup recovers at `/login`, which refuses no-profile users | Real | Fixed — `/sign-pledge` |

## Rollout (after the app code is live on prod)

Not checkboxes — these run after deploy, which the founder triggers.

1. `.private/docs/p1325-rollout/apply.sh check` — prod templates still equal the saved snapshot.
2. `apply.sh apply` — writes the new link into both prod templates (one Keychain dialog).
3. One real signup on prod from a phone mail app or a second browser → seat reserved.
4. Anything wrong: `apply.sh revert`. Mail already sent keeps working either way (AC 6).
5. Two weeks later: `auth_callback_failed` with `no_session` + `?code=` should be ~0 for new mail.

## Alternatives Considered

- **Error-page copy only** ("open it in the browser you signed up in") — rejected: the link is
  already spent when that page shows, so the advice cannot be followed from that email.
- **Code entry (typed code), with or without the link change** — dropped after review: the measured
  failures are link-opened-elsewhere, which the link change fixes; code entry adds a credential form
  to three screens for one Outlook case. Revisit under P1258.
- **Turn PKCE off (implicit flow)** — rejected: tokens in URL fragments, and it gives up the
  session protection P608 bought for nothing Part 1 doesn't already provide.

## Related

P608 (PKCE introduced) · P1240 (session loss after sign-in; decisions 2026-09-03 premise) ·
P1257 (`/auth/verify` route, done) · P1258 (junk placement, links disabled) · P1228 (callback
failures rising) · decisions.md 2026-09-03 [technical], 2026-09-07 [technical]
