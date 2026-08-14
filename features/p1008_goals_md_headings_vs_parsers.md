---
status: backlog
type: bug
rank: 80
created_date: '2026-07-23'
tags: [tooling, kanban, docs, goals]
---

# P1008: `goals.md` headings and its two parsers have drifted apart

## Problem

**Situation:** Two consumers parse `docs/goals.md` by `##` heading: the kanban server (`tools/kanban/server/api.ts`, `GET /api/goals-strategic`) and `/day` step 3 (`.claude/commands/slava/day.md:556-575`). Both look for `## Next Steps`, `## Dos`, `## Don'ts`, and an optional `## Last Weekly Review (...)`.

**Complication:** `goals.md` has none of those headings. Its actual sections are the active-motion section, `## Dormant / Superseded`, and `## See Also`. So the endpoint returned `{steps:[],dos:[],donts:[],weeklyReview:null}`, the kanban Goals page rendered "No goals. Edit `docs/goals.md`.", and `/day`'s WHAT'S NEXT block printed empty — for an unknown period, with no error anywhere.

**Already fixed (2026-07-23, this is NOT the remaining work):** the *silence*. The endpoint now returns a `structureNotFound: {expected, found}` payload when it matches none of its sections; `GoalsPage.tsx` renders the mismatch instead of "No goals"; `/day` prints an explicit unavailable line instead of an empty block. Verified live:

```
$ curl -s localhost:9051/api/goals-strategic
{"steps":[],"dos":[],"donts":[],"weeklyReview":null,
 "structureNotFound":{"expected":["Next Steps","Dos","Don'ts"],
 "found":["[SUPERSEDED 2026-07-20 — pending rewrite] Paid 1:1 coaching bridge (key-hire motion)",
          "Dormant / Superseded (git history holds the detail)","See Also"]}}
```

**Question (the actual open decision):** which side is wrong — the doc or the parsers?

- **A: restore the headings in `goals.md`.** Re-adds a numbered `## Next Steps` checklist, `## Dos`, `## Don'ts`. Makes the tooling work again as designed and gives `/day` a live queue. Cost: `goals.md` currently has no executable tactical plan at all — the 2026-07-20 wedge flip superseded the rung ladder and the rewrite hasn't happened (see `docs/decisions.md` 2026-07-23 [process]). Restoring headings before that rewrite means inventing steps, which is a `[FOUNDER DECISION]`, not a tooling fix.
- **B: reteach the parsers.** Point them at whatever structure `goals.md` actually settles into after the rewrite. Cost: the structure isn't settled yet, so this is premature.
- **C: retire the Goals page and `/day`'s WHAT'S NEXT block.** If `goals.md` is a narrative strategy doc rather than a checklist, neither consumer has a job. Cost: loses the daily surfacing of tactical next steps.

**Do not decide this inline.** It depends on the `goals.md` rewrite that the wedge flip made due, which is a founder call about the tactical motion — not a parser question.

## Acceptance Criteria

- [ ] The `goals.md` post-wedge-flip rewrite has happened (or been explicitly deferred with a reason).
- [ ] One of A / B / C is chosen and recorded in `docs/decisions.md`.
- [ ] `curl localhost:9051/api/goals-strategic` returns populated data, or the Goals page and `/day` block are removed — no third state where the signal is permanently on.
- [ ] The `structureNotFound` path still has a test or a manual repro proving it fires (it is a failure detector; per `.claude/rules/epistemic.md` gate 7 it must be seen to fire, not assumed).

## References

- `docs/decisions.md` 2026-07-23 [process] — the canary repair + the honest limit that nothing mechanical watches `goals.md`
- `tools/kanban/server/api.ts` — `GET /api/goals-strategic`
- `tools/kanban/src/components/GoalsPage.tsx`
- `.claude/commands/slava/day.md` §3 Goals & Milestone
