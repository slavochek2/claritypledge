---
status: week
type: task
rank: 25
workstream: infrastructure
created_date: '2026-10-08'
tags: [day, agent-vm, cleanup]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1443: /day — stop monitoring the agent VM / LinkedIn helper

Split out of P1440 (founder decision 2026-10-08: three specs).

## Problem

> Founder framing, verbatim (2026-10-08, relayed by the lead session): "Stop monitoring the LinkedIn app / agent VM health in /day"

**Situation:** Every /day pass runs Step 3 (`disp.3`, agent VM health via
`/slava:util:agent-vm-health`) and Step 3.5 (`disp.3h`, heal via `/slava:util:agent-vm-heal`),
records check `disp.vm` ("LinkedIn helper machine", `~/.claude/scripts/day-checks.tsv:34`), and can
file the `vm:outreach-down` finding ("LinkedIn outreach is not running").

**Complication:** The founder decided on 2026-10-08 that /day no longer monitors this. The steps
still cost a gcloud call and a skill run each pass and still put VM cards on the board (the 10-08
run had `disp.vm:vm:outreach-down` on the board).

**Question:** Remove the steps cleanly so the step ledger, the check list, the prose and the board
agree, and nothing else in /day breaks.

## Appetite

Blast radius: low — one /day section and two manifests. Reversibility: high — git revert in
`~/.claude`. Decision density: one (CRM row scope, below).

## Invariants

- `day-step.sh check-sync <day-steps.tsv> <day.md>` prints SYNC OK after the change. Manifest and
  prose change in one commit — the check fails in both directions on a half change.
- The `agent-vm-health` / `agent-vm-heal` skills keep working as before and the VM is untouched;
  only the caller note in `agent-vm-heal.md` changes.

## Solution

Remove, in one commit in `~/.claude`:
- `day-steps.tsv` rows `disp.3`, `disp.3h`; `day-checks.tsv` row `disp.vm`.
- `day.md`: the "b) Agent VM — see Step 3" pointer (~1080), all of Step 3 "Cloud Server Check"
  (~1084–1143, it is VM-only), Step 3.5 (~1144–1194), the summary/example lines that name the VM
  (~236, ~251, ~1219–1222, ~1229) and the fingerprint examples using Agent VM /
  `vm:outreach-down` (~2109–2111, swap in another real check). The CRM-ingest heading (~936)
  "not redundant with Agent VM" is reworded.
- `day-gates.sh` D6 line (~402) lists "Step 3 Agent VM"; drop it.
- `day-checks.tsv` group "Outreach machine" becomes empty; confirm `day-render.ts` handles a
  group with no rows (it groups from the rows present).
- `agent-vm-heal.md` names "Step 3" of /day as its caller; update its caller note.
- Earlier runs: the board renders each run from its own report, so earlier reports keep their VM
  card as history; the latest run simply has none. No "no longer reported" state is added (the board
  has none today, verified: no such state in `day.ts` card states).
- `tools/kanban/server/__tests__/day-render.test.ts` uses `disp.3` / `vm:healer-gave-up` only as
  fixture ids for generic finding behaviour; they stay (invented ids are fine).

The CRM-ingest row `disp.crm` ("LinkedIn data reached the CRM") hangs off step `disp.2a2`, not the
VM step, so it stays in this spec's scope boundary. [FOUNDER DECISION, non-blocking: remove
`disp.crm` too? If yes it is a follow-up change, not part of this one.]

Sequencing: `~/.claude/commands/day.md` had another session's staged edits at filing time. Re-check
`git -C ~/.claude status --short commands/day.md` immediately before editing; edit only when clean.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Half change blocks every /day pass | MITIGATE | One commit; check-sync before commit |
| Co-tenant edit to day.md lost | MITIGATE | Clean-status check right before the edit; edit in a worktree-equivalent scratch copy is not possible for ~/.claude, so the window is kept short |

**Non-Goals**
- Do NOT delete the VM skills, the VM, or its healer.
- Do NOT change other /day steps.

## Done-When

- [ ] `day-step.sh check-sync` prints SYNC OK (pasted)
- [ ] `grep -nE 'disp\.3\b|disp\.3h|disp\.vm|vm:outreach-down|Agent VM|agent-vm-(health|heal)' ~/.claude/scripts/day-steps.tsv ~/.claude/scripts/day-checks.tsv ~/.claude/scripts/day-gates.sh ~/.claude/commands/day.md` returns nothing (pasted)
- [ ] The existing day test suites pass (`day-step.test.sh`, `day-gates.test.sh`, `day-report-sections.test.sh`, kanban `day-render` tests)
- [ ] A /day pass after the change records no VM step or check, and its board shows no VM card

## Related

- P1440, P1442 (split siblings); P1399 (the step ledger and check-sync)
