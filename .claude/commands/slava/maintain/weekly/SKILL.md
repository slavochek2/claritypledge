---
name: weekly
description: Weekly review - validate Claude context, flag stale docs, run evidence-based retro. Run when terminal reminds you.
---

# Weekly Review

Context hygiene + evidence-based solo founder retrospective. Evidence first, questions after.

---

## Workflow

### 0. Determine Review Period

**Run this first** — everything else uses `$SINCE`.

```bash
# Get last run date, fall back to 7 days ago
LAST_RUN=$(grep "^date:" ~/.claude_weekly_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
if [ -z "$LAST_RUN" ]; then
  SINCE="7 days ago"
  DAYS=7
  echo "No prior run found — analyzing last 7 days"
else
  # Validate format before using (guard against corrupt state file)
  if echo "$LAST_RUN" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    SINCE="$LAST_RUN"
    LAST_TS=$(date -j -f "%Y-%m-%d" "$LAST_RUN" +%s 2>/dev/null)
    if [ -z "$LAST_TS" ]; then
      SINCE="7 days ago"; DAYS=7
      echo "WARNING: Could not parse date '$LAST_RUN' — falling back to 7 days"
    else
      DAYS=$(( ( $(date +%s) - LAST_TS ) / 86400 ))
      echo "Last review: $LAST_RUN ($DAYS days ago)"
    fi
  else
    SINCE="7 days ago"; DAYS=7
    echo "WARNING: Malformed date in state file ('$LAST_RUN') — falling back to 7 days"
  fi
fi
```

Report the period at the top of the review: **"Review period: $LAST_RUN → today ($DAYS days)"**

If >14 days, note: "Overdue by $((DAYS - 7)) days — this covers a longer stretch."
If <5 days, note: "Short cycle — [N] days since last review."

---

### 1. Context Health (run in parallel)

```bash
# DB backup health — latest backup age and size
LATEST=$(gsutil ls gs://claritypledge-db-backups/ 2>/dev/null | sort | tail -1)
if [ -z "$LATEST" ]; then
  echo "BACKUP: ❌ NO BACKUPS FOUND"
else
  SIZE=$(gsutil stat "$LATEST" 2>/dev/null | grep "Content-Length" | awk '{print $2}')
  DATE=$(echo "$LATEST" | grep -oE '[0-9]{8}' | head -1)
  if [ -z "$DATE" ]; then
    echo "BACKUP: ⚠️  Could not parse date from: $LATEST"
  else
    DATE_EPOCH=$(date -j -f "%Y%m%d" "$DATE" +%s 2>/dev/null || date -d "$DATE" +%s 2>/dev/null)
    if [ -z "$DATE_EPOCH" ]; then
      echo "BACKUP: ⚠️  Could not parse epoch from date: $DATE"
    else
      DAYS_AGO=$(( ( $(date +%s) - DATE_EPOCH ) / 86400 ))
      if [ "$DAYS_AGO" -gt 2 ]; then
        echo "BACKUP: ⚠️  Last backup ${DAYS_AGO}d ago — check GitHub Actions: https://github.com/slavochek2/claritypledge/actions/workflows/db-backup.yml"
      elif [ -z "$SIZE" ] || [ "$SIZE" -lt 1000 ]; then
        echo "BACKUP: ❌ Last backup suspiciously small (${SIZE:-unknown}B) — may be corrupt"
      else
        echo "BACKUP: ✅ Last backup ${DAYS_AGO}d ago, ${SIZE}B"
      fi
    fi
  fi
fi

# Broken links in CLAUDE.md
grep -oE '\[.*?\]\((src/[^)]+|docs/[^)]+|features/[^)]+|e2e/[^)]+|scripts/[^)]+|\.claude/[^)]+)\)' CLAUDE.md | \
  sed 's/.*(\(.*\))/\1/' > /tmp/refs.txt
while IFS= read -r path; do [ ! -e "$path" ] && echo "MISSING: $path"; done < /tmp/refs.txt

# Size
echo "CLAUDE.md: $(wc -l < CLAUDE.md) lines"

# Rules files
ls .claude/rules/*.md 2>/dev/null

# Stale docs (>30 days)
find docs/technical -name "*.md" -mtime +30 -exec ls -la {} \;
```

