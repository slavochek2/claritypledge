---
status: week
type: task
rank: 1000076
workstream: C1
created_date: '2026-09-07'
tags: [email, deliverability, auth, brevo, mailgun]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1258: Signup confirmation mail is junked by Outlook with its links disabled

Split out of P1257 at ship time. P1257 shipped the two halves that were built and verified
(a redeemable sign-in link, and monitoring for people who never get in). This spec carries the
half that was **deliberately not built**: changing how the mail is sent.

## Problem

Reproduced on prod through the real UI with an aged Outlook account (2026-09-07): the signup
confirmation email landed in **Junk Email** and Outlook **disabled its links**, so the Confirm
button is dead until the reader takes a second action. Microsoft's own verdict header on that
message: `spf=pass`, `dkim=pass header.d=claritypledge.com`, `dmarc=pass`, `compauth=pass
reason=100`.

Authentication is therefore **not** the cause and no DNS change will help. What remains is a
shared bulk IP plus bulk-marketing headers on transactional mail (`List-Unsubscribe-Post`,
`Feedback-ID`, `x-csa-complaints`), added by the current provider.

Full evidence: `.private/incidents/2026-09-07-magic-link-outlook-junk.md`.

## Appetite

Blast radius: **high** — signup and login mail for everyone. Reversibility: depends entirely on
the design chosen (see below — the option that looked most attractive is the one that cannot be
rolled back cleanly). Decision density: **high**, and none of it is agent-decidable.

## Invariants

- **`flowType: 'pkce'` stays.** P608 enabled it so link pre-fetchers could not consume single-use
  tokens, after a real signup-blocking incident.
- **No bulk-sender headers on transactional mail** (`decisions.md` 2026-06-17).
- **The anonymous signup surface must not become an email-enumeration oracle** (P684/P877).
- **Whatever ships must leave an `auth.users` row on failure.** This is not a nicety: that row is
  the only reason the 2026-09-07 incident was diagnosable, and it is what P1257's monitoring keys
  on. Any design that can fail *without* creating it is strictly worse than today's bug.

## Approach — deliberately not yet chosen

Two candidates were evaluated and **both were rejected in their proposed form** by adversarial
review. Do not restart from either without reading `## Rejected` below.

The reviewer's constructive suggestion, not yet assessed: **split transport from link shape** —
change only *who sends* the mail while keeping the standard link, so the untested prefetch
question stays off the critical path. Note this does not escape blocker A-1.

## Research Questions

1. Does a Microsoft scanner consume a `?token_hash=` link before the human clicks? `decisions.md`
   2026-09-03 records this as **UNTESTED**, and its reasoning ("a scanner does not run JS") is
   weaker than stated: Defender Safe Links **executes JavaScript**. A test that does not run
   against a Defender tenant is a false pass.
2. Does mail sent from our own transactional domain actually land in the Outlook inbox? Unknown.
   The test rig for this exists now (an aged Outlook account, with a Brevo baseline already
   captured in the incident file).
3. Would sending signup mail from the existing transactional domain damage it? That domain also
   sends Ghost newsletters and has live MX (`decisions.md` 2026-06-17, P942) — the reputation
   contagion argument that killed P942 applies here.

## Decision Criteria

- **Adopt a new transport only if** a test send lands in the Outlook rig's **Inbox with live
  links**, against the Brevo baseline already recorded, with transport and copy changed
  **separately** so the result is attributable.
- **Reject any design that can fail without creating an `auth.users` row** (see Invariants).
- **If the prefetch falsifier fails** (a scanner consumes the link), the `token_hash` link shape is
  off the table for inbox-delivered mail and only the transport question remains.

## Rejected

- **Supabase Send Email Hook — BLOCKER.** 5-second deadline; documented failure mode is
  `signUp` failing with **no `auth.users` row created** while the mail may still send
  (supabase/supabase discussions #34199, issue #29270). No documented fall-back-to-SMTP path.
  Creates a failure class invisible to P1257's monitoring. Also: `deploy-functions.sh` allowlists
  `--no-verify-jwt` for exactly one function, so deploying a hook through it stops all auth mail —
  and fixing that opens a publicly-POSTable endpoint.
- **A new anonymously-callable send function.** Would be the **fourth** anon mail sender; P1225
  records that the existing three have no rate limit at all.
- **SPF/DKIM/DNS changes.** Settled by evidence, not argument: `compauth=pass reason=100` on the
  junked message. P608 rejected this on reasoning in 2026-03-30; the header capture proves it.
- **Google sign-in only.** Would have blocked the exact Hotmail user who triggered this.

## Done-When

- [ ] Research question 1 answered by a real send to a Defender-backed mailbox, result recorded
      either way
- [ ] Research question 3 answered — a decision recorded on whether auth mail needs its own
      sending subdomain
- [ ] A transport is chosen against the Decision Criteria above, or the spec is closed with
      "no change, and here is why"

## Also carried over from P1257 (evidence-backed, cheap, independent of transport)

- [ ] Confirmation email copy: the literal brackets in `Confirm Your Email - [ClarityPledge]`, the
      grammar error `If you didn't signed up`, and the `Infrastructure powered by Supabase` footer
- [ ] `[FOUNDER DECISION: subject line and body wording]` — the defects above are objective; the
      replacement copy is a tone call

## Related

- `features/done/*/p1257_*.md` — the shipped half: the redeemable link page and the stranded-signup
  check. Read its "Adversarial review outcome" section before designing anything here.
- `features/p1225_no_rate_limit_on_anon_mail_sending_functions.md` — why a fourth anon sender is out.
- `features/done/2026-03-30/p608_magic_link_reliability.md` — the PKCE mitigation this must not undo.
- `.private/incidents/2026-09-07-magic-link-outlook-junk.md` — all evidence, including addresses.
