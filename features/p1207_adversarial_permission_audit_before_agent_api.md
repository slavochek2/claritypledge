---
status: week
type: task
rank: 1000058
workstream: security
created_date: '2026-09-01'
tags: [security, rls, agent-api, audit]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1207: Adversarial permission audit — is the policy set CORRECT, not just undrifted

## Problem

**Situation:** The browser app holds the public anon key and talks straight to PostgREST.
The 257 `CREATE POLICY` statements in `supabase/migrations/` are the only thing standing
between any user's own JWT and every row in the database. There is no server tier hiding
that surface — it is already public, and has been since the SPA shipped.

**Complication:** Every audit control this repo owns answers *did something change?* —
never *is it right?* `rls-drift-check.py` (P1048) diffs prod vs test vs migration files,
plus one shape leg (P1138); `function-grant-drift-check.py` (P1065) diffs EXECUTE grants;
`check-rls-scope.py` (P1039/P1041) is a pre-commit lint. Three sources agreeing on the same
wrong policy is structurally invisible to all of them — that is P1138's exact finding, and
its third leg closed only one shape of it. The last from-scratch correctness audit was
2026-04-03. Six security specs (P1044, P1045, P1054, P1059, P1100, and the P1065-shaped gap
in `rls-drift-check.py` recorded in decisions.md 2026-08-18) sit open in `backlog`, each
scoped to one bug class.

**And the threat model is about to change.** Exposing an agent-callable API does not create
a new attack surface — it lowers the skill floor to reach the one that exists. A policy
mistake goes from "a determined person with devtools could find this" to "someone's
assistant enumerates it on a Tuesday." Every future policy change then needs a rigor this
repo does not currently apply.

> Founder framing, verbatim: *"if we made a mistake, the agent can immediately see this
> mistake. And then if that is so, then our agent will basically give a tool with which
> every user can now punch into our system and find loopholes... then all our RLS policies
> have to be not only checked now once, which we didn't do for a while, but also each time
> we touch it."*

**Question:** What can each role actually reach today, which of those reaches are
unintended, and what standing control keeps the answer true after every future change?

## Appetite

**Blast radius: high** — the finding set governs whether the agent API can ship at all, and
a wrong "clean" verdict is silent. **Reversibility: high for the audit** (read-only, produces
a document), **medium for the fixes** (policy migrations, revertible but user-visible if a
tightening is wrong). **Decision density: low** — one founder call on the closure bar; the
rest is verification work with an objective answer.

## Invariants

Harvested from `docs/decisions.md`; each was expensive to learn and constrains how this
audit may be run.

- **A file-based audit's verdict is bounded by what the files say, not by what production
  does.** Any per-table BOUND / NOT-APPLICABLE table must state which source it was derived
  from. (2026-08-21, P1048; extended 2026-08-2x by P1141/P1150 from file-vs-live to
  flow-vs-policy.)
- **Every RLS audit starts with the three-way diff — live prod vs live test vs the policy
  set derivable from migrations — before any file-based classification.** Prod-only and
  live-but-absent-from-files are the security-relevant directions. (2026-08-13, P1048.)
- **Row visibility is not column visibility, and REST is not every delivery surface.** A
  policy verified over `.from()` calls says nothing about what Realtime delivers over the
  WebSocket; each delivery surface must be enumerated and tested on its own. (2026-08-17,
  P1057; 2026-08-13, P1048.)
- **Remediation is asymmetric.** A privilege *narrowing* is presumed intentional and is
  reported, never auto-restored. Narrowing wrongly causes a loud outage; widening wrongly
  causes a silent vulnerability — only one direction may be automated. (2026-08-14, P1102.)
