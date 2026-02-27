# Day Start (/day-start)

Interactive daily check-in. Checks prod health, shows what's next, asks what's done, updates the milestone.

## Steps

### 0. Reset Whisper language to auto-detect
```bash
rm -f ~/.whisper-lang
```
Silent — no output needed.

### 1. Health Check (run in parallel, show before milestone)

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

**c) New signups (last 24h — who, not just count)**
```bash
source "$(git rev-parse --show-toplevel)/.env.local"
SINCE=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ")
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/profiles?select=name,email,created_at&created_at=gt.${SINCE}&order=created_at.desc" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

If the response is a JSON object with a `message` key (not an array), show: `⚠ Signups: query failed — check PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local`

Filter out `test-agent@claritypledge.com` from results.

Show: `✓ Signups: 0 in last 24h` or list each as `  · Name (email) — HH:MM UTC`

**d) Cloud systems (silent on green — only output if something is wrong)**
```bash
# Ghost blog
curl -s -o /dev/null -w "%{http_code}" https://claritypledge.com/blog --max-time 5

# DB backup freshness (skip silently if gcloud auth unavailable)
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
- Ghost non-200 → `⚠ Ghost blog: down ([code])`
- Backup >2 days old → `⚠ DB backup: [N]d old`
- gcloud unavailable → silent skip (VMs are set-and-forget, not a daily concern)

Output the health block:
```
HEALTH
  [✓/✗] Prod smoke
  [✓/⚠] Sentry
  [✓] Signups: N in last 24h (or list of names)
  [nothing if cloud ok / ⚠ line per issue if not]
```

If any check fails, flag it prominently before continuing. Do not skip the milestone section.

---

### 1. Milestone

1. Read `docs/milestones/c1-stories-live-events.md`
2. Parse the `## Pilot Sequence` section — identify steps marked `[ ]` (not done) vs `[x]` (done)
3. Output ONLY the next steps (not done). Do NOT list done items. Show max 5 upcoming.
4. Show the gate to next milestone at the bottom.
5. Ask: **"What did you complete since yesterday? (list step numbers, or press enter to skip)"**
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

### 3. Insight Post Prompt

After the BRANCHES block, output this one line:

```
→ Run /insight-post? Scans last 48hr of conversations → 5 LinkedIn framings → schedule via Postiz.
```

If user replies "insights", "yes", "run it", or "insight-post" → invoke `/slava:content:insight-post`.
If user ignores it or moves on → drop it, don't repeat.

---

## Notes

- Never show done steps. Only what's coming.
- Keep HEALTH + MILESTONE + BRANCHES blocks concise (15 lines total). Signup list is exempt — show all real signups.
- The milestone file is at `docs/milestones/c1-stories-live-events.md`. Checkboxes are `[ ]` and `[x]`.
- When updating: change `[ ] Step text` to `[x] Step text` for completed steps. Preserve the numbering and surrounding text exactly.
- If user skips (no input), just say "OK — focus on the next step above."
