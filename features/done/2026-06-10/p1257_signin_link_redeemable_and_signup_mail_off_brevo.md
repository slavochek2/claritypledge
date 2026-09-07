---
status: all-done
type: task
rank: 1000075
workstream: C1
created_date: '2026-09-07'
tags: [auth, email, deliverability, magic-link]
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
completed_at: 2026-09-07
---

# P1257: No sign-in link we mint is redeemable, and nothing tells us when someone is stranded

> **Scope note (title corrected at ship time).** This spec originally also covered the Outlook
> junk-mail defect, and the filename still carries that history. That half shipped nothing and
> moved to **P1258** — do not read this spec as having fixed deliverability. The junk-mail
> evidence stays below because it is the same investigation, and P1258 depends on it.

## Problem

**Situation:** A person tried repeatedly to register for the 2026-09-06 hike and never got in. The
founder's report, 2026-09-07:

> "she tried to register once or multiple times for the event, for the hike, and it seems that she
> says that she didn't find the registration link, not even in the spam"

> "Login registration should work and if it doesn't, then we should catch it, check it."

**Complication:** the 2026-09-07 investigation found **two independent, separately-proven defects**,
neither previously named. Full evidence: `.private/incidents/2026-09-07-magic-link-outlook-junk.md`.

**Defect A — no minted sign-in link is redeemable.** `admin.generateLink` returns an implicit-flow
`#access_token=` URL. `src/lib/supabase.ts` sets `flowType: 'pkce'`, and auth-js
(`GoTrueClient.js`, `callbackUrlType === 'implicit'`) throws `AuthPKCEGrantCodeExchangeError`
rather than consuming it. Verified end-to-end this session: a freshly minted, unexpired link
rendered "Link Expired or Invalid" with **zero** Supabase keys in `localStorage`. Three pages
redeem `?token_hash=` (`letter-response-confirm`, `accept-agreement`, `letter-reading`); grep of
`src/` for `auth/verify` returns nothing — **there is no generic sign-in landing page**, so we
cannot hand a stranded person a working link at all.

**Defect B — Brevo-sent signup mail is junked with its links disabled.** Reproduced on prod
through the real UI with an aged Outlook account: the confirmation mail landed in **Junk Email**
and Outlook **disabled its links** ("Show blocked content and enable links"), so the Confirm
button is dead until the reader takes a second action. Microsoft's own verdict header on that
message: `spf=pass`, `dkim=pass header.d=claritypledge.com`, `dmarc=pass`, `compauth=pass
reason=100`. Authentication is definitively not the cause. What remains is a shared bulk IP plus
**bulk-marketing headers on transactional mail** — `List-Unsubscribe-Post: One-Click`,
`Feedback-ID`, `x-csa-complaints`, added by Brevo.

**Question:** make a sign-in link we mint actually redeemable, and get self-service signup mail off
the bulk path — without touching the PKCE mitigation P608 exists to provide.

## Appetite

Blast radius: **high** — signup is the front door; a regression strands everyone, not one person.
Reversibility: **high by construction** — every change here is additive (a new route, a new send
path alongside the existing one); nothing is switched off. Decision density: **low for this spec**
(one copy decision). The guest-RSVP-for-events question raised the same session is a separate
product call and is **not** in scope here.

## Invariants

- **`flowType: 'pkce'` stays.** P608 enabled it so link pre-fetchers could not consume single-use
  tokens, after a real signup-blocking incident (`decisions.md` 2026-03-30). Nothing in this work
  may change, bypass or conditionally disable it.
- **`/auth/callback` is not converted to `token_hash`.** `decisions.md` 2026-09-03 rejected exactly
  that, on the grounds that the prefetch question is unresolved and getting it wrong reproduces a
  signup-blocking incident. The new page is **additive and on its own route**; the existing
  callback is untouched.
- **No bulk-sender headers on transactional mail.** `decisions.md` 2026-06-17 already ruled that
  `List-Unsubscribe` is a bulk-sender signal that pushes mail toward Promotions. Any new send path
  must not add it.
