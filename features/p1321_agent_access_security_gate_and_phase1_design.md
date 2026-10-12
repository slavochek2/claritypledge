---
status: in-progress
type: task
rank: 105
workstream: infrastructure
created_date: '2026-09-15'
tags: [security, agents, rls, audit]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
blocked_by: []
blocks: [p1215]
related: [p1207, p1044, p1065, p1215]
---

# P1321: Answer the agent-access security gate, and design phase-1 agent access

> **Split 2026-10-09 (founder):** the phase-1 design (Solution step 5) and its open round-2 findings
> moved to [P1452](p1452_agent_access_phase1_design_revision.md). This spec closes on steps 0–4.

> **Deferred to backlog 2026-09-21 (founder).** Agent access comes after the champion-pilot and weekly-event work ([decisions.md](../docs/decisions.md) 2026-09-21 [product]). Unowned security items here (untriaged anonymous-callable functions) stay open; revisit before any agent work starts.

## Problem

**Situation:** P1215 (a member's agent acts as them) cannot start: its first decision criterion requires P1207's
Criterion 1 — *is the permission surface safe to build agent access on?* — answered **Yes**. It was answered
**No** on 2026-09-03. Fixes reached production on 2026-09-07; the 2026-09-08 update kept the answer No because
four fixes were never re-probed on production, two items were open and unowned, and the audit was never re-run.
On 2026-09-15 the four fixes were re-probed and confirmed closed on production (private security log, entry of
that date). What remains is owned by nobody:

- a **test/production permission divergence** (production correct, test not), and no automated check that
  compares column-level grants;
- the **RLS-scope pre-commit gate** still misses several literal-true policy forms (P1044, backlog);
- **anonymous-callable database functions not on the allowlist**, reported by the function-grant drift check as
  gating findings, with no spec owning their triage — and that check's own hermetic test suite currently crashes;
- **no audit re-run** over the surface, which the gate text says is what answers Criterion 1;
- P1215's own **build blocker**: no authorization architecture exists.

**Complication:** The problem board's weekly flow (P1319, P1320, P1182) wants members' agents to draft and read
on their behalf. Founder framing, verbatim (2026-09-15, spelling corrected):

> *"I think designing and unlocking 1215 should be super easy and straightforward, we probably accomplish it
> tomorrow fully!"*

> *"How to prepare the spec now so the prompt can run overnight without my supervision and not asking me
> anything, so we can see how it went."*

**Question:** Can the gate be answered with evidence and the phase-1 (read-only) design be written and
independently reviewed, without any production write and without the founder present?

## Appetite

**Blast radius: high** — the output decides whether an authenticated agent entry path to the whole data surface
may be built. **Reversibility: high for this spec** — it writes to the test database, repo files and private logs
only; production changes are staged, never applied. **Decision density: one** — the allowlist category below,
which must be answered before an unattended run starts.

## Invariants

- **No production writes, enforced rather than instructed.** The run's process environment carries no production
  write credential — only the read-only token used by `scripts/supabase-readonly-sql.py`. Production migration
  history is captured read-only before the run and after it, and the two must be identical.
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
- **Specifics of any live, unfixed defect found stay out of public files** — private security log; a new live
  defect gets its own embargoed spec (`.claude/rules/features.md` Disclosure).

## Solution

Sequential, in one worktree:

0. **Repair the instrument first:** the function-grant drift check's hermetic test suite passes again (a test
   double no longer matches the probe function's signature).
1. **RLS-scope gate (P1044's scope):** the missed literal-true forms are detected, with committed fixtures that
   fail before and pass after.
2. **Grant divergence:** a column- and table-grant drift check (production vs test vs migrations), with a liveness
   probe and a demonstrated failure path. Test is converged to the migrations.
3. **Function-grant triage:** every gating finding gets exactly one verdict — allowlisted with a cited anonymous
   caller, or anonymous access revoked (from the role and from PUBLIC) by a migration applied to **test only** and
   staged for production.
   `[FOUNDER DECISION: how to allowlist a grant required by an RLS policy predicate rather than a call site — the
   third allowlist category raised 2026-09-10. Recommended: a "policy-required" category citing the policy.
   Must be answered in Resolved Decisions before an unattended run.]`
4. **Audit re-run** over both roles (anonymous and cross-user authenticated), on test, with read-only production
   confirmation probes, ending in a written Criterion 1 answer — Yes or No — with evidence and controls.
5. **Phase-1 authorization architecture** for P1215 (read-only agent access): authorization server, audience,
   token exchange, callback, user binding, scope enforcement, `auth.uid()` derivation, kill switch, audit log —
   then **two blind adversarial review rounds** by reviewers who did not write it, each finding resolved or
   explicitly accepted in the document.
   **Moved to [P1452](p1452_agent_access_phase1_design_revision.md) on 2026-10-09 (founder).** The draft and
   both review rounds were done here; round 2 returned NO with its findings left open, and the revision and
   third round belong to P1452. This spec keeps steps 0–4.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The re-run finds a new live defect | MITIGATE | Private log + embargoed spec; Criterion 1 stays No |
| A revoke on test breaks a real anonymous flow | MITIGATE | Cite callers first; run the affected e2e lanes on test |
| Reviewer tools unavailable overnight (usage limits) | MITIGATE | Fall back to another independent reviewer; record which reviewed |
| Supabase Auth cannot issue the token shape the design needs | ACCEPT | A valid outcome; record it as the design's answer |
| "Fully done tomorrow" includes building agent access | ACCEPT | Out of scope by design: P1215 requires a reviewed design before build |

**Non-Goals**
- Do NOT build phase-1 agent access — design and review only.
- Do NOT apply any migration to production.
- Do NOT push, ship or deploy.
- Do NOT modify P1215's Problem, Solution or Appetite; add evidence only.

## Done-When

- [x] `python3 scripts/test-function-grant-drift-check.py` exits 0
  - **Evidence (2026-10-09):** exit 0, `65/65 assertions held.`
- [x] RLS-scope gate fixtures for the missed literal-true forms exit 1, a clean fixture exits 0, committed
  - **Evidence (2026-10-09):** `npx vitest run src/tests/p1044-reproduce.test.ts` — 48/48 passed; the
    constant-predicate forms assert exit 1 (L143, L151, L161), annotation bypasses exit 1
    (L60–L90), and a genuine annotation or a clean file exits 0 (L98, L106, L115).
    Committed in 70fdd73a8 and d32ffa65d.
- [x] Column/table-grant drift check exists, exits 0 for test vs migrations after convergence, and its failure path was observed exiting non-zero
  - **Evidence (2026-10-09):** `scripts/table-grant-drift-check.py` (fb588b46c). `--env test` against this
    branch's tree: **exit 1**, two findings, both `UPDATE letter_deliveries` — P1446's grant narrowing,
    which is applied on test (and prod) but not yet on main, so not in this tree. That is the failure
    path, observed on a real divergence. Same run with `--migrations-dir` = this tree plus P1446's two
    migration files: **exit 0**, `no drift — every compared privilege agrees`, liveness controls passed.
  - **Re-run 2026-10-12 after review hardening** (an unmodelled table clients can reach is now
    gating; any crash exits 2): it flagged two test-only orphan tables no migration creates, fully
    open to client roles. Founder: drop them on test (done; 54 + 11 rows; nothing on prod; their
    three stale `rls-drift-allowlist.txt` lines removed). Replay of this tree plus the migrations
    applied on test from other branches (P1446, P1447, P1451): `Table grants: clean (test vs
    migrations; 77 live tables compared)`, exit 0. Scheduled daily in `/day` (`cp.tablegrants`).
- [x] `scripts/function-grant-drift-check.py` exits 0 against test, every former gating finding carrying a verdict
  - **Evidence (2026-10-09):** exit 0, `no unallowlisted anon-executable function, no prod/test grant
    divergence` (prod 32 / test 34 anon-executable; guard probe rolled back). The run first exited 1 on
    one gating finding, `submit_calendar_source(text,text)` — P1447's signed-out suggestion box, shipped
    the same day without an allowlist entry. Verdict: allowlisted with its real anonymous call site
    (`/cm` is a public route; `src/app/data/calendar-sources.ts:42`). The eleven findings of step 3
    carry their verdicts in assumptions entry 2.
- [x] No production write outside founder-approved applies; staged production migrations are listed
  - **Reworded 2026-10-09.** Original text: *"Production migration history read (read-only) before and
    after the run is identical; staged production migrations, if any, are listed."* It cannot be met as
    written and no longer describes the intent: no snapshot was taken before the run (assumptions entry
    12), and the founder then had four of this spec's fixes applied to prod on purpose (entry 21). The
    reworded form is the part of Invariant 1 that the Resolved Decisions entry of 2026-09-16 says still
    holds.
  - **Evidence (2026-10-09):** prod `supabase_migrations.schema_migrations` from 20261008 on, read
    read-only: 20261008210000, …230000, …231000, …232000 (this spec; applied on the founder's go,
    entry 21), 20261009090000, …090100 (P1446; founder's go, same session), 20261009150000, …160000
    (P1447's own ship). No other version. **Staged, not on prod:** 20261008220000 (R1), held by its
    `requires-frontend: 4b29965e1` coupling until that commit is on origin/main.
- [x] A re-audit report exists with a written Criterion 1 answer, controls shown for every empty result
  - **Evidence:** [docs/audits/p1321-reaudit.md](../docs/audits/p1321-reaudit.md) — Criterion 1:
    **No**; the Method table pairs each class with its control (class B's positive control, class D's
    harness control).
- Phase-1 architecture document with two blind review rounds — **moved to
  [P1452](p1452_agent_access_phase1_design_revision.md) (2026-10-09).** The document and both rounds
  exist (`docs/technical/agent-access-phase1-architecture.md` § Review record); round 2 returned NO with
  C1 and H1–H5 open, which is P1452's starting point.
- [x] `features/verification/p1321/assumptions.md` exists and every entry has a date, the call made, and why
  - **Evidence (2026-10-12):** 22 entries, each with a date, a call and a why. Entry 16 was an open
    founder decision; entry 22 records the founder's call on it (ship, push, apply R1 at once).

## Resolved Decisions

**2026-09-16 — Allowlist category for a grant an RLS policy requires** (answers the
`[FOUNDER DECISION]` marker in Solution step 3). Add a third category, **policy-required**: the
entry cites the policy whose predicate needs the grant — schema, table and policy name — instead of
a call site, and the triage step asserts that policy still exists. The existing rule is unchanged for
everything else: a call-site entry still needs a real anonymous caller at `file:line`
(decisions.md 2026-09-10 [technical]). Grants that are neither are revoked, not listed.

**2026-09-16 — Execution is ATTENDED. The unattended path is dropped.** No `/goal` loop, no
goal-gate contract, no contract pin, no turn cap. The founder starts the work and is present for it;
sequential, in one worktree, as planned.

Why: this spec's first invariant asked that the run's process environment hold **no production write
credential**, enforced rather than instructed. Preparing that showed it cannot be ensured on the
founder's account as it stands — the mechanism is recorded in the private security log entry of
2026-09-15 ("Credential exposure found while preparing P1321's unattended run"), which also carries
one finding that needs action independently of this spec. Options offered were: a separate macOS
account for the run, rotating the exposed credentials first, or attended execution. **Founder chose
attended execution** (2026-09-16), explicitly dropping the overnight requirement.

**Invariant 1 therefore does not hold as written and is the founder's to edit.** Proposed
replacement, not applied here: *"Attended execution. No production write is performed. Production is
read only through `scripts/supabase-readonly-sql.py`; any step that would write to production stops
and asks. Production migration history is captured read-only before and after the work, and the two
must be identical."* The last sentence is the part that still holds unchanged.

**2026-09-16 — Reviewers.** Security findings and the phase-1 design go to **Codex Sol** via
`~/.agents/bin/codex-review`. If it errors or hits a usage limit: a **Fable** subagent, then an
**Opus** subagent. Record which reviewer actually reviewed each round.
`~/.agents/bin/delegate-gemini` is for **public documentation research only** — never send it a
security finding, an audit result, or any part of the private log.

## Related

- P1215 — blocked by this spec
- P1207 — the audit whose Criterion 1 this re-answers; method record `docs/audits/p1207-phase1-findings.md`
- P1044 — the RLS-scope gate gaps (absorbed as step 1)
- P1065 — the function-grant drift check used in steps 0 and 3
- [docs/problem-board-process.md](../docs/problem-board-process.md) — why the problem board wants this
