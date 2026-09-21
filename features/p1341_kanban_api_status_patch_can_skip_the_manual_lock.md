---
status: backlog
type: task
rank: 303
workstream: kanban
created_date: '2026-09-21'
tags: [kanban, api, locked_at, prioritize]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1341: A scripted status change on the kanban can skip the manual lock

## Problem

`tools/kanban/server/api.ts` writes `locked_at` on every status PATCH, unconditionally
(`// Lock status against automated overrides` block). `locked_at` is the manual-lock marker that
suppresses automated status transitions ([.claude/rules/features.md](../.claude/rules/features.md)
§Manual Status Lock), and that rule describes it as written by the **UI**. But
`/slava:maintain:prioritize` step 7 tells agents to prefer this API, and never mentions the lock.

On 2026-09-21 a `/prioritize` run stamped 31 specs this way, then P1297 and P1340 again. Each batch was
stripped by hand ([decisions.md](../docs/decisions.md) 2026-09-21 [process], board refit). A stray lock
stops `/dev` from setting `in-progress`. The founder's real locks had to be told apart by timestamp.

> Founder, 2026-09-21, on the locks this run had to keep apart from his own: *"yes move the two to backlog - ; a ok do it; locked specs yes to backlog all"* — then, confirming this fix at /kdd: *"sure yes fix"*.

## Appetite

Blast radius: the kanban status endpoint, used by the UI and by agents. Reversibility: git revert.
Decision density: none.

## Solution

- The status PATCH accepts an optional `lock` field. `lock: false` skips the stamp. Absent means today's
  behaviour, so a human drag in the UI still locks.
- The prioritize skill's curl examples pass `"lock": false`, and step 7 says why.
- `.claude/rules/features.md` §Manual Status Lock says the API writes the lock too, unless `lock: false`.

## Invariants

- A drag in the kanban UI keeps writing `locked_at`, exactly as today.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Another caller relies on the API always locking | MITIGATE | Grep every caller first. Found on 2026-09-21: the UI, `fix-kanban.md` and `kdd/SKILL.md` (a cache-refresh GET only); re-check at build time |

**Non-Goals**
- Do NOT change what `locked_at` means or who may clear it.

## Done-When

- [ ] A PATCH with `lock: false` changes the status and writes no `locked_at`, proven by a test that fails without the change
- [ ] A PATCH without `lock` still writes `locked_at`, covered by a test
- [ ] The prioritize skill's examples and `features.md` §Manual Status Lock describe the switch

The `.claude/rules/features.md` edit goes through `/slava:maintain:claude-md` first.