- **The anonymous signup surface must not become an email-enumeration oracle.** P684/P877 closed
  it; `request-letter-response-signin` mints a link on **both** branches specifically to equalise
  timing. Nothing here may surface "no such account" or a bounce to an unauthenticated caller.

## Solution

Three additive pieces.

1. **A generic `/auth/verify?token_hash=` page.** Calls
   `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`, modelled on
   `src/app/pages/letter-response-confirm-page.tsx` (the same mechanism already running in
   production for letter responses). Routed in `src/App.tsx`. On success, hand off to the existing
   post-auth path; on failure, an honest error with a route back to signup that does not loop.
   This is what makes an operator-minted recovery link work, and it is the missing half of P1086.

2. ~~Route self-service signup mail through Mailgun.~~ **MOVED TO P1258 — not shipped here.**
   Both candidate designs carried blockers under adversarial review, so this is now a research
   question with pre-registered decision criteria rather than an implementation task. Nothing in
   this spec changes how a single email is sent.

3. **Reconciliation monitoring.** A scheduled check for auth users with `email_confirmed_at IS
   NULL` older than 24h, so a stranded person surfaces without waiting for someone to tell the
   founder. Output goes to a **private** channel — never a GitHub issue; the repo is public and
   the payload is user email addresses.

Also in scope, cheap and evidence-backed: the confirmation email copy — the literal brackets in
`Confirm Your Email - [ClarityPledge]`, the grammar error `If you didn't signed up`, and the
`Infrastructure powered by Supabase` footer.

~~[FOUNDER DECISION: subject line and body wording for the confirmation email.]~~ **MOVED TO
P1258** — carried there verbatim, still open. Left struck-through rather than deleted so a reader
of this closed spec does not conclude the decision was made; it was not.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A new sign-in page is a security-sensitive surface | MITIGATE | Copy `letter-response-confirm-page.tsx` rather than inventing; single-use `token_hash`, no user-controlled redirect target |
| A `token_hash` link in an inbox may be consumed by a scanner before the human clicks | MITIGATE | This is the **UNTESTED** hypothesis recorded in `decisions.md` 2026-09-03, whose named falsifier is "send a token_hash link to a Microsoft 365 mailbox and check whether the token is consumed before a human clicks." We now have that mailbox. Run the falsifier **before** any user is switched to the new path |
| Deliverability fix cannot be proven for the affected person's specific mailbox | ACCEPT | Mailbox-level rules are not observable from outside; the rig is the closest available proxy |
| Monitoring output leaks user emails | MITIGATE | Private channel only. All 6 existing scheduled gates route to GitHub issues; this one must not |

*Two rows removed at close: they weighed risks of owning the mail send path, which this spec
never shipped. Both moved with the work to P1258 — do not read their absence as a decision
that those risks are gone.*

**Non-Goals**
- Do NOT change `src/lib/supabase.ts` or the PKCE flow type.
- Do NOT modify `/auth/callback` or `AuthCallbackPage.tsx` in this spec (it carries a
  do-not-modify-without-E2E-approval header; P1086 owns that decision).
- Do NOT add SPF/DNS changes — `compauth=pass reason=100` proves authentication is not the cause.
- Do NOT surface bounces or "no such account" on the anonymous signup screen — that rebuilds the
  enumeration oracle P684/P877 closed.
- Do NOT decide guest RSVP for events here.
- Do NOT contact the stranded users in bulk — at least one is an edge-function-created letter
  recipient, not a signup, so blanket outreach would be unsolicited contact.

## Scope, narrowed at ship time

This spec now covers **only** the two halves that were built and verified: the redeemable sign-in
link, and monitoring for people who never get in. Changing how mail is sent moved to
**P1258** — not deferred casually, but because adversarial review found both candidate designs
carried blockers (see "Adversarial review outcome" below). Neither half here touches how mail is
sent, so nothing in P1258 gates anything here.

