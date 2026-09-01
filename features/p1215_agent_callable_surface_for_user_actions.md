---
status: week
type: task
rank: 1000064
workstream: infrastructure
created_date: '2026-09-01'
tags: [agents, api, auth, distribution]
delivery_stage: create-spec
pipeline_ran: [create-spec, challenge-prd]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
---

# P1215: A user's agent can act as them, without ever holding their credentials

> **Revised 2026-09-01 after adversarial review** (codex, two passes; plus an independent
> protocol verification). The review overturned three factual claims and one security
> invariant in the first draft. Everything it corrected is marked **[REV]** below — those
> passages are the review's findings, not the author's, and reverting one restores a
> specific known hole.

## Problem

**Situation:** Every action on ClarityPledge requires a person in a browser. A user who lives
inside an AI assistant — the population this product is aimed at — cannot reach the product
from there. The only mechanism available today is handing an agent a password.

**Complication:** The founder's position, stated 2026-09-01, which drives the design:

> "if it ever to be successful, it will need to support agents creating and reading stuff. I'm
> sure about that... I think it can be reused even if what we're building now is not really,
> I don't know, it doesn't serve the business function we expect that to serve."

The per-action alternative — an integration for letters, then groups, then problems — grows
with every feature shipped.

**Question:** What is the single mechanism by which an existing user action becomes
agent-callable, without the agent holding a long-lived credential and without a new
maintenance surface per action?

## Why P143's rejection is NOT yet cleared

`features/archive/p143_mcp_server.md` proposed this and was **rejected 2026-02-12** on four
grounds. **[REV] The first draft claimed three were cleared. Review found two of those three
were not.**

| P143 rejection ground | Status |
|---|---|
| "Overengineered — saves 2 min/week" | **Cleared.** P143's scope was event CRUD for founder convenience. This is user-facing reach into a product users cannot access from where they work. Different problem — though note the demand evidence is still absent (Open Question 1). |
| "auth architecture fundamentally broken" | **[REV] NOT cleared — narrowed only.** Short lifetime removes the *token store*. It does not supply an authorization architecture. Unspecified and required: the authorization server, token audience, token exchange, connector callback, user binding, scope enforcement, and **how Supabase RLS receives the correct `auth.uid()`**. The failure this leaves open is concrete: an implementation falls back to a service-role backend that trusts a user ID asserted by the connector, and one confused-deputy request bypasses RLS entirely. Must be designed in `/architect` before any build. |
| "UX too technical for target users" | **[REV] NOT cleared.** "A connect button" is a mockup, not an integration. Unverified: hosted-agent support, callback registration, consent presentation, account selection, re-auth behaviour, failure recovery, and **disconnect**. A user who cannot tell which account they connected or how to revoke it is not better off than one pasting a token. |
| "no hypothesis connection" | **NOT cleared.** `docs/hypotheses.md` has no active hypothesis this tests (grepped 2026-09-01). See Open Question 1. This is the ground P143 actually died on. |

**Two of four grounds unresolved and one only narrowed. This spec is not implementation-ready
and must not go to `/dev`.** Its purpose is to hold the verified findings so `/architect` starts
from them.

## Appetite

**Blast radius: high** — a new authenticated entry path to the whole data surface, plus a
public contract that cannot be quietly changed. **Reversibility: medium** — additive, but only
if the kill switch below is built alongside rather than after. **Decision density: one** —
Open Question 1.

## Invariants

- **[REV] Read-only is NOT harmless, and removing send capability does NOT neutralise prompt
  injection.** The first draft asserted both. **The agent's own response channel is the
  exfiltration route** — no ClarityPledge send tool is required. Concrete: a poisoned
  counterparty letter instructs the agent to fetch the user's *other* letters, sealed positions,
  event attendance and registration-gated group-chat URLs, and print them into a conversation the
  attacker can see. Every capability restriction in this spec bounds **integrity** harm. None of
  them bounds **confidentiality** harm, and none bounds *decision* harm — a read-only agent can
  selectively misquote a counterparty or falsely summarise their position, which is precisely the
  damage this product exists to mediate. **Any claim in any future revision that a capability
  restriction makes an agent "unable to cause harm" is false and must name which harms it
  actually prevents.**
- **Confidentiality harm is bounded and disclosed, never claimed solved.** The residual is real:
  it cannot be engineered away for an agent legitimately reading its own user's data. It is
  bounded by volume ceilings, by the kill switch, and by telling the user plainly what their
  agent can pull. Not by an invariant asserting safety.
- **[REV] Exposure is opt-in per action; derivation is not exposure.** Deriving a tool contract
  from an existing action is automatic. *Publishing* it requires an explicit per-action opt-in.
  Automatic exposure is fail-open: a future account-deletion, membership, recipient or visibility
  action ships for a controlled UI and reaches agents before anyone threat-models it. The opt-in
  is one line, so the treadmill this spec exists to kill still dies — a hand-written adapter per
  action is what is avoided, not the decision to expose.
