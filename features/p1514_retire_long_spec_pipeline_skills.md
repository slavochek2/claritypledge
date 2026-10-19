---
status: week
type: task
rank: 44
workstream: process
created_date: '2026-10-19'
tags: [skills, process, archive]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1514: Retire /architect, /spec-review, /challenge-prd and the long spec pipeline

## Problem

**Situation:** Specs are now filed with `/create-spec`, reviewed by several models (Gemini, Opus,
Codex; decisions.md 2026-10-16 [process], "Spec reviews by three different models catch different
blockers") and built with `/dev`, whose end-of-build review is `/finish` (P1505). The older long
pipeline (`/create-spec` → `/ux` → `/architect` → `/ui` → `/generate-tests` → `/decompose` →
`/spec-review` / `/challenge-prd` → `/dev`) is still described as the process and referenced from
about 24 files.
**Complication:** Agents still recommend the long pipeline (P1508 carried "`/architect`
recommends" until 2026-10-19), and `docs/software-delivery-process.md` still routes through
`/pick-flow`, deprecated 2026-10-07.
**Question:** Archive the skills the founder named and point every reference at what replaced them.

> Founder, 2026-10-17: "I'm not sure we need architect ... retire for now architect and big flow and
> spec review and challenge PRD ... put them in archive or something depreciated unless you object."

## Appetite

Blast radius: skill files, two rule files and the delivery-process doc; no product code.
Reversibility: high (git revert; archived files stay in `archive/`).
Decision density: low; one founder call on the skills listed under Open Questions.

## Solution

- Archive `/architect`, `/spec-review` and `/challenge-prd` per `.claude/rules/skills.md`
  (references first, then move to `.claude/commands/slava/archive/` with `archived_reason`).
- Remove the long pipeline as a described route: update `docs/software-delivery-process.md` (also its
  stale `/pick-flow` rows) and any skill that tells the reader to run the archived skills, pointing at
  `/create-spec` + multi-model spec review + `/dev` (+ `/finish`).
- `.claude/rules/features.md` and `.claude/rules/spec-sections.md` change only through the
  `/slava:maintain:claude-md` gate; keep section names that existing specs still use (mark them
  legacy, do not delete readers' aliases).
- One decisions.md entry.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A live skill still calls an archived one and silently does nothing | MITIGATE | Grep every reference; each is updated or carries a kept-on-purpose note. |
| Old specs carry `## Technical Architecture` etc. | ACCEPT | Readers keep the legacy aliases; nothing is batch-migrated. |

**Non-Goals**
- Do NOT archive `/ux`, `/ui`, `/generate-tests`, `/decompose` or `/prep-spec` in this task; list them
  with evidence for the founder (Open Questions).
- Do NOT change `/dev`, `/finish` or `/ship` behaviour beyond removing references.
- Do NOT edit CLAUDE.md beyond reference fixes, and only through the gate.

## Done-When

- [x] The three skills are in `archive/` with `archived_reason`.
- [x] `grep -rE "(/|:)architect\b|spec-review|challenge-prd"` over `.claude/`, `scripts/`, `docs/software-delivery-process.md` and CLAUDE.md returns only archive files, history, or lines carrying a kept-on-purpose note.
- [x] The delivery-process doc describes the current route and no longer names `/pick-flow` as live.
- [x] `./scripts/pre-commit-checks.sh` passes.

## Open Questions

1. `/ux`, `/ui`, `/generate-tests`, `/decompose`, `/prep-spec` (already deprecated): retire too, or keep
   as optional tools? The build reports their last real use.