## Done-When

- [x] A link of the form `/auth/verify?token_hash=…`, minted by hand for a real account, establishes
      a session and lands the person signed in — **verified in a real browser** against the test
      project: minted a live `hashed_token`, opened it, `localStorage` held
      `sb-<project>-auth-token` with the expected user, and the app landed signed in on `/feed`
- [x] The same link, replayed a second time, does not establish a session and shows an honest error
      with a route out that is not the failing loop — **verified in the same browser session**:
      heading "This link can't be used", token stripped from the URL, and the existing session was
      **not** destroyed
- [x] A network failure does not burn an unspent link — added after review found the opposite
      (the token was stripped before the call). Covered by unit tests asserting the token survives
      and the page offers retry rather than telling the user to request a new link
- [x] Signup through the existing UI still works end-to-end after the change — full unit suite
      **3725 passed, 0 failed**; the change is additive (a new route) and touches neither
      `signup-page.tsx` nor `AuthCallbackPage.tsx`
- [x] The reconciliation check reports a known-stranded account and reports nothing when there is
      nothing to report — **both directions exercised against live prod data**: default run exits 1
      (`stranded_signups=2` of 145 users), and with the grace window widened it exits 0
      (`stranded_signups=0`). The missing-credential path exits 2 rather than reporting clean.
- [x] The OTP type list matches the SDK's real union — verified against
      `node_modules/@supabase/auth-js` rather than from memory, after review found two valid types
      missing

Moved to **P1258** (all belong to the mail-transport half): the prefetch falsifier, the
`List-Unsubscribe`/`Feedback-ID` header check, Outlook placement measurement, and the founder copy
decision.

## Pre-deploy Checklist

**N/A — this spec ships no new edge function, no new API key and no new third-party service.**
The Mailgun credential items that stood here moved to P1258 with the work that needed them.

One operational note, not a blocker: the scheduled workflow for the stranded-signup check is
**not** in this ship. `.git/hooks/pre-commit` is a byte copy of main's script, so it still runs the
pre-fix secret scanner and rejects a workflow naming a service-role secret. It lands once this
ship reaches main and the hook is re-synced — the script itself is shipped and runnable by hand.

## Alternatives Considered

- **Leave it and fix only the wording.** Cheapest, and the wording defects are real — but the mail
  still leaves a shared bulk IP with bulk headers, which is the part Microsoft's own header points
  at. Not sufficient alone; folded in as a sub-change instead.
- **Add `include:spf.brevo.com`.** Rejected with proof rather than argument: `spf=pass`,
  `dkim=pass`, `dmarc=pass`, `compauth=pass reason=100` on the junked message. P608 rejected this
  in 2026-03-30 on reasoning; this session's header capture settles it.
- **Google sign-in only.** Rejected — the affected person is on Hotmail. This option would have
  blocked the exact user who triggered the investigation.
- **Numeric code instead of a link.** Does not address Junk placement; the person still has to find
  the message. Keeps the door open as a later addition, not a substitute.
- **Convert `/auth/callback` to `token_hash`.** Rejected by `decisions.md` 2026-09-03 and preserved
  as an invariant above.

## Rollback Strategy

Both shipped pieces revert independently and neither replaces a working path:

- The `/auth/verify` route can be removed without touching `/auth/callback` — it is additive, and
  no existing flow routes through it.
- The stranded-signup check is a standalone script plus (later) a scheduled workflow. Deleting
  either changes no application behaviour; it reads and reports, and writes nothing.
- Google sign-in and the existing signup path are untouched throughout.

**No mail-sending change ships here**, so there is nothing to roll back on that axis — the earlier
version of this section described a Mailgun path that was never built. Its rollback question now
belongs to P1258, where it is a live concern: the design rejected there could NOT be rolled back
cleanly, which is part of why it was rejected.

## Open Questions