- **Drafting is not sending — and [REV] "the human saw the text" is not approval.** Approval must
  bind the immutable content **plus every consequential field** (recipient, audience, visibility,
  invite list, links after canonical rendering) and be single-use. Otherwise defeated by: editing
  the draft between preview and approval; previewing one body and submitting another; substituting
  the recipient while the text stays correct; hiding material in zero-width or control characters;
  replaying one approval across drafts or recipients.
- **Machine authorship keeps its own identity channel.** P1104 (shipped, prod) reserves the
  `Agent · ` name prefix and `machine-` URL prefix. An agent acting *for* a person writes under
  that person's account; an agent writing *as itself* is a machine account with a real accountable
  operator (P1124). **No third identity mode.**
- **A label that asserts a destination must match that destination** (decisions.md 2026-08-24).
  Agent-drafted content is the class that finding came from.
- **The credential set may only shrink** (P1214, open).

## Verified protocol facts

**[REV]** Checked against the MCP specification, version **2026-07-28**. The first draft's
claims are corrected here; three of four were wrong.

| First-draft claim | Verified |
|---|---|
| Standardized "click approve" authorization, nothing to build | **FALSE.** OAuth 2.1 framework, optional, HTTP transports only. The operator MUST provide an OAuth 2.1 authorization server (or delegate), protected-resource metadata (RFC 9728), AS metadata (RFC 8414/OIDC discovery), issuer validation (RFC 9207), resource indicators (RFC 8707), scope challenges (RFC 6750). Dynamic Client Registration is deprecated in favour of Client ID Metadata Documents. |
| Short-lived removes the credential store | **PARTIALLY TRUE.** Refresh tokens are optional — spec: *"MUST NOT assume refresh tokens will be issued."* Expiry-then-reconnect with no refresh token is achievable, and then there is genuinely nothing to store. But it is **our implementation choice**, not a protocol guarantee, and it must be stated as a requirement or an implementer will add refresh tokens by default. |
| New tools callable with no client-side update | **TRUE.** `notifications/tools/list_changed` plus client re-listing via `tools/list`; responses carry a `ttlMs` cache hint. The "nothing to version on the user's side" argument survives. |
| Protocol enforces per-tool scope separation | **FALSE.** Entirely server-side. There is no protocol-layer mechanism restricting a client to a subset of tools. Every capability boundary in this spec is ours to enforce and ours to get wrong. |

**Outstanding:** whether the six authorization MUSTs can be delegated to Supabase Auth or an
off-the-shelf provider, and what is genuinely left to self-build, is still being checked. Treat
the build cost as **unknown**, not small.

## Solution / Approach

**Phase 1 — read-only, gated on P1207.**

Expose a deliberately opted-in subset of the existing read surface as agent-callable tools over
the standard protocol, authenticated by a short-lived grant with no refresh token.

**[REV] "Short-lived" must be a number, not a word** — an implementation choosing 24 hours would
satisfy every row in the first draft while leaving a full day of compromise exposure. `/architect`
fixes: absolute lifetime, idle timeout, re-auth strength, concurrent-grant policy, replay
behaviour, and what happens to a call in flight at expiry.

**[REV] Required alongside, not after:** per-user rate limits, pagination and bulk-export
ceilings, query-cost bounds, anomaly detection, and a kill switch that disables **only** the agent
surface without disabling the browser app.

**[REV] "The agent can read only what the user can read" is not a safe boundary.** A person
browsing sees data incrementally and in context; an agent aggregates, searches and exports the
same rows at machine speed. RLS is obeyed and the privacy assumption still fails. The agent scope
is a deliberate subset with volume ceilings, not "whatever the UI shows".

**Phase 2 — draft-only writes**, gated on phase 1 and on the approval-binding invariant above.

**Authorship — settled, not to be re-litigated.** An agent-drafted, human-approved letter is the
person's letter and carries **no label**: the recipient's comprehension rating already measures
what a label would gesture at, and machine authorship in its own right has a separate identity
channel (P1104). **[REV]** This holds only if approval is genuine — see the binding requirement.

## Decision Criteria

1. **May phase 1 begin?** → Only if P1207 answers its Criterion 1 **Yes**. **[REV]** That
   criterion was `anon`-only in its first draft; since agents run as `authenticated`, it could
   have passed while leaving the exact threat unaudited. P1207 was amended 2026-09-01 to cover
   cross-user `authenticated` reads. **If that amendment is ever reverted, this gate is void.**
2. **May phase 2 begin?** → Phase 1 clean **and** [REV] against a stated coverage target, not
   an incident count: minimum call volume, adversarial cases run, and an independent reachability
   oracle. *"No incidents observed"* over ten benign calls is not evidence.
3. **Is the derivation real?** → **[REV]** Tested against a *representative* existing action
   (a letter or group action with validation and sequencing), not a trivial one. A new
   `get_version` tool appearing automatically proves nothing.
