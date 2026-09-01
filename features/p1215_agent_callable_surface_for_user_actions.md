---
status: week
type: task
rank: 1000064
workstream: infrastructure
created_date: '2026-09-01'
tags: [agents, api, auth, distribution]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1215: A user's agent can act as them, without ever holding their credentials

## Problem

**Situation:** Every action on ClarityPledge requires a person in a browser. A user who lives
inside an AI assistant — the population this product is aimed at — has no way to reach the
product from there. The only mechanism available today is handing an agent a password, which
nobody should do and nothing supports.

**Complication:** The founder's position, stated 2026-09-01 and recorded here because it drives
the whole design:

> "if it ever to be successful, it will need to support agents creating and reading stuff. I'm
> sure about that... I think it can be reused even if what we're building now is not really,
> I don't know, it doesn't serve the business function we expect that to serve."

The per-action alternative — hand-building an integration for letters, then another for groups,
then another for problems — is a treadmill that grows with every feature shipped.

**Question:** What is the single mechanism by which any existing user action becomes agent-callable,
without the agent holding a long-lived credential and without a new maintenance surface per action?

## Why P143's rejection no longer applies

`features/archive/p143_mcp_server.md` proposed an MCP server and was **rejected 2026-02-12** on
four grounds. This spec must clear each or it is the same spec:

| P143 rejection ground | Status now |
|---|---|
| "Overengineered — saves 2 min/week" | **Cleared.** P143's scope was event CRUD to save the founder time. This is user-facing reach into a product users cannot otherwise access from where they work. Different problem. |
| "auth architecture fundamentally broken" | **Cleared by scope reduction.** Short-lived, re-authenticated access removes the credential store P143 needed. See Solution. |
| "UX too technical for target users" | **Cleared.** A connect-and-approve button, not a pasted token. Nothing to copy. |
| "no hypothesis connection" | **NOT cleared.** `docs/hypotheses.md` contains no active hypothesis this tests (grepped 2026-09-01; the P0/P1/P2 set is about letters, norms, and psychological safety). The founder's conviction above is an untested belief, not a recorded hypothesis. See Open Questions 1 — this is the ground on which P143 died and it is live again. |

## Appetite

**Blast radius: high** — a new authenticated entry path to the entire data surface, and a public
contract that cannot be quietly changed once agents call it.

**Reversibility: high for phase 1** (read-only, additive, no schema change, can be switched off
without user-visible loss), **medium for phase 2** (write actions touch letter creation).

**Decision density: one** — the hypothesis question below. Authorship and credential lifetime
were both settled in conversation 2026-09-01 and are recorded here rather than re-asked.

## Invariants

- **A hijacked agent must be unable to cause harm, and this is achieved by removing capability,
  never by instructing the model.** Making a model reliably distinguish text-it-reads from
  instructions-it-follows is unsolved. Letters are, by product design, adversarial writing from a
  motivated counterparty — untrusted input by construction. **Any tool that reads
  counterparty-authored content must not, in the same grant, be able to send, publish, or invite.**
- **Drafting is not sending.** A write tool may prepare content. A human approves the actual text
  they can see before it leaves. This is both the authorship position (below) and the phase-2
  injection control; it is one mechanism serving two purposes and may not be removed for either.
- **Machine authorship keeps its own identity channel.** P1104 (shipped, prod) reserves the
  `Agent · ` display-name prefix and the `machine-` URL prefix so a machine account can never be
  mistaken for a person and a person can never wear a machine's identity. An agent acting *for* a
  person writes under that person's account; an agent writing *as itself* is a machine account with
  a real accountable operator (P1124). **No third identity mode may be introduced.**
- **A label that asserts a destination must match that destination.** Agent-drafted text carrying
  a markdown link whose label is shaped like an address is checked against its href
  (decisions.md 2026-08-24). Agent-drafted content is exactly the class that finding came from.
- **The credential set may only shrink.** P1214 is open and reducing what agents can reach. Any
  credential this spec introduces must be justified against that direction, not added beside it.

## Solution / Approach

**Phase 1 — read-only, gated on P1207.**

Expose the product's existing read surface as agent-callable tools over the standard agent
protocol, authenticated by a **short-lived, re-authenticated grant** — the user clicks connect,
approves, and re-approves when it expires, the way `gcloud` and every hosted agent connector
already behave.

Short-lived is a deliberate scope reduction, not a compromise. It removes: the token table, the
hashing, the rotation path, the revocation UI, and the leak-response procedure. **The only thing
it costs is unattended action** — an agent doing something while nobody is present. No phase-1 or
phase-2 action requires that.

The tool surface is **derived from the existing action surface, not hand-written per action**.
That derivation is the deliverable; a hand-maintained tool list reproduces the treadmill this spec
exists to avoid. Agents re-read the tool list every session, so a newly shipped action becomes
callable with no client-side update and nothing to version on the user's side.

**Phase 2 — draft-only writes, gated on phase 1 running clean.**