Flag if >300 lines. Flag stale docs with archive-or-update call.

---

### 2. Sentry Health

Use Sentry MCP (`mcp__sentry__search_issues`):
- Org: `22minds-llc`, Project: `javascript-react`
- Query: unresolved issues first seen since `$SINCE`

>10 events = investigate now. 5–10 = flag. <5 = note only.

---

### 2.1 Product Metrics (Supabase MCP, prod project `besjtuodziykmjidubzw`, run in parallel with step 2)

```sql
-- New signups this period (substitute $DAYS from step 0)
SELECT count(*) FROM profiles WHERE created_at > now() - interval '$DAYS days';

-- Total pledgers (all-time, sanity check)
SELECT count(*) FROM profiles WHERE has_pledged = true;

-- Live sessions completed this period (meaningful engagement)
SELECT count(DISTINCT session_code) FROM live_sessions
WHERE created_at > now() - interval '$DAYS days';
```

Surface in the output header as:
```
METRICS:  Signups: N this week (total pledgers: M) | Live sessions: N
```

If live_sessions table doesn't exist yet, omit that line silently.

---

### 2.5 Process Friction Review

Read `docs/process-learnings.md`. If the file does not exist, output `PROCESS DEBT: no tracking file yet` and skip this step.

Scan for entries with `Status: proposed`.

For each unresolved entry:
- If it's been proposed for 2+ weeks without action → flag it: "This fix has been sitting since [date]. Still worth doing?"
- If 2+ entries share the same root cause → that's a chronic pattern, not a one-off

Surface findings in the Evidence Picture (step 4) as:
```
PROCESS DEBT: [N proposed fixes — list them; or "none"]
CHRONIC:      [patterns appearing 2+ times — or "none"]
```

This is a 2-minute scan. Don't expand it. Purpose is surfacing what /kdd sessions flagged but never acted on.

---

### 2.6 Product Pulse (inline, fire in parallel with step 3)

```bash
# What changed in core product/strategy docs since $SINCE
git diff "$SINCE"..HEAD -- docs/lean-canvas.md docs/philosophy.md README.md CLAUDE.md 2>/dev/null | \
  grep -E "^[+-]" | grep -vE "^(---|\+\+\+|@@)" | head -60

# Last meaningful edit date for each (to catch docs drifting from reality)
for f in docs/lean-canvas.md docs/philosophy.md README.md; do
  [ -f "$f" ] && echo "$f: last changed $(git log -1 --format='%ar' -- $f)"
done
```

Read the diff output. Summarize in 1–3 bullets: what substantively changed (ignore formatting/typos). If no changes, check last-edit dates — if any core doc is >3 weeks untouched, flag it.

Surface in the Evidence Picture as:
```
PRODUCT PULSE: [what changed — 1-3 bullets; or "no changes (last edit: X weeks ago)"]
```

The purpose: distinguish deliberate evolution from silent drift. Don't expand — this is a 2-minute read.

---

### 2.7 Prompt Pattern Mining (subagent, runs in background)

Spawn a subagent in background while you continue to step 3. It scans session logs since `$SINCE` and returns skill gap candidates.

**Subagent prompt:**
```
Scan Claude Code session logs in /Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/*.jsonl
for files modified since [SINCE date].

For each file, extract lines where role == "human" and content is conversational (skip tool results, system messages, skill content).

Cluster the messages by intent. Count frequency. Identify the top 5 patterns that:
- Appear 10+ times
- Have NO matching skill in .claude/commands/slava/ (check by grepping for the intent)
- Or have a skill that exists but is being bypassed (user types the intent informally instead of using the command)

Return ONLY:
- Pattern name (3-5 words)
- Frequency (approximate count)
- Sample prompt (1 real example)
- Gap type: MISSING_SKILL | SKILL_EXISTS_BUT_BYPASSED | SKILL_NEEDS_IMPROVEMENT
- One-line recommendation

Max 5 candidates. No preamble.
```

