---
name: monthly
description: Monthly meta-review — extract behavioral patterns from session history, challenge existing CLAUDE.md principles, propose concrete improvements. Run once a month.
when_to_use: "Once a month. Auto-invoked by /day when >28d since last run, or run directly."
version: 1.1.0
---

# /slava:monthly

> Evidence-based review of how the human-agent collaboration is actually working — not how you think it's working.

Weekly = operational. Monthly = meta. No overlap in scope.

---

## What This Does

Runs 4 parallel subagents against the last month of session logs, filters findings against current CLAUDE.md to surface only **genuinely new** insights, then presents proposed changes for approval.

**Analyses run in parallel:**
- **A:** Contrarian decisions (agent recommended X → you said no and redirected) + Work abandoned mid-session
- **B:** Agent false confidence (stated something wrong) + Recurring questions (asked 2+ times)
- **C:** Critical review of all existing CLAUDE.md principles
- **D:** Prompt-pattern / skill-gap mining (moved from /weekly 2.7 — P900; complements B's recurring-questions with intent clustering)

Then synthesizes → proposes concrete changes → you approve → applies them.

---

## Workflow

### 0. Determine Review Period

```bash
LAST_RUN=$(grep "^date:" ~/.claude_monthly_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
if [ -z "$LAST_RUN" ]; then
  SINCE="30 days ago"; DAYS=30
  echo "No prior run found — analyzing last 30 days"
else
  SINCE="$LAST_RUN"
  LAST_TS=$(date -j -f "%Y-%m-%d" "$LAST_RUN" +%s 2>/dev/null)
  DAYS=$(( ( $(date +%s) - LAST_TS ) / 86400 ))
  echo "Last monthly review: $LAST_RUN ($DAYS days ago)"
fi
```

Report at top: **"Monthly review period: $LAST_RUN → today ($DAYS days)"**

If >45 days: note overdue. If <20 days: note it's a short cycle and some analyses may show thin data.

---

### 1. Extract Session Files

```python
# Run this Python script to identify large session files from the review period
import subprocess, os

PROJECT_DIR = "/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/"

# Write a temp marker file for the since-date
result = subprocess.run(
    ['find', PROJECT_DIR, '-name', '*.jsonl', '-newer', '/tmp/monthly_since',
     '-not', '-path', '*/subagents/*', '-size', '+500k'],
    capture_output=True, text=True
)
files = [f for f in result.stdout.strip().split('\n') if f]
print(f"Found {len(files)} substantial session files in review period")
```

First, create the marker file:
```bash
touch -t $(date -j -f "%Y-%m-%d" "$SINCE" "+%Y%m%d0000" 2>/dev/null || date -d "$SINCE" "+%Y%m%d%H%M") /tmp/monthly_since
```

---

### 2. Parallel Subagent Analyses

Spawn all 4 agents simultaneously with `model: "sonnet"`. Do not wait for one before starting the next.

**Delivery contract — state this inline in every agent's prompt.** A background subagent's final
reply text does not reach the main conversation; it is silently lost, and four lost analyses read
as "the month was quiet." (`.claude/rules/skills.md` §Subagent I/O loads when a skill is *edited*,
never when one *runs* — so each spawn prompt must carry the contract itself.)

- Each agent **Writes** its report to `<session scratchpad>/monthly-agent-{A,B,C,D}.md` — the path
  the parent passes in — and then also returns the same text.
- **Compute and clear those four paths before spawning.** A leftover file from a prior `/monthly`
  run passes every freshness check and synthesises as if current.
- The parent **reads the four files**, not the replies. If a file is missing or empty, that agent
  **failed** — say so and re-run it. Never treat it as "found nothing." If a reply also arrived and
  differs, the file wins.

---

#### Agent A — Contrarian Decisions + Abandoned Work

**Prompt:**
```
You are a behavioral analyst. Scan Claude Code session JSONL files from the last month and extract two types of patterns.

SESSION FILES: [list of files from step 1]

PART 1 — CONTRARIAN DECISIONS
Find moments where:
- The agent recommended something
- The user pushed back and redirected to something different
- Look for user messages containing: "no", "actually", "instead", "simpler", "overkill", "don't want", "too much", "wait"

For each genuine contrarian moment:
- What did the agent suggest?
- What did the user redirect to?
- What's the underlying principle driving the redirect?

Parse the JSONL: each line is a JSON object with "type" (user/assistant) and "message" (dict with "content"). Extract text from message.content (string or list with type:text items).

PART 2 — ABANDONED WORK
Find sessions that end mid-task: the last user message shows something incomplete (half-built feature, unresolved error, "let's do this later", "I'll come back to") without a clear resolution.

List the top 5 by recency.

OUTPUT FORMAT:
## Contrarian Moments (genuine ones only, max 15)
[timestamp] Agent suggested: ... | User redirected to: ... | Principle: ...

## Recurring Principles (group contrarian moments into patterns)
1. [Principle]: [description] — seen N times

## Abandoned Work (top 5)
[timestamp] [description of what was left incomplete]
```

---

#### Agent B — Agent Errors + Recurring Questions

**Prompt:**
```
You are a quality analyst for human-agent collaboration. Scan Claude Code session JSONL files from the last month.

SESSION FILES: [list of files from step 1]

PART 1 — AGENT FALSE CONFIDENCE
Find moments where the agent stated something as fact that turned out to be wrong. Signals:
- User corrects the agent with "actually", "that's not right", "we already have", "that doesn't exist"
- Agent made an assumption about schema/infrastructure/state that was wrong
- Agent claimed something was done/fixed but the user later discovered it wasn't

For each: what did the agent claim? What was the reality?

PART 2 — RECURRING QUESTIONS
Find questions or requests the user made 2+ times across different sessions. These signal either:
- A documentation gap (answer should be written down)
- An automation gap (should be a skill)
- A CLAUDE.md gap (agent should know this without being asked)

Parse the JSONL: type=="user", message.content is the text.

OUTPUT FORMAT:
## Agent False Confidence (top 10)
[timestamp] Claimed: ... | Reality: ... | Type: SCHEMA_WRONG | INFRA_WRONG | DECLARED_DONE_PREMATURELY | OTHER

## Recurring Questions (appeared 2+ times)
[Question/request] — seen N times across N sessions — Gap type: DOC_GAP | SKILL_GAP | CLAUDE_MD_GAP
```

---

#### Agent C — CLAUDE.md Critical Review

**Prompt:**
```
You are a senior engineering lead doing a devil's advocate review of a CLAUDE.md file.

Read: ./CLAUDE.md

For EACH named principle/rule/section, give:
- ✓ Sound | ⚠️ Needs nuance | ✗ Potentially wrong
- 2-3 sentences: does this hold up? Where does it break down?
- Recommendation: Keep | Reframe | Educate the founder

Focus on:
1. Rules with unacknowledged failure modes
2. Rules that conflict with each other
3. Rules applied in the wrong context
4. Rules that are bureaucracy for their own sake
5. Anything slowing down a lean early-stage startup disproportionately

End with: top 3 most important challenges (the ones that if wrong, cause real damage daily).

Be direct. If something is wrong, say so.
```

---

#### Agent D — Prompt-Pattern / Skill-Gap Mining (moved from /weekly 2.7 — P900)

**Prompt:**
```
Scan Claude Code session logs in ~/.claude/projects/<project-encoded-path>/*.jsonl
(same PROJECT_DIR as step 1) for files modified since [SINCE date].

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

---

### 3. Filter Against Current CLAUDE.md

After all 4 agents return, read current CLAUDE.md and filter each finding:

For each principle extracted by Agent A:
- Is it already captured (adequately) in CLAUDE.md? → mark CAPTURED, skip
- Is it captured but weakly? → mark STRENGTHEN
- Is it genuinely new? → mark NEW

For each recurring question from Agent B:
- Is there already a skill that handles this? → mark EXISTS
- Is it missing? → mark GAP

For each issue from Agent C:
- Cross-check: was this issue already fixed in a recent commit? → mark RESOLVED
- Still valid? → mark ACTIVE

For each skill-gap candidate from Agent D:
- Cross-check against Agent B's recurring questions — merge duplicates (same intent = one finding)
- A matching skill already exists and is used? → mark EXISTS, skip
- Genuinely missing or bypassed? → mark GAP

---

### 4. Synthesis

Present findings in this order — most actionable first:

```
## Monthly Meta-Review — YYYY-MM-DD
Period: [SINCE] → today ([N] days)

### Agent C: CLAUDE.md Health
[✓/⚠️/✗ per principle — condensed, 1 line each]
TOP 3 CHALLENGES: [from Agent C]

### Agent A: New Patterns from Contrarian Decisions
NEW (not in CLAUDE.md): [list with proposed rule text]
STRENGTHEN (in CLAUDE.md but weak): [list with proposed edit]
CAPTURED (already good): [count only — "N patterns already captured"]

### Agent A: Abandoned Work
[Top 5 incomplete sessions — any worth resuming?]

### Agent B: Agent False Confidence
[Top errors by type — any systemic patterns?]
SCHEMA_WRONG: N | INFRA_WRONG: N | DECLARED_DONE: N

### Agent B: Automation Debt (Recurring Questions)
DOC GAPS: [list — should be written down where?]
SKILL GAPS: [list — should be a /command]
CLAUDE.MD GAPS: [list — agent should know this]

### Agent D: Skill-Gap Mining (deduped against B)
[N candidates — name (Nx), gap type, recommendation — or "none detected"]
```

---

### 5. Proposed Changes

For each NEW or STRENGTHEN finding, propose the exact change:

```
PROPOSED CHANGE [N]:
File: CLAUDE.md / docs/technical/debugging.md / .claude/rules/*.md
Section: [section name]
Type: ADD | EDIT | REMOVE
Draft text:
---
[exact text to add/change]
---
Rationale: [1 sentence]
```

Present all proposed changes as terminal output. **Do NOT edit any file from this skill.** Ask: **"Apply all / apply some (list) / skip all?"**

Apply only what the user approves. For each approved CLAUDE.md change, run `/slava:maintain:claude-md` gate check before editing. Subagents spawned by this skill are read-only analysts — they must NEVER edit CLAUDE.md or `.claude/rules/` files.

---

### 6. Save State + Commit

Write the completion marker — **only on completion** (a skipped/abandoned run stays overdue on /day's Due Board). Substitute the actual values for `changes_applied` and `key_insight` before running:

```bash
cat > ~/.claude_monthly_last_run << EOF
date: $(date +%Y-%m-%d)
changes_applied: N
key_insight: [one sentence summary of the most important finding]
EOF
```

After the user approves changes and the main agent applies them (through `/slava:maintain:claude-md` gates), stage and commit:
```bash
git add CLAUDE.md .claude/rules/*.md docs/technical/*.md
# Commit with message: docs(claude-md): monthly meta-review YYYY-MM-DD — [key insight]
```

---

## Rules

- **Filter before presenting.** Never surface findings that are already well-captured in CLAUDE.md — that wastes the session.
- **4 agents in parallel.** Don't serialize — they're independent.
- **Agent D dedupes into Agent B.** Same intent surfaced by both = one finding, not two.
- **Agent C is a devil's advocate, not a validator.** If it finds nothing to challenge, it's not looking hard enough.
- **Proposed change text must be pasteable.** No "something like..." — exact draft text or nothing.
- **User approves before applying.** Never auto-apply CLAUDE.md changes.
- **Run `/slava:maintain:claude-md` gate on each CLAUDE.md change.** Even if the monthly synthesis already checked placement.
- **This is not a weekly retro.** No Sentry, no metrics, no product retrospective, no user conversation count. That's `/weekly`. This is about the collaboration system itself.
- **Cadence:** Run monthly. If run more frequently, findings will thin out and the signal/noise ratio drops. If run less frequently, drift compounds undetected.
