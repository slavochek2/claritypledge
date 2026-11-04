---
status: qa
type: story
rank: 88
workstream: infrastructure
created_date: '2026-11-04'
tags: [day, keys]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1610: The Day page moves to the CP board, and every AI key says what it is for

## Problem

**Situation:** The Day page runs on the personal board because its data is private. AI keys are monitored per key, identified only by a name and a vague holder.
**Complication:** Private describes where data is stored, not which board shows it, so the founder juggles two boards. A key card does not say what the key is for or what stops if it dies.
**Question:** Can the Day page sit on the main board with its data unmoved, and can every key explain itself?

> Founder, verbatim: "private doesn't mean it has to be shown in pp kanban"

## Appetite

One launcher setting, one registry field, one line on the key card.

## Solution

1. The CP launcher sets the Day data directory; the personal launcher unsets it. The data stays outside every repo.
2. The terminal card links to the CP board.
3. The key registry gains a `purpose` field. Issuing a key without one is refused.
4. The Monitor key card shows the purpose, or says it is not recorded.

## Risks / Non-Goals

- **ACCEPT:** a board started from a worktree also shows Day, reading the same data.
- **Non-goal:** moving Day's data or changing the personal board's tasks.

## Done-When

- [x] The CP launcher sets the Day directory and the personal launcher does not.
- [x] `ai-keys --issue` without a purpose is refused.
- [x] Every active registry key has a purpose.
- [x] The Monitor key card renders the purpose, with a visible fallback.