Merge the subagent result into the Evidence Picture (step 4) as:
```
SKILL GAPS:   [N candidates — name (Nx), gap type] → act / defer / skip
```

If no gaps found: `SKILL GAPS: none detected`

---

### 2.8 Code Health Scan (subagent, runs in background — parallel with 2.7)

Spawn a subagent in background while you continue to step 3.

**Subagent prompt:**
```
You are a code quality analyst. Run these checks in the repo at /Users/slavochek/Projects/public/claritypledge and return a brief health report. Do NOT fix anything — scan only.

1. **TypeScript**: run `npx tsc --noEmit 2>&1 | tail -5` — report error count (0 = ✅)
2. **Lint warnings**: run `npx eslint src --max-warnings 9999 2>&1 | grep "warning" | wc -l` — report count
3. **eslint-disable comments**: run `grep -r "eslint-disable" src --include="*.tsx" --include="*.ts" -l | wc -l` — report file count; also flag any added since last git tag: `git diff HEAD~7..HEAD -- src/ | grep "^+.*eslint-disable" | grep -v "^+++" | wc -l`
4. **Untested source files**: count .ts/.tsx files in src/app/ that have no corresponding test file: `comm -23 <(find src/app -name "*.tsx" -o -name "*.ts" | sed 's|src/app/||' | sort) <(find src/tests -name "*.test.*" | sed 's|src/tests/||;s|\.test\.[^.]*||' | sort) | wc -l`
5. **Bundle size**: run `npx vite build 2>&1 | grep "dist/assets" | awk '{print $3}' | sort -h | tail -3` — flag any chunk >500kB

Return ONLY:
- TS_ERRORS: N
- LINT_WARNINGS: N
- ESLINT_DISABLES: N files (N new this week)
- UNTESTED_FILES: N
- LARGE_CHUNKS: [list chunks >500kB or "none"]
- VERDICT: ✅ healthy / ⚠️ watch / ❌ needs attention

No preamble. If a command fails, skip it and note "skipped".
```

Merge into Evidence Picture (step 4) as:
```
CODE HEALTH:  TS: N errors | Lint: N warnings | eslint-disables: N files (N new) | Untested: N | Chunks: [list or "clean"]
```

If verdict is ❌: add to questions "Code health degraded — worth a fix session this week?"

---

### 3. Evidence Gathering (fire in parallel with steps 1 and 2.6 — all three are independent)

```bash
# Commits (use $SINCE from step 0)
git log --since="$SINCE" --oneline --no-merges

# Features shipped
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- 'features/done/'

# Features created (new specs)
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- "features/p*.md" | grep "\.md$"

# Strategy docs touched
git log --since="$SINCE" --name-only --pretty="" \
  -- "docs/milestones/" "docs/lean-canvas.md" "docs/decisions.md" \
     "docs/philosophy.md" "CLAUDE.md" ".claude/" | sort -u

# Repeated fix areas (same scope fixed 2+ times = smell; refactors excluded)
git log --since="$SINCE" --oneline --no-merges | grep -iE "^[a-f0-9]+ fix" | \
  sed 's/^[a-f0-9]* //' | sort | uniq -c | sort -rn | head -10

# (Last run commitment — read the file internally, do NOT echo it to terminal;
#  it already appears in the Kanban Goals view)
# Just note whether the file exists:
[ -f ~/.claude_weekly_last_run ] && echo "Commitment file: found" || echo "Commitment file: none"
```

> **Agent note:** Read `~/.claude_weekly_last_run` with the Read tool — do not print its raw contents to the terminal. Incorporate the commitment into the evidence picture silently.

---

### 4. Evidence Picture

Present this before asking anything. For LAST WEEK: read the saved commitment verbatim, then ask: "Did you do this? Yes / partial / no — one word." Wait for the answer before proceeding.