Write tools that prepare content and stop. The person sees the actual text and approves it. Nothing
an agent produces reaches another human without that click.

**Authorship — settled, recorded, not to be re-litigated.** An agent-drafted, human-approved
letter is the person's letter and carries **no label**. The reasoning: this product already
measures the thing a label would gesture at — the recipient rates how well they were understood, so
a waved-through letter is caught by the product's own instrument rather than by a badge. Machine
authorship in its own right already has a separate identity channel (P1104, above).

## Decision Criteria

1. **May phase 2 begin?** → Only if P1207 answered its Criterion 1 **Yes**, AND phase 1 has run
   with real users with zero unintended reaches observed in its audit log. Either fails → phase 1
   stands alone indefinitely.
2. **Is the derivation real?** → Ship an action *after* the tool surface exists and confirm it
   becomes agent-callable with **no edit** to the tool layer. If it needs an edit, the derivation
   failed and the treadmill is still there.
3. **Is short-lived actually sufficient?** → Track, in phase 1, every user request that failed
   because the grant had expired. If nobody hits it, the question is closed. If it recurs,
   long-lived is reconsidered on evidence, not in advance.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An agent reads a poisoned letter and acts on its instructions | MITIGATE | Read and write are separate grants; phase 1 has no write at all; phase 2 drafts only |
| A permission mistake is enumerated by agents at scale | MITIGATE | Hard dependency on P1207; phase 1 does not begin until its Criterion 1 is answered |
| Re-authentication annoys users into abandoning it | ACCEPT | Measured by Criterion 3 rather than pre-solved; the alternative is a credential store we would own forever |
| A public tool contract blocks future changes to actions | ACCEPT | Add-never-mutate, the ordinary discipline for any public interface |
| Users assume an agent-drafted letter was hand-written | ACCEPT | The comprehension rating measures understanding regardless of who typed it; see Authorship |
| Phase 1 ships and no hypothesis is ever attached, repeating P143 | DEFER | Blocked on Open Question 1; unblocked by filing the hypothesis, not by building |
| The derivation is quietly abandoned mid-build for a hand-written tool list | MITIGATE | Criterion 2 tests it with a real post-hoc action, not by inspection |

**Non-Goals**
- Do NOT build a long-lived credential store, personal access tokens, or a revocation UI.
- Do NOT begin phase 2 before Criterion 1 passes.
- Do NOT introduce a new identity mode for agent authorship — P1104's two channels are the set.
- Do NOT add an "agent-drafted" label (settled above).
- Do NOT modify RLS policies here; policy correctness is P1207's scope.
- Do NOT let an agent send, publish, or invite. Ever, in either phase.

## Done-When

- [ ] A user connects an agent by approving a prompt — no secret is copied, pasted, or stored anywhere
- [ ] That agent can read only what the user can read, demonstrated by a probe attempting a read the user is not entitled to and being refused
- [ ] The grant expires and the agent loses access, verified by a call after expiry returning refused
- [ ] An action shipped *after* the tool surface exists becomes agent-callable with zero edits to the tool layer (Criterion 2), with the commit range shown
- [ ] No phase-1 tool can send, publish, or invite — verified by enumerating the exposed tool set, not by reading the code that builds it
- [ ] An audit log shows, per call, which user, which tool, and what was reached
- [ ] Expired-grant friction is counted, not estimated (Criterion 3)
- [ ] P1207 Criterion 1 is answered in writing before any of the above ships

## Open Questions

1. `[FOUNDER DECISION: which hypothesis does this test?]` **This is the ground P143 died on and it
   is not yet cleared.** The stated conviction — *"if it ever to be successful, it will need to
   support agents creating and reading stuff"* — is a real, falsifiable claim and is currently
   recorded nowhere. Either file it in `docs/hypotheses.md` with a falsifier (epistemic gate 8:
   record under uncertainty, never withhold), or accept explicitly that this is infrastructure
   built ahead of its hypothesis and say so in the spec rather than leaving it implied.
2. UNVERIFIED: the claims in Solution about the agent protocol's authorization model and its
   session-time tool re-listing are from model knowledge, not from the specification read this
   session. Verify before implementation; they are load-bearing for "no long-lived credential" and
   for "nothing to version on the user's side".
3. Does any existing surface already assume its reader is a browser in a way a tool call breaks
   (rate limits keyed on a session, CSRF assumptions, anon-key-scoped reads)? Not assessed.

## Related

- **P143** (archive, rejected 2026-02-12) — the predecessor; its four rejection grounds are
  addressed above, one still open
- **P1207** — adversarial permission audit; hard dependency, phase 1 does not start without it
- **P1214** — credential separation and privilege reduction; the direction this must not widen
- **P1104** (done, prod) — agent accounts, reserved name and URL channels
- **P1124** (backlog) — an agent account's operator must be a real profile
- decisions.md 2026-08-24 — a link label that asserts a destination must match it
