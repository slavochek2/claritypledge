---
status: in-progress
type: bug
rank: 1000723.0
severity: low
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, sent-tab, inbox-tab, polling]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P723: Polling gaps from P720 Opus critique

## Problem

Three gaps survive in the P720 polling implementation:

1. **visibilitychange doesn't reset the interval** — if the user returns at second 14 of the 15s cycle, they still wait another 14s for the next fetch. The interval should restart on visibility.
2. **Polling never stops** — once all sent letters have `completed` deliveries, `fetchData` keeps firing every 15s forever (wasted requests).
3. **Skill handoff gap** — `/reproduce` writes canary tests with tight timeouts to prove staleness bugs, but `/fix` has no signal to update them to the real polling interval after the fix. Hit in P720 (5s → 20s).

## Solution

**Code (sent-tab.tsx + inbox-tab.tsx on w2/feature/letters-ship):**
- Reset interval on visibilitychange (clearInterval + new setInterval)
- sent-tab only: add `allTerminalRef` (useRef) + syncing useEffect; skip fetch when all terminal
- inbox-tab: interval reset only (no terminal stop — inbox is a live feed)

**Skills (main):**
- `reproduce/SKILL.md`: add optional `post_fix_timeout` field to `reproduce_artifact` schema
- `fix/SKILL.md`: in Phase -1, update canary timeout to `post_fix_timeout` value before running

## Done-When

- [ ] `sent-tab.tsx` resets interval on visibilitychange + skips fetch when all-terminal
- [ ] `inbox-tab.tsx` resets interval on visibilitychange
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes (1844 tests)
- [ ] `e2e/p720-sent-tab-realtime.spec.ts` canary still passes
- [ ] `reproduce/SKILL.md` has `post_fix_timeout` field documented
- [ ] `fix/SKILL.md` references `post_fix_timeout` in Phase -1
