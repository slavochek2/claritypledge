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

### 2.5 Process Friction Review

Read `docs/process-learnings.md`. Scan for entries with `Status: proposed`.

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

### 3. Evidence Gathering (run in parallel)

```bash
# Commits (use $SINCE from step 0)
git log --since="$SINCE" --oneline --no-merges

# Features shipped
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- 'features/done/*.md'

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
PROCESS DEBT: [N proposed fixes from process-learnings.md — or "none"]
CHRONIC:      [patterns appearing 2+ times — or "none"]
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

### Sentry
✅/⚠️ [summary]

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