```
SHIPPED:      [N features — list titles]
CREATED:      [N new specs — list titles]
COMMITS:      [N total — split by type: feat/fix/chore/docs/refactor]
STRATEGY:     [docs touched or "none"]
SMELLS:       [areas fixed 2+ times — scope only, not count; or "none"]
LAST WEEK:    [paste saved commitment] → [founder's yes/partial/no]
USER CONVOS:  [cannot be detected from git — ask now: "How many real user conversations this week? Names if any."]
PROCESS DEBT:  [N proposed fixes from process-learnings.md — or "none"]
CHRONIC:       [patterns appearing 2+ times — or "none"]
PRODUCT PULSE: [what changed in lean-canvas/philosophy/README/CLAUDE.md — or "no changes (X weeks)"]
```

Collect the user conversation answer before moving to questions. Zero = flag immediately in the evidence table.

Then compute these signals:

| Signal | What it reveals |
|--------|----------------|
| **feat vs chore ratio** | High chore = tooling/meta-work week, low product |
| **specs created > shipped** | Backlog growing faster than execution |
| **strategy docs touched** | Decisions re-opened — settling or drifting? |
| **repeated fix areas** | Patching symptoms not root causes |
| **zero user conversations** | Builder's refuge. Building is safe. Selling is where the loop breaks. Flag this explicitly — do not soften it. |
| **last week commitment missed** | Pattern of commitments that don't bind. Name it: "This is the second/third time." |

---

### 5. Retrospective Questions

Show the evidence picture first. Then ask — **evidence-derived questions first, then the 4 mandatory ones.** Never skip the mandatory ones.

#### Evidence-Derived (pick 1–2 based on what you found)

- High chore ratio → "Most commits were chores/tooling. Was that intentional investment or meta-work avoidance?"
- Specs created >> shipped → "You created [N] specs but shipped [M]. Is the backlog growing because priorities are unclear, or because you're scoping before validating?"
- Same area fixed 3x → "You touched [area] [N] times. Is there a root cause being patched instead of fixed?"
- Strategy docs changed → "You reopened [doc] — is that decision now settled, or still drifting?"
- Product pulse has changes → "The product framing shifted: [summary]. Was that driven by new evidence, or did something feel off and you adjusted the words?"
- Nothing shipped → "Nothing shipped. Groundwork week, or did something block you that's worth naming?"

#### Mandatory (always ask all 4, in this order)

**1. The avoidance check**
> "What task, conversation, or action did you actively avoid this week? Name it specifically."
*(The avoided thing is almost always the highest-leverage one. Common pattern: offering a session, naming a price, sending a message to a real person.)*

