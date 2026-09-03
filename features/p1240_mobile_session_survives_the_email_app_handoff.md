---
status: week
type: story
rank: 1000069
workstream: C1
created_date: '2026-09-03'
tags: [auth, mobile, in-app-browser, activation]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1240: A person who arrives from email on their phone stays signed in

## Problem

**Situation:** People on phones lose their session. The founder's description, 2026-09-01:

> "a person is logged in. Maybe he's on the event, maybe he's in the browser, and then maybe he
> clicks on some kind of a link or something or opens a new tab... sometimes he loses his session.
> So his browser is not remembering very good."

**Complication:** This was already filed once as **P840** (2026-05-15) and **rejected during
`/reproduce`** — correctly, as a bug. The mechanism was established and is documented in
`docs/technical/authentication.md` §"Mobile in-app WebView": Gmail, Instagram, LinkedIn and
similar spawn a **fresh WebView per link tap with an isolated storage partition**, so the session
written by one tap is unreachable from the next. There is no defect in this repo's code, and no
code change here fixes it.

P840's rejection left a standing instruction, unactioned since:

> "If activation funnel data later shows this failure mode is material, file a follow-up
> `type: story` for the fallback-identity mechanism."

That condition is now met by recurrence — the founder is reporting it again, in the wild, more
than once, four months later. `decisions.md` 2026-05-15 also set an escalation trigger on the
third occurrence of the "mobile = environment, not code" pattern.

**Question:** What does a person do when their phone's browser has forgotten who they are — and
what does the product do to make that recoverable without a support conversation?

## Appetite

**Blast radius: medium** — the arrival path for email-referred mobile users; no existing
authenticated desktop flow changes. **Reversibility: high** — additive UI plus, at most, one
identity-resolution path. **Decision density: one** — how much identity the fallback may assert.

## Invariants

- **The session lives in `localStorage`, never in a cookie** (`src/lib/supabase.ts`, no custom
  `storage`). Any hypothesis framed around cookie attributes, `SameSite`, or `Secure` is
  malformed for this codebase — recorded 2026-05-15 after one was pursued.
- **A fallback identity path must not become an authentication bypass.** Recognising who someone
  probably is, to offer them a way back in, is not the same as treating them as signed in. Nothing
  here may grant access on an unauthenticated signal.

## Solution / Approach

**Step 1 — settle which failure is actually hitting people. This is the only part that needs
new evidence, and it is cheap.** Three distinct shapes produce the founder's description and the
fix differs completely between them:

| Shape | Mechanism | Fixable here? |
|---|---|---|
| (a) In-app browser spawn | Fresh WebView, isolated storage; session written by a previous tap is invisible | **No.** Environment. Only a fallback path helps |
| (b) PKCE cross-browser break | The login link's verifier lives in the browser that *requested* it; opened in a different browser the exchange fails outright | **No — and this was corrected 2026-09-03, see Step 1 Findings.** This is not a defect. It is the accepted behaviour of P608, whose own acceptance criteria read "Same browser works, different browser fails gracefully". The `verifyOtp`/`token_hash` alternative is browser-agnostic *because it drops PKCE*, which re-opens the ATP token-consumption incident P608 closed. **What IS fixable is what the person sees when (b) fires** |
| (c) Safari ITP eviction | Stored session cleared after ~7 days of no visit | **No**, but changes what the fallback must handle |

P840 established (a) for its own report. It does **not** establish (a) for these reports — the
founder's description ("clicks a link, opens a new tab") fits (b) equally well. **UNVERIFIED which
shape is dominant; do not assume (a).**

### Step 1 Findings — device run 2026-09-03 (Galaxy S22, `SM_S908B`, Chrome 152, USB debug + CDP)

**Verified on the device:**

- **Check 1 PASSES — Chrome does not lose the session.** `sb-besjtuodziykmjidubzw-auth-token`
  present in `localStorage` on `claritypledge.com`, 5240 bytes, decoding to the founder's own
  account,
  `/letters` rendering authenticated content. Storage is `localStorage` with no custom `storage`
  option (`src/lib/supabase.ts`) — the first invariant holds, re-confirmed by observation and not
  only by code read.

**Verified by command against this repo (not by device):**

