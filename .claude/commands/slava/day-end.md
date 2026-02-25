# Day End (/day-end)

End-of-day reflection. No questions asked. Synthesizes what happened, surfaces insights,
saves learnings to memory, and leaves you excited and clear about tomorrow.

## Steps

### 1. Gather today's data (run in parallel)

- **Git log**: `git log --oneline --since="6am today" --author-date-order`
- **Milestone**: Read `docs/milestones/c1-stories-live-events.md` — note all `[x]` steps and the gate condition
- **KDD**: KDD is distributed — check `docs/decisions.md`, `docs/technical/` files, and `features/done/INDEX.md`. Also scan git log for `docs(kdd):` prefix commits today.
- **Memory**: Read `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/memory/MEMORY.md`
- **Features done today**: `git log --oneline --since="6am today"` — look for `feat:`, `fix:`, `docs:`, `tests:` prefixes

### 2. Synthesize (internal, don't show raw data)

From the gathered data, form an honest picture:
- What actually shipped (commits, features closed)
- What milestone steps advanced
- Any learnings or patterns from KDD or commit messages
- Any notable challenge overcome (hard bug, blocked path found, decision made)
- What's the single most important next step tomorrow (first `[ ]` in milestone)

### 3. Output — the reflection

**Language rules (critical):**
- Translate everything into user value and business impact. Never use ticket numbers (P413, P427), engineering terms (RLS, schema, trigger, NULL guard, migration, e2e), or internal jargon.
- "P413 closed" → "users can now see how calibrated their communication is after enough sessions"
- "RLS locked down" → "your data is private — only you see your results"
- "E2E tests passing" → "the feature is stable and won't break on users"
- If something shipped but has no user-facing impact yet, describe what it enables or protects.
- Speak as if talking to yourself as a founder: your life, your users, your business growth, your vision.

Output is bullet-driven. Tight. No padding.

```
SHIPPED
• [what users can do now that they couldn't before — one line each]
• [include specs, designs, and plans — "designed X flow", "planned Y feature" counts as real work]
• [if infra/reliability work: what it protects — "data backed up daily to cloud"]

BUSINESS
• [how you moved toward the pilot / first paid session / milestone gate — one line each]

INSIGHT  (skip if nothing real)
• [one thing learned about users, product, or yourself as founder]

CHALLENGE  (skip if nothing real)
• [real obstacle — what it revealed, not the technical detail]

TOMORROW
→ [one clear next move + why it matters now]
```

### 4. Save learnings to memory (auto, no confirmation needed)

After outputting the reflection, silently update memory:
- If INSIGHT OF THE DAY is substantive → append to relevant topic file in memory dir, or create `daily-insights.md`
- If CHALLENGE WORTH NOTING reveals a pattern (recurring issue, systemic friction) → add to `MEMORY.md` under a relevant heading
- If a new tool/script/workflow was discovered today → add to the relevant memory section
- Do NOT save trivial observations. Only save things that would be useful in a future session.

Use Edit tool on the memory files — brief, factual entries only.

## Tone

- Direct. Warm. No fluff.
- Celebrate real progress, not effort theater.
- The tomorrow section should feel like clarity + pull, not a to-do list.
- Total output: ~15-20 lines. Dense and useful, not padded.

## Notes

- Never ask questions. This is a read-only reflection — fully automated.
- If git log is empty (no commits today), say so honestly: "No commits today." Then reflect on
  what non-code work happened (planning, research, decisions) based on any KDD or milestone reads.
- Run data gathering steps in parallel using the Task tool where possible.
