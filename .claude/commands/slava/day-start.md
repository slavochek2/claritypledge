# Day Start (/day-start)

Interactive daily check-in. Checks prod health, shows what's next, asks what's done, updates the milestone.

## Steps

### 0. Health Check (run all three in parallel, show before milestone)

**a) Prod smoke test**
```bash
node scripts/prod-smoke-test.mjs
```
Show: `✓ Prod smoke: all pass` or `✗ Prod smoke: N failed — [first failure]`

**b) Sentry: new issues last 24h**
Use Sentry MCP (`mcp__sentry__search_issues`):
- Org: `22minds-llc`, Project: `javascript-react`
- Query: unresolved issues first seen in the last 24h

Show: `✓ Sentry: clean` or `⚠ Sentry: N new issues — [top title]`

**c) New signups today**
Use Supabase MCP to query prod (`besjtuodziykmjidubzw`):
```sql
SELECT count(*) FROM profiles WHERE created_at > now() - interval '24 hours'
```

Show: `✓ Signups: N today` (0 is fine — just state it)

Output the health block:
```
HEALTH
  [✓/✗] Prod smoke
  [✓/⚠] Sentry
  [✓/—] Signups: N today
```

If smoke test fails, flag it prominently before continuing. Do not skip the milestone section.

---

### 1. Milestone

1. Read `docs/milestones/c1-stories-live-events.md`
2. Parse the `## Pilot Sequence` section — identify steps marked `[ ]` (not done) vs `[x]` (done)
3. Output ONLY the next steps (not done). Do NOT list done items. Show max 5 upcoming.
4. Show the gate to next milestone at the bottom.
5. Ask: **"What did you complete today? (list step numbers, or press enter to skip)"**
6. If user lists steps → use the Edit tool to change `[ ]` to `[x]` for those steps in the milestone file.
7. Confirm what was updated.

## Output format (step 3-4)

```
MILESTONE: [id] — [title]
WHY: [hypothesis one line]

WHAT'S NEXT:
  → [step N] [text]       ← this is the immediate next
  ○ [step N+1] [text]
  ○ [step N+2] [text]
  ...

GATE TO [next milestone]: [one line condition]
```

## Notes

- Never show done steps. Only what's coming.
- Keep total output under 15 lines.
- The milestone file is at `docs/milestones/c1-stories-live-events.md`. Checkboxes are `[ ]` and `[x]`.
- When updating: change `[ ] Step text` to `[x] Step text` for completed steps. Preserve the numbering and surrounding text exactly.
- If user skips (no input), just say "OK — focus on the next step above."