- **(b) is real, and it is deliberate — the spec's original framing was wrong.**
  `docs/technical/authentication.md:89-93` states that `signInWithOtp` (real self-service login,
  signup, pledge) mints a `?code=...` PKCE link requiring a browser-local `code_verifier`.
  `features/done/2026-03-30/p608_magic_link_reliability.md:44` enabled `flowType: 'pkce'`
  *specifically* so that Microsoft 365 / Google Workspace link pre-fetchers cannot consume the
  single-use token — and **line 112 of that same spec accepts the consequence in as many words:
  "Same browser works, different browser fails gracefully."** The incident it fixed is real and
  documented (`.private/incidents/2026-03-29-magic-link-failure.md`): a corporate-domain signup
  where the scanner consumed the token and the person could not register at all.
  → **Do not convert `/auth/callback` to `token_hash` casually** — but the reason is a real
  trade-off to be evaluated, **not** a settled prohibition. An earlier draft of this section claimed
  the token_hash flows are safe only because they "never sit in an inbox." **That claim is false and
  is retracted.** `supabase/functions/request-letter-response-signin/index.ts` emails its link
  (Mailgun, `:160`) and builds it as `/letter/:id/confirm?token_hash=…` (`:509`) — an
  inbox-delivered, non-PKCE, cross-browser-working link. `decisions.md` 2026-04-13/2026-05 record
  that this flow was moved **off** PKCE *precisely because* PKCE broke it cross-browser. So the repo
  has already made this trade in the opposite direction, deliberately, on an inbox-delivered flow.

  **UNTESTED HYPOTHESIS, and the thing worth testing next:** the two patterns may not have the same
  prefetch exposure at all. A Supabase `/auth/v1/verify?token=…` URL is consumed by a **plain GET** —
  which is exactly how an ATP scanner consumes it. A `?token_hash=…` URL pointing at an app page is
  redeemed only when `verifyOtp` runs **in JavaScript**, which a non-executing prefetcher never does.
  If that holds, token_hash gets cross-browser support *and* prefetch resistance, and P608's
  trade-off was never actually forced. **Not verified — do not act on it.** Falsifier: send a
  token_hash link to a Microsoft 365 mailbox and check whether the token is consumed before a human
  clicks. Until that is run, treat the choice as genuinely open and founder-level.

- **The genuinely fixable defect is the failure surface, and it is exactly this spec's AC #3.**
  When (b) fires there is no Supabase error param — the exchange simply never happens, `session`
  stays null, and `AuthCallbackPage.tsx:135` falls into the single terminal `auth_error` state.
  That state renders (`AuthCallbackPage.tsx:813-843`):
  - Heading **"Link Expired or Invalid"** and body **"Magic links are valid for 1 hour. Please
    request a new one."** — a wrong diagnosis for a link that is neither expired nor invalid. The
    code's own comment at `:69-79` already names this: `!session` is the terminal state for *every*
    failure including "a link opened in a different browser", and P1011 split the **Sentry**
    reporting by cause but left the **user-facing copy** unsplit.
  - Primary CTA **"Request New Link" → `/sign-pledge`**. Two problems: it sends a returning user
    logging in to the pledge-signing page, and re-requesting from the browser they are currently
    in reproduces the identical failure. **This is a loop with no exit** — the person cannot
    self-recover no matter how many times they follow the instruction.
  - No "open this link in your usual browser" affordance, which is the documented human workaround
    (`authentication.md:405`) and the only thing that actually resolves both (a) and (b).

- **Undocumented third hop: the magic-link email is wrapped in a Brevo click-tracker.** A real
  magic-link email (inbox, 2026-08-24) carries
  `https://bacjfehj.r.bh.d.sendibt3.com/tr/cl/<opaque>` rather than the Supabase verify URL. Every
  login therefore traverses an extra redirector between the mail client and `/auth/callback`. Not
  assessed here; it is a plausible independent contributor to link failures and it was not in this
  spec's model of the flow.

**NOT verified — still open, needs one tap on the device:**

- **Shape (a) is unconfirmed for Gmail specifically, and the spec (and `authentication.md:401`)
  may be overstating it.** Gmail on Android routes link taps through Chrome Custom Tabs by default,
  and a Custom Tab shares Chrome's storage partition — if that is what happens here, (a) does
  **not** fire for Gmail at all, and the isolated-WebView mechanism applies only to
  LinkedIn/Facebook/Instagram (all three installed on this device). This flips which fix matters.
  **Unverified either way — do not act on either reading.** The check is one tap on a
  claritypledge link inside Gmail while `adb shell cat /proc/net/unix | grep devtools_remote` is
  watched: a new `@webview_devtools_remote` socket ⇒ isolated WebView ⇒ (a) confirmed; the link
  instead appearing in Chrome's own target list ⇒ Custom Tab ⇒ (a) does not apply to Gmail.
- **(b) not reproduced end-to-end on the device.** The request-in-A / open-in-B run was started and
  abandoned: the USB link dropped mid-run, and on reconnection the founder was actively using the
  phone. The code-level evidence above is strong and P608's own AC asserts the behaviour, but the
  observed failure was not captured. **Recorded as unreproduced, not as confirmed.**
- **(c) Safari ITP** is not assessable on this device (Android). Untouched.

