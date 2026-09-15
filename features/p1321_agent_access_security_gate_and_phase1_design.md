---
status: week
type: task
rank: 105
workstream: infrastructure
created_date: '2026-09-15'
tags: [security, agents, rls, audit]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
blocked_by: []
blocks: [p1215]
related: [p1207, p1044, p1065, p1215]
---

# P1321: Answer the agent-access security gate, and design phase-1 agent access

## Problem

**Situation:** P1215 (a member's agent acts as them) cannot start: its first decision criterion requires
P1207's Criterion 1 — *is the permission surface safe to build agent access on?* — answered **Yes**. It was
answered **No** on 2026-09-03. Fixes reached production on 2026-09-07; the 2026-09-08 update kept the answer
No because four fixes were never re-probed on production, two items were open and unowned, and the audit was
never re-run. On 2026-09-15 the four fixes were re-probed and confirmed closed on production (private security
log, entry of that date). What remains is owned by nobody:

- a **test/production permission divergence** (production correct, test not), and no automated check that
  compares column-level grants at all;
- the **RLS-scope pre-commit gate** still misses several literal-true policy forms (P1044, backlog);
- **anonymous-callable database functions not on the allowlist** — reported by the function-grant drift
  check as gating findings, with no spec owning their triage;
- **no audit re-run** over the surface, which the gate text says is what answers Criterion 1;
- P1215's own **build blocker**: no authorization architecture exists.

**Complication:** The problem board's weekly flow (P1319, P1320, P1182) wants members' agents to draft and
read on their behalf. Founder framing, verbatim (2026-09-15, spelling corrected):

> *"I think designing and unlocking 1215 should be super easy and straightforward, we probably accomplish it
> tomorrow fully!"*

> *"How to prepare the spec now so the prompt can run overnight without my supervision and not asking me
> anything, so we can see how it went."*

**Question:** Can the gate be answered with evidence and the phase-1 (read-only) design be written and
independently reviewed, without any production write and without the founder present?

## Appetite

**Blast radius: high** — the output decides whether an authenticated agent entry path to the whole data
surface may be built. **Reversibility: high for this spec** — it writes to the test database, repo files and
private logs only; production changes are staged, never applied. **Decision density: one** — the allowlist
category question below.

## Invariants

- **No production writes.** Production is read only through `scripts/supabase-readonly-sql.py`. Migrations for
  production are written and staged, never applied; applying them is a founder step.
- **No locked credentials.** A step that needs a per-access-locked credential is skipped and logged; it never
  blocks waiting on a dialog.
- **A detector that can go blind must prove it can see.** Column and table grants are read from catalog ACLs
  (`pg_class.relacl` / `pg_attribute.attacl` via `aclexplode()`), never from `information_schema`, which is
  role-filtered and returns empty for the read-only role; every empty result is preceded by a liveness probe
  against grants known to exist (decisions.md 2026-09-14 [technical], P1214).
- **An unguarded route is not a call site.** An allowlist entry cites a real anonymous caller at file:line
  (decisions.md 2026-09-10 [technical]).
- **Exit 2 ("could not run") is never read as exit 0 ("clean").**
- **A merged fix is not a closed finding.** Closed means probed on production, with a control.
- **Specifics of any live, unfixed defect found stay out of public files** — they go to the private security
  log; a new live defect gets its own embargoed spec (`.claude/rules/features.md` Disclosure).

## Solution

Sequential, in one worktree:

1. **Gate fix — RLS-scope gate (P1044's scope):** the missed literal-true forms are detected, with committed
   fixtures that fail before and pass after.
2. **Grant divergence:** a column- and table-grant drift check exists (production vs test vs migrations), with
   a liveness probe and a demonstrated failure path. Test is converged to the migrations.
3. **Function-grant triage:** every gating finding gets exactly one verdict — allowlisted with a cited anonymous
   caller, or anonymous access revoked (both from the role and from PUBLIC) by a migration applied to **test
   only** and staged for production.
   `[FOUNDER DECISION: how to allowlist a grant required by an RLS policy predicate rather than a call site — the
   third allowlist category raised on 2026-09-10. Recommended: a "policy-required" category citing the policy.]`
4. **Audit re-run** over both roles (anonymous and cross-user authenticated), on test, with read-only
   production confirmation probes, ending in a written Criterion 1 answer — Yes or No — with evidence and
   controls.
5. **Phase-1 authorization architecture** for P1215 (read-only agent access): authorization server,
   audience, token exchange, callback, user binding, scope enforcement, `auth.uid()` derivation, kill switch,
   audit log — then **two consecutive blind adversarial review rounds** by reviewers who did not write it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The re-run finds a new live defect | MITIGATE | Private log + embargoed spec; Criterion 1 stays No |
| A revoke on test breaks a real anonymous flow | MITIGATE | Cite callers first; run the affected e2e lanes on test |
| Reviewer tools unavailable overnight (usage limits) | MITIGATE | Fall back to another independent reviewer; record which reviewed |
| Supabase Auth cannot issue the token shape the design needs | ACCEPT | Record it as the design's answer; that is a valid outcome |
| "Fully done tomorrow" includes building agent access | ACCEPT | Out of scope by design: P1215's own gate requires review before build |

**Non-Goals**
- Do NOT build phase-1 agent access — design and review only.
- Do NOT apply any migration to production.
- Do NOT push, ship or deploy.
- Do NOT modify P1215's Problem, Solution or Appetite; add evidence only.

## Done-When

- [ ] RLS-scope gate fixtures for the missed literal-true forms exit 1, a clean fixture exits 0, committed
- [ ] Column/table-grant drift check exists, exits 0 for test vs migrations after convergence, and its failure path was observed exiting non-zero
- [ ] `scripts/function-grant-drift-check.py` exits 0 against test, every former gating finding carrying a verdict
- [ ] Production revoke migrations (if any) are written and listed as staged, with none applied — verified against the production deploy manifest
- [ ] A re-audit report exists with a written Criterion 1 answer, controls shown for every empty result
- [ ] Phase-1 architecture document exists, with two consecutive blind review rounds recorded as `VERDICT: PASS`
- [ ] Every call made without the founder is recorded in an assumptions log

## Related

- P1215 — blocked by this spec
- P1207 — the audit whose Criterion 1 this re-answers; method record `docs/audits/p1207-phase1-findings.md`
- P1044 — the RLS-scope gate gaps (absorbed as step 1)
- P1065 — the function-grant drift check used in step 3
- [docs/problem-board-process.md](../docs/problem-board-process.md) — why the problem board wants this
