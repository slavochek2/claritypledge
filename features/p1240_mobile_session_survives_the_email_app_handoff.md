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
| (b) PKCE cross-browser break | The login link's verifier lives in the browser that *requested* it; opened in a different browser the exchange fails outright | **Yes.** Two flows in this repo already use the browser-agnostic `verifyOtp`/`token_hash` pattern (`accept-agreement-page.tsx`, `letter-response-confirm-page.tsx`); the main login does not |
| (c) Safari ITP eviction | Stored session cleared after ~7 days of no visit | **No**, but changes what the fallback must handle |

P840 established (a) for its own report. It does **not** establish (a) for these reports — the
founder's description ("clicks a link, opens a new tab") fits (b) equally well, and (b) has a fix
already patterned in this repo. **UNVERIFIED which shape is dominant; do not assume (a).**

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

- [ ] Step 1 run on a real device, with which shape(s) reproduce recorded — including any that did
      **not** reproduce, since a negative rules out a whole fix direction
- [ ] If (b) reproduces: the login link works when opened in a browser other than the one that
      requested it, verified on the device, with the failing case captured first
- [ ] A person whose phone has lost the session sees a way back in on the page they landed on —
      not a generic login redirect that loses where they were going
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
