# Day Start (/day-start)

Interactive daily check-in. Checks prod health, shows what's next, asks what's done, updates the milestone.

## Steps

### 0. Health Check (run all four in parallel, show before milestone)

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

**d) Cloud systems (silent on green — only output if something is wrong)**
```bash
# GCP VMs
gcloud compute instances list \
  --project=gen-lang-client-0869694595 \
  --account=slava@inguro.com \
  --format="value(name,status)" 2>/dev/null

# Ghost blog
curl -s -o /dev/null -w "%{http_code}" https://claritypledge.com/blog --max-time 5

# DB backup freshness
LATEST=$(gcloud storage ls gs://claritypledge-db-backups/ --account=slava@inguro.com 2>/dev/null | sort | tail -1)
DATE=$(echo "$LATEST" | grep -oE '[0-9]{8}' | head -1)
if [ -n "$DATE" ]; then
  DATE_EPOCH=$(date -j -f "%Y%m%d" "$DATE" +%s 2>/dev/null)
  if [ -n "$DATE_EPOCH" ]; then
    DAYS_OLD=$(( ( $(date +%s) - DATE_EPOCH ) / 86400 ))
    echo "backup_age_days=$DAYS_OLD"
  fi
fi
```

Flag only if broken:
- Any VM not `RUNNING` → `⚠ GCP: [name] is [STATUS]`
- Ghost non-200 → `⚠ Ghost blog: down ([code])`
- Backup >2 days old → `⚠ DB backup: [N]d old`
- gcloud unavailable → `⚠ GCP: auth unavailable (skip)`

Output the health block:
```
HEALTH
  [✓/✗] Prod smoke
  [✓/⚠] Sentry
  [✓] Signups: N today
  [nothing if cloud ok / ⚠ line per issue if not]
```

If any check fails, flag it prominently before continuing. Do not skip the milestone section.

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

---

### 2. Branch Status

Run these two commands:
```bash
git branch --format='%(refname:short) %(upstream:track)' | grep -v "^main"
git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' '
```

Output a branch block:

```
BRANCHES
  main: N commits ahead of origin (not yet pushed)
  feature/p422-clarity-partner-agreement  ← ready to /ship?
  feature/p425-story-filing               ← in-progress
```

Rules:
- If on `main` with 0 commits ahead: "main is clean and in sync"
- If on `main` with N commits ahead: "N commits on main not pushed — push when ready or was this meant to be on a branch?"
- For each feature branch: show name + one-line suggestion ("ready to /ship?" if closed, "in-progress" if spec still open)
- If no feature branches: omit the section

---

## Notes

- Never show done steps. Only what's coming.
- Keep total output under 15 lines.
- The milestone file is at `docs/milestones/c1-stories-live-events.md`. Checkboxes are `[ ]` and `[x]`.
- When updating: change `[ ] Step text` to `[x] Step text` for completed steps. Preserve the numbering and surrounding text exactly.
- If user skips (no input), just say "OK — focus on the next step above."
