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
LAST_RUN=$(grep "^date:" ~/.claude_weekly_last_run 2>/dev/null | awk '{print $2}')
if [ -z "$LAST_RUN" ]; then
  SINCE="7 days ago"
  DAYS=7
  echo "No prior run found — analyzing last 7 days"
else
  SINCE="$LAST_RUN"
  DAYS=$(( ( $(date +%s) - $(date -j -f "%Y-%m-%d" "$LAST_RUN" +%s) ) / 86400 ))
  echo "Last review: $LAST_RUN ($DAYS days ago)"
fi
```

Report the period at the top of the review: **"Review period: $LAST_RUN → today ($DAYS days)"**

If >14 days, note: "Overdue by $((DAYS - 7)) days — this covers a longer stretch."
If <5 days, note: "Short cycle — [N] days since last review."

---

### 1. Context Health (run in parallel)

```bash
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

```
Org: 22minds-llc | Region: https://de.sentry.io | Project: javascript-react
Query: unresolved errors from last 7 days
```

>10 events = investigate now. 5–10 = flag. <5 = note only.

---

### 3. Evidence Gathering (run in parallel)

```bash
# Commits (use $SINCE from step 0)
git log --since="$SINCE" --oneline --no-merges

# Features shipped
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- "features/done/*" | grep "\.md$"

# Features created (new specs)
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- "features/p*.md" | grep "\.md$"

# Strategy docs touched
git log --since="$SINCE" --name-only --pretty="" \
  -- "docs/milestones/" "docs/lean-canvas.md" "docs/decisions.md" \
     "docs/philosophy.md" "CLAUDE.md" ".claude/" | sort -u

# Repeated fix areas
git log --since="$SINCE" --oneline --no-merges | grep -i "fix\|chore\|refactor" | \
  sed 's/[a-f0-9]* //' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10

# Last run commitment
cat ~/.claude_weekly_last_run 2>/dev/null || echo "(no prior commitment)"
```

---

### 4. Evidence Picture

Present this before asking anything:

```
SHIPPED:    [N features — list titles]
CREATED:    [N new specs — list titles]
COMMITS:    [N total — split by type: feat/fix/chore/docs/refactor]
STRATEGY:   [docs touched or "none"]
SMELLS:     [areas fixed 3+ times, or "none"]
LAST WEEK:  [commitment followed through / partial / missed]
```

Then compute these signals:

| Signal | What it reveals |
|--------|----------------|
| **feat vs chore ratio** | High chore = tooling/meta-work week, low product |
| **specs created > shipped** | Backlog growing faster than execution |
| **strategy docs touched** | Decisions re-opened — settling or drifting? |
| **repeated fix areas** | Patching symptoms not root causes |
| **zero user conversations** | Builder's refuge week |

---

### 5. Retrospective Questions

Show the evidence picture first. Then ask — **evidence-derived questions first, then the 4 mandatory ones.** Never skip the mandatory ones.

#### Evidence-Derived (pick 1–2 based on what you found)

- High chore ratio → "Most commits were chores/tooling. Was that intentional investment or meta-work avoidance?"
- Specs created >> shipped → "You created [N] specs but shipped [M]. Is the backlog growing because priorities are unclear, or because you're scoping before validating?"
- Same area fixed 3x → "You touched [area] [N] times. Is there a root cause being patched instead of fixed?"
- Strategy docs changed → "You reopened [doc] — is that decision now settled, or still drifting?"
- Nothing shipped → "Nothing shipped. Groundwork week, or did something block you that's worth naming?"

#### Mandatory (always ask all 4, in this order)

**1. The avoidance check**
> "What task, conversation, or action did you actively avoid this week? Name it specifically."
*(The avoided thing is almost always the highest-leverage one. Common pattern: offering a session, naming a price, sending a message to a real person.)*

**2. Build / sell / learn ratio**
> "Rough split this week: what % was building product, % talking to actual users or doing outreach, % reviewing data or running experiments?"
*(Watch for: zero user conversations = builder's refuge. Building is safe. Selling is where the loop breaks.)*

**3. Hypothesis integrity**
> "What assumption did you test this week with a real person or real data? What surprised you?"
*(No surprise = not learning, or only hearing confirmation. Theoretical validation doesn't count.)*

**4. Scope / re-derivation check**
> "Did you make any decisions this week that you've already made before? What's actually new?"
*(The pattern: same strategy gets re-derived when commitment feels close. Each re-derivation feels like refinement. Collectively they delay the moment of actual test.)*

---

### 6. Personal Pattern Interrupt

After the questions, check the evidence against these known patterns. Flag only if evidence supports it — don't lecture:

| Pattern | Signal in evidence | Flag |
|---------|-------------------|------|
| **Scope expansion** | New specs > shipped; strategy docs re-opened | "This looks like scope expanding before the current hypothesis is tested." |
| **Framework substitution** | Heavy docs/refactor week, no user contact | "Lots of architectural work. Did frameworks replace conversations this week?" |
| **Prerequisite creep** | Feature count high but nothing user-facing shipped | "What's the actual blocker — or did the bar keep moving?" |
| **Anxiety pivot** | Strategy docs changed + no new external data | "Did new information arrive that changed direction, or did anxiety spike?" |
| **Virtue shield** | n/a (ask directly if user mentions "can't charge", "people like me") | "Is that a real constraint or a protection mechanism?" |

Only surface 1–2 patterns. Don't pile on.

---

### 7. Next Week Commitment

Always end with this. Save to state file for accountability next week:

```
STOP:        [one specific thing]
START:       [one specific thing — ideally involves a real person]
SCARY THING: [the smallest scary action — user contact, price named, thing shipped publicly]
HYPOTHESIS:  "I believe [X] will cause [Y], measured by [Z]"
KILL DATE:   "I'll reconsider this direction if [condition] by [date]"
```

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

### Sentry
✅/⚠️ [summary]

### This Week
**Shipped:** [N] — [titles]
**Created:** [N] — [titles]
**Commits:** [N] ([feat/fix/chore split])
**Strategy touched:** [docs or "none"]
**Smells:** [repeated fixes or "none"]
**Last week:** [followed through / partial / missed]

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
- **Questions must be derived from evidence** — never generic "what went well?"
- **Always ask all 4 mandatory questions** — avoidance, ratio, hypothesis, re-derivation.
- **Pattern interrupt is evidence-based** — only flag what the data actually suggests.
- **The scary thing is required** — every commitment must name a smallest scary action.
- **A retro that never stings is a journal entry.** If this feels comfortable, it's not working.
- Implement improvements now if identified. Keep it under 15 minutes.
