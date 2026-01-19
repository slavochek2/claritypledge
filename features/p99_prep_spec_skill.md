# P99: /prep-spec Skill

**Status:** Idea — Needs validation with P61 first
**Priority:** Low (nice-to-have workflow optimization)
**Origin:** Reflection during P61 planning session

---

## Problem

When preparing specs for implementation, I manually:
1. Review with UX agent (BMAD) → find UX blindspots
2. Review with Architect agent (BMAD) → find technical blindspots
3. Run `/simplify` → surface decisions needed
4. Analyze size → decide `/loop` vs `ralph-loop`
5. If ralph-loop → create UAT file manually

This takes 30+ minutes and context switching between agents.

---

## Proposed Skill: /prep-spec

```
/prep-spec <path-to-spec>
```

### What It Does

1. **Quick Analysis** (before spawning agents)
   - Line count → estimate context pressure
   - Check for prerequisites/dependencies
   - Identify phases/checkpoints

2. **Parallel Reviews** (spawn agents)
   - UX Agent: User flows, edge cases, accessibility
   - Architect Agent: Technical blindspots, existing code reuse
   - [Optional] TEA Agent: Testability concerns

3. **Synthesize**
   - Merge findings, dedupe
   - Run `/simplify` logic
   - Recommend execution: `/loop` vs `ralph-loop`

4. **Output**
   - `bmad/artifacts/{spec-name}-review.md` with:
     - Combined blindspots
     - Decisions needed (with recommendations)
     - Execution recommendation
   - If ralph-loop: offer to generate `{spec-name}_acceptance_tests.md`

5. **Ask User**
   - "Review findings and approve execution plan?"

---

## Key Insight: UAT Generation

If `/prep-spec` recommends ralph-loop, it should offer to generate the UAT file:
- Extract success criteria from spec
- Convert to Given/When/Then format
- Create scorecard table
- Add ralph-loop instructions

This is the most time-consuming part of manual prep.

---

## Thresholds (to validate)

| Metric | /loop | ralph-loop |
|--------|-------|------------|
| Spec lines | < 500 | > 500 |
| Phases | 1-2 | 3+ |
| Estimated context usage | < 50% | > 50% |

---

## Open Questions

1. **Should agents run in parallel or sequential?**
   - Parallel: faster
   - Sequential: can build on each other's findings

2. **What if agents disagree?**
   - Surface both views, let user decide

3. **How to estimate context usage?**
   - Line count + expected code reads + expected code writes

4. **Should it auto-run or just recommend?**
   - Probably recommend, user confirms

---

## Validation Plan

1. Complete P61 using ralph-loop manually
2. Reflect: what would /prep-spec have caught?
3. Extract pattern into skill
4. Test on next feature spec

---

## Related

- `/loop` — Single-session dev loop
- `/simplify` — Decision surface tool
- `ralph-loop` pattern — Iterative UAT loop
- P61 acceptance tests — First manual UAT file