4. **Is short-lived sufficient?** → Count expiry-driven failures **with a denominator**.
   **[REV]** A bare counter reads zero when every expired user abandons before calling anything.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| **[REV] Poisoned counterparty content exfiltrates the user's own data via the agent's response** | ACCEPT + BOUND | Cannot be engineered away. Bounded by volume ceilings + kill switch; disclosed to the user in plain words |
| **[REV] Read-only agent misquotes or misrepresents a counterparty's position** | ACCEPT | The product's own comprehension rating is the check; no capability restriction addresses it |
| Confused deputy / forged user binding via the connector | MITIGATE | Authorization architecture is an `/architect` deliverable and a build blocker |
| **[REV] OAuth flow attacks** — PKCE ownership, redirect-URI restriction, state/nonce, issuer and audience validation, login-CSRF, approval bound to the attacker's connector | MITIGATE | Enumerated in `/architect`; the first draft named none of them |
| **[REV] Bulk enumeration and cost exhaustion by an authorized agent** | MITIGATE | Ceilings and quotas ship with phase 1, not after |
| A "read" tool has side effects (marks read, claims a delivery, returns an invite URL) | MITIGATE | Classify by **effect**, not by name; enumeration of tool names proves nothing |
| **[REV] Add-never-mutate blocks withdrawing a dangerous tool** | MITIGATE | Additions are compatible; **security removals are always permitted** and take precedence |
| Re-authentication friction drives abandonment | ACCEPT | Measured per Criterion 4 |
| Ships with no hypothesis, repeating P143 | DEFER | Blocked on Open Question 1 |

**Non-Goals**
- Do NOT build a long-lived credential store, personal access tokens, or refresh tokens.
- Do NOT expose any action automatically — opt-in per action.
- Do NOT begin phase 2 before Criterion 2 passes.
- Do NOT introduce a third identity mode for agent authorship.
- Do NOT add an "agent-drafted" label.
- Do NOT modify RLS policies here (P1207's scope).
- Do NOT let an agent send, publish, or invite — in either phase.
- **[REV] Do NOT claim any capability restriction makes an agent safe.**

## Done-When

**[REV] Every row below was rewritten. The first draft's versions could each be ticked by an
implementation that did nothing real** — the failure modes are named so a future rewrite cannot
quietly restore them.

- [ ] A user connects an agent by approving a prompt; no secret is copied, pasted or stored —
      and **can disconnect it from the product UI**, verified by disconnecting and confirming the
      next call is refused
- [ ] A **reachability matrix**, not a single probe, shows the agent reaching only the intended
      subset — across tables, RPCs, Storage and Realtime, for the user's own rows and another
      user's *(one 403 on one letter proves nothing)*
- [ ] A grant **observed working**, then observed refused after expiry — the same call, same
      fixture, both directions recorded *(a malformed token refused twice proves nothing)*
- [ ] Every exposed tool classified by **effect**, with no phase-1 tool producing a write, a
      notification, a state change, or a URL that grants access *(names are not effects)*
- [ ] Volume ceiling demonstrated: a scripted bulk enumeration is refused, with the refusal shown
- [ ] Kill switch demonstrated: agent surface disabled, browser app verified still working
- [ ] Audit log defined field-by-field — grant id, user, tool, arguments, rows returned, row
      ownership, outcome, denials — and shown answering "what did this agent reach" on a real run
- [ ] Expiry friction reported **with a denominator**
- [ ] Criterion 3 satisfied against a representative action, with the commit range shown
- [ ] P1207 Criterion 1 answered **Yes for both roles**, in writing, before any of the above
- [ ] `/architect` has produced the authorization architecture — AS, audience, exchange, callback,
      user binding, scope enforcement, `auth.uid()` derivation — and it has been adversarially
      reviewed **[REV] build blocker**

## Open Questions

1. `[FOUNDER DECISION: which hypothesis does this test?]` The ground P143 died on, still open.
   The conviction — *"if it ever to be successful, it will need to support agents creating and
   reading stuff"* — is falsifiable and recorded nowhere. Either file it in `docs/hypotheses.md`
   with a falsifier (epistemic gate 8), or state explicitly that this is infrastructure built
   ahead of its hypothesis. **[REV]** Review also notes there is no evidence any target user
   wants to reach this product through an agent — that evidence, or its absence, belongs here.
2. Can the six authorization MUSTs be delegated to Supabase Auth or an existing provider?
   Outstanding; the build cost is unknown until answered.
3. Does any existing surface assume a browser reader in a way a tool call breaks — session-keyed
   rate limits, CSRF assumptions, anon-key-scoped reads? Not assessed.

## Related

- **P143** (archive, rejected 2026-02-12) — predecessor; two of four grounds still open
- **P1207** — permission audit; hard dependency, amended 2026-09-01 to cover `authenticated`
- **P1214** — credential separation; the direction this must not widen
- **P1104** (done, prod) / **P1124** (backlog) — agent identity and operator accountability
- decisions.md 2026-08-24 — a link label asserting a destination must match it