- **A finding's identity is not its severity.** A backlog keyed on `[direction, table,
  policy]` silently absorbs a known-open finding getting *worse*. Any allowlist this audit
  writes must key on the predicate's content, not the policy's name. (2026-08-18, P1065.)
- **A gate must be watched failing before it is trusted, and run against the workflows that
  already exist before it is shipped.** (epistemic.md gates 7 and 7c.)
- **Read-only probes only.** No diagnostic in this audit may write to prod. (epistemic.md
  gate 2b.)

## Solution / Approach

An orchestrated run, designed to execute unattended. Three phases, each gating the next.

**Phase 1 — enumerate, adversarially.** Not a policy review. For each role
(`anon`, `authenticated`, and any custom role), derive what is actually reachable:
every table, every column, every RPC, every delivery surface (REST, Realtime, Storage,
edge functions). Start from the three-way diff per the invariant above, then go beyond it:
the question is *what can this role reach*, not *what changed*. Include the six open
backlog specs as known-unclosed findings rather than re-deriving them.

The output is a **reachability matrix**, not a list of opinions — each cell carries the
evidence that produced it (the query run, the response observed) and names the source it
was derived from.

**Phase 2 — fix, in parallel, under the asymmetry rule.** Fan out one agent per confirmed
finding. Widenings get closed; narrowings get reported and left alone. Each fix ships with
a test that was **observed failing before the fix and passing after** — a fix without a
proven-red canary does not count as a fix.

**Phase 3 — review, independently.** Reviewers see the diff and the finding, never the
fixing agent's reasoning. At least one pass runs through `codex` as a genuinely separate
model, so the review is not the same model checking its own homework. Report
`<reports received> of <spawned>` and name any lens that went uncovered (epistemic.md 9b).

**The standing control is the actual deliverable.** The one-time findings are worth less
than the answer to the founder's second question — *what happens each time we touch it*.
Phase 3 must end with a concrete, tested proposal for the recurring check, or the audit has
only bought a snapshot.

## Decision Criteria

Pre-registered, before the audit runs.

1. **Is the agent API safe to build on this surface?** → Yes if Phase 3 confirms zero
   **open** unintended reaches across all four reach classes, where every Phase 1 finding
   carries one of the three dispositions in criterion 1b. Any finding still open and
   undisposed = No.

   **The four reach classes — all blocking** (founder decision 2026-09-01, Open Question 1;
   the spec as filed scoped this to `anon` only):

   | # | Class | The question | Why it blocks |
   |---|---|---|---|
   | A | `anon` reach | Can a logged-out stranger read this? | The public anon key is in the browser bundle |
   | B | `authenticated` cross-row | Can user A read user B's rows? | **The agent API's own role.** An agent calling the API holds a valid user JWT — it is never `anon`. Scoping the bar to A would harden the one role the new threat model does not use |
   | C | Column-level | Row policy correct, but does `SELECT *` hand over a column it shouldn't? | Invariant: *row visibility is not column visibility* |
   | D | Delivery surface | Does Realtime / Storage deliver what REST correctly withholds? | Invariant: *REST is not every delivery surface*; a policy verified over `.from()` says nothing about the WebSocket |

   **Narrowing this bar back to `anon` alone re-opens the hole it exists to close** — an
   agent acting for a user runs as `authenticated`, so an anon-only audit can return Yes
   while leaving the precise threat the agent API introduces unexamined. Relaxing it is a
   deliberate founder call, not a default.

1b. **How does a finding close?** → Exactly one of three dispositions, recorded per finding.
   The spec as filed offered this escape hatch to class A only; extending it to all four is
   what makes an all-blocking bar terminable rather than a run that can never close.

   - **closed** — canary observed RED before and GREEN after, exit codes pasted.
   - **accepted-risk** — written entry, founder-signed, stating why the reach is tolerable.
   - **unverified-fixed** — the fix landed but no harness exists to prove it; the entry
     **must name the missing harness**. This is the honest outcome for class D today: there
     is no test that subscribes to a channel as user B and asserts what arrives. Reporting a
     class-D fix as `closed` without that harness is a false completion claim.

   A finding with no disposition is open, and one open finding answers criterion 1 **No**.
2. **Does a finding count?** → A finding requires a **reproduced reach**: the query, run
   against test with a real role token, returning data that role should not see. A policy
   that "looks wrong" without a reproduction is a lead, not a finding.
3. **Is the standing control good enough?** → It must be demonstrated catching a
   deliberately-introduced widening (gate 7) AND demonstrated passing the repo's own
   documented migration workflow unchanged (gate 7c). Both, or it does not ship.
4. **When to stop.** → Phase 1 is done when every table in `pg_tables` appears in the
   matrix with evidence, not when findings stop appearing.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Audit runs against prod and mutates state | MITIGATE | Read-only probes only; reproductions run on test with real role tokens |
| A tightening breaks a live user flow overnight, unattended | MITIGATE | Phase 2 commits to a branch only; nothing reaches prod without a human ship |
| "All clean" verdict is the probe being blind, not the surface being safe | MITIGATE | Run a known-bad control (a deliberately widened policy on test) through the identical probe; both must score differently or the method is discarded |
| Reviewer agents never report, and silence reads as approval | MITIGATE | `<received> of <spawned>` stated in output; an unreported lens is re-run or declared uncovered |
| The six open backlog specs get re-derived instead of closed | MITIGATE | Phase 1 loads them as inputs; each ends the run marked closed, still-open, or superseded |
| Overnight run burns significant token spend | ACCEPT | Named up front; the alternative is the same work spread across attended sessions |
| Findings in areas with no test coverage can't be proven fixed | DEFER | Report as unverified rather than claiming closed; needs its own coverage work |

**Non-Goals**
- Do NOT build the agent-callable API, MCP server, or any credential mechanism here. This
  spec is its precondition, not its first phase.
- Do NOT run any migration against prod. Branch only.
- Do NOT auto-restore a narrowed privilege (see Invariants).
- Do NOT rewrite `rls-drift-check.py`, `function-grant-drift-check.py`, or
  `check-rls-scope.py` wholesale — extend or supplement; three live security checks are not
  a refactor target inside an audit.
- Do NOT close a backlog spec (P1044/P1045/P1054/P1059/P1100) without evidence against the
  artifact — the spec text is not evidence.

## Done-When

- [ ] Reachability matrix exists covering every table in `pg_tables` **× all four reach
      classes (A anon, B authenticated cross-row, C column-level, D delivery surface)**, each
      cell citing the query run and the source it was derived from
- [ ] Known-bad control and known-good control both run through the identical probe and
      score differently — pasted output, not a claim
- [ ] Every Phase 1 finding is reproduced (query + role + observed rows) or downgraded to a lead
- [ ] Every finding carries exactly one disposition — closed / accepted-risk /
      unverified-fixed — and every `unverified-fixed` entry names the harness that is missing
- [ ] Each fix carries a canary observed RED before and GREEN after — exit codes pasted
- [ ] Each of P1044, P1045, P1054, P1059, P1100 is marked closed / still-open / superseded,
      with the command that settled it
- [ ] At least one review pass ran through `codex`, and `<reports received> of <spawned>` is
      stated with any uncovered lens named
- [ ] A standing recurring control is proposed **as a pre-commit check**, demonstrated
      failing on an injected widening (gate 7), demonstrated passing the repo's own
      documented migration workflow unchanged (gate 7c), and stating in its own output that
      its verdict is bounded by the migration files rather than by live prod
- [ ] Decision Criteria 1 answered Yes or No in writing, with the evidence behind it
- [ ] **The Criterion 1 verdict is written into P1215's gate row**, quoted, with the date and
      the commit that settled it. Added 2026-09-03: P1207 is P1215's hard dependency and until
      now named it nowhere, so the verdict would have landed in this file and never crossed.
      An unticked gate row in P1215 with a finished audit here is indistinguishable from an
      audit that was never run — and the failure direction is permissive, because the next
      reader assumes the dependency passed. **If the verdict is No, write that too** — a No is
      the more valuable half and the half nobody carries forward
- [ ] Nothing was run against prod that wrote

## Open Questions

**Both resolved 2026-09-01 by founder decision, before the run. Recorded here rather than
deleted — the reasoning is what a later reader needs.**

1. ~~What closes this audit?~~ → **RESOLVED: all four reach classes block (A/B/C/D above),
   with the three-way disposition in criterion 1b making that terminable.** The spec as
   filed proposed class A only; the agent recommended A+B and argued C/D should be
   enumerated-but-non-blocking on scope-cost grounds. The founder rejected that: parallel
   fan-out makes breadth close to free in wall-clock, so scope-cost is authoring effort
   dressed as a criterion — which this repo's Quality Over Build Speed rule bans in
   build-option recommendations. The surviving objection was **terminability**, not cost:
   class D has no harness, so under criterion 2 a class-D finding could be found and fixed
   but never *proven* closed, blocking the agent API on an unmeasurable rather than on a
   vulnerability. Resolved by generalising the accepted-risk hatch into the three
   dispositions, not by lowering the bar.

2. ~~Per-commit or per-day standing control?~~ → **RESOLVED: per-commit (pre-commit).**
   Catches a widening before it lands, rather than up to a day after. It **supplements and
   does not replace** the existing per-day live-DB drift checks (`rls-drift-check.py`,
   `function-grant-drift-check.py`) — see Non-Goals: those three live checks are not a
   refactor target inside this audit. Consequence to hold: a pre-commit check is
   necessarily **file-based**, so per the first Invariant its verdict is bounded by what the
   migrations say, not by what production does. It must state that bound in its own output;
   the live-DB legs remain the per-day checks' job.

3. **Open — to answer during Phase 1, not before.** Classes C and D need probes that do not
   exist yet (grant introspection; a live subscription client asserting per-user delivery).
   Phase 1 therefore partly *builds the instrument it measures with*. Whether that harness
   is throwaway or becomes the seed of the class-D standing control is a Phase 3 call, made
   with the harness in hand rather than guessed at now.

## Related

- **P1215** — the agent-callable surface this audit gates. Its phase-1 gate reads this
  spec's Criterion 1 verdict; see the Done-When row requiring the verdict be carried across.

- P1044, P1045, P1054, P1059, P1100 — open, narrow security specs; inputs to Phase 1
- P1048 / P1138 (`rls-drift-check.py`), P1065 (`function-grant-drift-check.py`),
  P1039 / P1041 (`check-rls-scope.py`) — the existing drift controls this audit complements
- decisions.md 2026-08-18 — `rls-drift-check.py`'s 2-element key gap, "needs its own spec"
- decisions.md 2026-04-03 — the last from-scratch audit (25 agents, 47 findings)
