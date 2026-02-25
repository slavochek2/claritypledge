# Day End (/day-end)

End-of-day reflection. No questions asked. Synthesizes what happened, surfaces insights,
saves learnings to memory, and leaves you excited and clear about tomorrow.

## Steps

### 1. Gather today's data (run in parallel)

- **Cloud server status**: `gcloud compute instances list --filter="name=clarity-agent" --format="value(name,status,zone)"` — note if RUNNING or TERMINATED
- **Git log**: `git log --oneline --since="6am today" --author-date-order`
- **Activity log (today)**: `grep "^$(date +%Y-%m-%d)" .private/logs/activity.log 2>/dev/null || echo "no activity log yet"` — count entries (= N status checks today). Detect: **attention shift** = P-number in `active:` field changes between consecutive entries. **Persistent blocker** = same keyword appears in `blocked:` field in 2+ non-adjacent entries.
- **Milestone**: Read `docs/milestones/c1-stories-live-events.md` — note all `[x]` steps and the gate condition
- **KDD**: KDD is distributed — check `docs/decisions.md`, `docs/technical/` files, and `features/done/INDEX.md`. Also scan git log for `docs(kdd):` prefix commits today.
- **Memory**: Read `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/memory/MEMORY.md`
- **Features done today**: `git log --oneline --since="6am today"` — look for `feat:`, `fix:`, `docs:`, `tests:` prefixes
- **New signups today**: Supabase MCP, prod project `besjtuodziykmjidubzw`: `SELECT count(*) FROM profiles WHERE created_at > now() - interval '24 hours'`
- **Sentry today**: Sentry MCP (`mcp__sentry__search_issues`), org `22minds-llc`, project `javascript-react` — unresolved issues first seen in last 24h. Count only.
- **CLAUDE.md health**: `git log --oneline --since="6am today" -- CLAUDE.md .claude/rules/` — if any commits found, collect the diff (`git diff HEAD~N HEAD -- CLAUDE.md .claude/rules/` where N = number of those commits) and spawn `/slava:maintain:claude-md` as a subagent with the diff as context. Get back: VALID / NEEDS REVISION + one-line recommendation.

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

METRICS  (skip if no signups and no sentry issues)
• [N new signups today — or omit if 0 and nothing interesting]
• [N new Sentry issues today — or omit if clean]

INSIGHT  (skip if nothing real)
• [one thing learned about users, product, or yourself as founder]

CHALLENGE  (skip if nothing real)
• [real obstacle — what it revealed, not the technical detail]

ATTENTION  (skip if fewer than 2 status checks today, or nothing notable)
• [N /status checks — what shifted focus, e.g. "P425 blocked all afternoon"]
• [persistent blockers — anything that appeared in multiple checks]

AGENT CONFIG  (skip if CLAUDE.md and rules unchanged today)
• [what changed — plain English, not file names]
• /claude-md verdict: VALID ✅ / NEEDS REVISION ⚠️
• [one-line recommendation if NEEDS REVISION, otherwise omit]

TOMORROW
→ [one clear next move + why it matters now]
```

### 4. Cloud server check (only if RUNNING)

If the `clarity-agent` VM is RUNNING:

> **clarity-agent is still running** (e2-standard-4, ~$3/day while idle). Stop it now?

Wait for user response. If yes: `gcloud compute instances stop clarity-agent --zone=<zone>` and confirm stopped. If no: note it and continue.

Skip this step entirely if the VM is TERMINATED.

### 5. Save learnings to memory (auto, no confirmation needed)

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

- Never ask questions — **except** Step 4 (cloud server stop), which is a deliberate cost-saving prompt.
- If git log is empty (no commits today), say so honestly: "No commits today." Then reflect on
  what non-code work happened (planning, research, decisions) based on any KDD or milestone reads.
- Run data gathering steps in parallel using the Task tool where possible.