**2. Build / sell / learn ratio**
> "Rough split this week: what % was building product, % talking to actual users or doing outreach, % reviewing data or running experiments?"
*(Watch for: zero user conversations = builder's refuge. Building is safe. Selling is where the loop breaks.)*

**3. Hypothesis integrity**
> "What assumption did you test this week with a real person or real usage data? What surprised you?"
*(Codebase surprises, refactor discoveries, and UI edge cases don't count. Real-person test or production usage data only. If the answer is "nothing" or "it worked as expected," that's a flag — no surprise means no real test.)*

**4. Scope / re-derivation check**
If strategy docs were touched: "You opened [doc] this week. Read back the last change before this one. What's substantively different in your thinking now? If the answer is 'mostly the same framing,' that's re-derivation — the decision was already made and you're circling it."

If no strategy docs touched: "Did you find yourself re-explaining your strategy or direction in any conversation this week — to me, to a user, to yourself in writing? Same idea, new words = re-derivation."

*(The tell: each re-derivation feels like refinement. The question is whether anything actually changed — new data, new constraint, new evidence — or whether the act of re-deriving is itself the avoidance.)*

---

### 6. Personal Pattern Interrupt

Run this check using the evidence picture and the answers just given. Surface at most 2 patterns. State them plainly — not as questions, not preachy. One sentence each. If none apply, skip this section entirely.

**Triggers and flags:**

- **Scope expansion:** New specs > shipped AND strategy docs re-opened → "The backlog grew and direction shifted. That's scope expanding before the current hypothesis has a result."

- **Framework substitution:** >50% commits are docs/refactor/chore AND zero user conversations → "This was an architectural week with no external contact. Frameworks replaced conversations."

- **Prerequisite creep:** Multiple features in-progress AND nothing user-facing shipped in 2+ weeks → "The list of things that need to be done before launch keeps growing. Name the actual blocker."

- **Anxiety pivot:** Strategy docs changed AND no new external data in evidence → "Something changed direction this week. Was there new information, or did anxiety spike?"

- **Virtue shield:** If the founder mentions inability to charge, "people like me," or fairness concerns about pricing → "That framing protects you from testing whether people will pay. Is the constraint real or is it a shield?"

- **Zero user conversations (automatic flag, no trigger needed):** If USER CONVOS = 0 → "Zero user conversations. That's the most important number in this review. Everything else is internal."

Only surface what the evidence actually shows. One sentence per pattern. Don't pile on.

---

### 7. Next Week Commitment

Always end with this. Save to state file for accountability next week:

```
STOP:        [one specific behavior — not a project, a behavior]
START:       [one specific action — must involve a real person or real user]
SCARY THING: [verb] + [named person or public channel] + [by specific date]
             Example: "Send pricing page to Marcus by Thursday"
             Not acceptable: "reach out to users", "think about pricing", "send a message"
HYPOTHESIS:  "I believe [X] will cause [Y], measured by [Z] by [date]"
KILL DATE:   "I'll reconsider this direction if [condition] by [date]"
```

If the scary thing doesn't have a name and a date, it's not a commitment — push back and ask again.

Save it:
```bash
cat > ~/.claude_weekly_last_run << 'EOF'
date: YYYY-MM-DD
stop: ...
start: ...
scary_thing: ...
hypothesis: ...
kill_date: ...
EOF
```

---

## Output Format

```markdown
## Weekly Review — YYYY-MM-DD
**Period:** LAST_RUN → today (N days)

### Context Health
✅/⚠️ CLAUDE.md: X lines, [broken links or "clean"]
✅/⚠️ Rules: [files or "missing"]
✅/⚠️ Stale docs: [list or "none"]
✅/⚠️ DB backup: [last backup age + size, or ❌ if missing/stale]

### Sentry
✅/⚠️ [summary]

### Metrics
Signups: N this week (total pledgers: M) | Live sessions: N

### This Week
**Shipped:** [N] — [titles]
**Created:** [N] — [titles]
**Commits:** [N] ([feat/fix/chore split])
**Strategy touched:** [docs or "none"]
**Smells:** [repeated fixes or "none"]
**User conversations:** [N — names if any, or "zero"]
**Last week:** [commitment text] → [yes/partial/no]
**Process debt:** [N proposed fixes or "none"]
**Chronic patterns:** [or "none"]
**Product pulse:** [what changed or "no changes (X weeks)"]
**Code health:** TS: N | Lint: N | eslint-disables: N (N new) | Untested: N | Chunks: [list or "clean"]

### Evidence Signals
[table of signals with interpretations]

### Questions
[1–2 evidence-derived + 4 mandatory]

### Pattern Check
[0–2 flags based on evidence, not preachy]

### Next Week
Stop: ...
Start: ...
Scary thing: ...
Hypothesis: ...
Kill date: ...
```

---

## Rules

- **Evidence first. Questions after.** Never ask before showing the picture.
- **Collect user conversation count before questions** — it's the most important number.
- **Last week's commitment: paste it verbatim, ask yes/partial/no, wait for answer.** Don't infer.
- **Questions must be derived from evidence** — never generic "what went well?"
- **Always ask all 4 mandatory questions** — avoidance, ratio, hypothesis, re-derivation.
- **Q3 hypothesis check: real person or real usage data only.** Reject codebase answers.
- **Q4 re-derivation: anchor to the specific strategy doc touched.** Don't accept self-assessment without anchoring.
- **Pattern interrupt: plain statements, not questions, at most 2.** If none apply, skip the section.
- **The scary thing must have a name and a date.** Push back if it doesn't.
- **A retro that never stings is a journal entry.** If this feels comfortable, it's not working.
- Implement improvements now if identified. Keep it under 15 minutes.