1. Does an Outlook/Microsoft 365 scanner consume a `?token_hash=` link before the human clicks?
   **UNTESTED** — the falsifier is a Done-When above and gates rollout.
2. Should the existing GoTrue/Brevo confirmation mail be disabled once Mailgun is proven, or should
   both send? Deliberately deferred until the rig produces a measurement.
3. **How the Mailgun path is wired — found during implementation, not anticipated by this spec.**
   Following `request-letter-response-signin` literally means adding a **fourth**
   anonymously-callable mail-sending edge function. `features/p1225_no_rate_limit_on_anon_mail_sending_functions.md`
   (open, severity medium, filed 2026-09-01) records that the existing three have **no per-IP or
   per-target rate limit at all**, so this would knowingly widen a live security defect.

   The alternative is Supabase's **Send Email Hook**: GoTrue calls our function for every auth
   email and we send it via Mailgun. It adds no anon-callable endpoint, keeps GoTrue's own rate
   limits in front, and covers login/signup/recovery in one place rather than signup only.
   Its cost is that it **replaces** GoTrue's sending rather than running beside it, which
   contradicts the "nothing is switched off" property this spec leans on — so it is a founder
   call, not an agent one. P608 rejected this hook in 2026-03-30 as "overkill at current volume";
   that judgement predates the Outlook reproduction and should be re-taken on the new evidence,
   not inherited.

## Adversarial review outcome — the Send Email Hook is WITHDRAWN as the recommendation

One reviewer spawned, one reported. Findings re-verified by command before being recorded here.

**A-1 (blocker), the reason this changed.** The hook has a 5-second deadline, and its documented
failure mode is not "the mail is late" — it is `supabase.auth.signUp` failing with **no
`auth.users` row created**, while the person may still receive a working-looking confirmation mail
(supabase/supabase discussions #34199, issue #29270). That is strictly worse than today: the
current failure at least leaves a row with `confirmation_sent_at`, which is the only reason this
incident was diagnosable at all, and is exactly what the new reconciliation check keys on. The hook
would create a failure class **structurally invisible** to the monitoring built in the same spec.
There is no documented fall-back-to-SMTP path, so the Appetite section's "nothing is switched off"
is **false for the hook** and true for everything else here.

**A-2 (blocker).** "Route mail through Mailgun" and "change the link shape to `token_hash`" are two
changes, and bundling them puts the **untested** prefetch hypothesis on the critical path for 100%
of logins on day one, with no partial rollout.

**Corrected verdict.** Do not adopt the hook now, and do not adopt the rejected fourth-anon-function
either. Split the work: (1) the `/auth/verify` page and the reconciliation check ship as they are —
both additive, neither touches how mail is sent; (2) **run the prefetch falsifier first**, since it
is cheap, decisive, and already gates the design; (3) choose transport only afterwards.

**Also recorded, unresolved:** `mg.claritypledge.com` carries Ghost newsletters and has live MX
(`decisions.md` 2026-06-17, P942) — putting signup mail there risks the reputation contagion that
killed P942. A dedicated auth subdomain should be priced in before any transport move. And the
prefetch hypothesis is weaker than `decisions.md` 2026-09-03 states: Microsoft Defender Safe Links
**executes JavaScript**, so a test that does not run against a Defender tenant is a false pass.

## Related

- `features/p1086_e2e_magic_link_tests_timeout_authcallback_missing_pattern_b.md` — same root
  cause (PKCE vs implicit-flow links), scoped to the E2E helper. This spec fixes the production
  half; P1086's own decision (fix helper vs Pattern B) stays open.
- `features/p1240_mobile_session_loss_measure_before_building.md` — source of the `token_hash`
  invariant and the untested prefetch hypothesis.
- `features/done/2026-03-30/p608_magic_link_reliability.md` — the PKCE mitigation this must not
  undo; also rejected SPF changes, now proven correct to have done so.
- `.private/incidents/2026-09-07-magic-link-outlook-junk.md` — all evidence, including user
  addresses (private).