**Device test (founder-assisted, ~15 min, settles it):** an Android device in USB debug mode,
remote-inspected. Three checks, in order:
1. Sign in on the phone in Chrome. Read `localStorage` for the `sb-<ref>-auth-token` key. Present?
2. Open a ClarityPledge link from Gmail. Read `localStorage` in *that* WebView. Absent → (a) confirmed.
3. Request a login link, then open it in a **different** browser than the one that requested it.
   Fails → (b) is live and independently fixable.

Steps 2 and 3 are independent; both can be true. If (b) is live, **fix it first** — it is a real
defect with an in-repo pattern, and it is invisible in P840's framing.

**Step 2 — the fallback, scoped by what step 1 finds.** For whatever remains unfixable, the person
needs a way back that does not require them to understand WebViews. Candidate directions, not yet
chosen: recognising the arrival context enough to offer a one-tap re-authentication rather than a
cold login form; a plainly-worded prompt when the session is absent on a route that expected one;
an "open in your browser" affordance at the point of failure rather than as folklore.

`[FOUNDER DECISION: what should the failed-callback page say?]` Today it says "Link Expired or
Invalid — magic links are valid for 1 hour", which is a false statement in the cross-browser case
and sends the person round a loop. The honest replacement has to admit uncertainty ("this link was
opened in a different browser than the one that asked for it") without turning into a technical
lecture on a page reached by someone who just wants in. Needed before any copy is written — AC below.

`[FOUNDER DECISION: how much may the fallback assert?]` Offering "it looks like you're
[name] — send a link to sign back in" is warmer and leaks that an address is registered. A neutral
"sign in to continue" leaks nothing and is colder. This is a product-feel call on a page reached by
people who may not be the account holder.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fallback becomes an auth bypass | MITIGATE | Second invariant; any identity signal offers a re-auth route, never access |
| A recognition prompt discloses that an address has an account | DEFER | Blocked on the founder decision above |
| Fixing (b) changes the login flow, which carries a do-not-modify-without-E2E header | MITIGATE | `AuthCallbackPage.tsx` header is explicit; E2E coverage before any change |
| Effort spent on (a) when (b) is the live shape | MITIGATE | Step 1 runs first and is 15 minutes |
| Impact is smaller than the founder's impression | ACCEPT | Recurrence is the trigger P840 named; the device test is cheap regardless of volume |

**Non-Goals**
- Do NOT re-diagnose the in-app WebView mechanism — settled 2026-05-15, documented.
- Do NOT pursue any cookie-attribute hypothesis (first invariant).
- Do NOT build a PWA install prompt as the answer; it was P840's rejected direction.
- Do NOT change session lifetime or storage backend.

## Acceptance Criteria

- [x] **PARTIAL (2026-09-03)** — Step 1 run on a real device (S22). Check 1 verified; (b) established
      by command but **not** reproduced on-device; (a) **not** checked for Gmail; (c) not assessable
      on Android. Negatives recorded in Step 1 Findings. Two device checks remain — see that section.
- [ ] **REFRAMED (2026-09-03)** — "make the link work in another browser" is not a free fix; it means
      changing the link pattern, which interacts with P608's ATP protection. Before any such change,
      run the falsifier in Step 1 Findings (does a `token_hash` link survive a Microsoft 365 mailbox
      un-consumed?). That single test decides whether this is a safe fix or a regression.
- [ ] A person whose phone has lost the session sees a way back in on the page they landed on —
      not a generic login redirect that loses where they were going
- [ ] **NEW** — the `auth_error` state no longer tells a person their link is expired when it is not,
      and no longer offers a CTA that reproduces the same failure. It must surface the
      "open in your usual browser" route, and it must not send a returning login to `/sign-pledge`.
      Gated on E2E coverage first (`AuthCallbackPage.tsx` do-not-modify header) and on the founder
      copy decision below — **deliberately not implemented in the 2026-09-03 session for both reasons**
- [ ] That path does not sign anyone in without a fresh authentication
- [ ] The founder-decision question above is answered in this spec before any copy is written
- [ ] Verified on a real phone, not only in an emulated viewport

## Open Questions

1. How many people does this hit? P840's follow-up was conditioned on activation data and that
   number was never pulled. Prod holds signup and login events; it is a query, not a project.
   Not required to start step 1.
2. Is there a route where losing the session loses *work*, not just the session — a half-written
   letter, an unsubmitted position? That would change the severity materially. Not assessed.

## Related

- **P840** (archive, rejected 2026-05-15) — the predecessor and the source of the mechanism
- `docs/technical/authentication.md` §"Mobile in-app WebView" — the documented mechanism
- decisions.md 2026-05-15 [technical] — verify storage mechanism and WebView spawn model before
  treating a mobile auth-loss report as a code defect; and the third-occurrence escalation trigger
- **P1086** (open) — magic-link E2E timeouts, same PKCE mechanism from the test-infrastructure side
