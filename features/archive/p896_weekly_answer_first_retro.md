---
status: rejected
type: task
rank: 1000785.0
created_date: '2026-06-04'
tags: [skills, weekly, day, retro]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P896: Answer-First Weekly Retro + Inline Due-Board Offers

> **Rejected 2026-06-05, superseded by P900.** Answer-first drafting still interrogates; transcript-mining duplicates `/claude-conversations-to-pp` / `-to-cp` (the actual coaching layer). New direction: routine reviews are monitor→actions with zero founder input; `/day` auto-runs overdue reviews. Coaching/accountability deferred to the conversations-to-* family.

## Problem

**Situation:** `/slava:maintain:weekly` Step 5 asks 4 mandatory retro questions (avoidance, build/sell ratio, hypothesis test, re-derivation) from zero, as if the agent knows nothing about the week. But the founder's week is documented in session transcripts — avoidances, decisions, and reasoning were already articulated to agents across sessions.

**Complication:** The founder doesn't answer the questions. Being re-interrogated by an agent that didn't "read" the week feels like wasted discussion, so the retro's accountability function produces nothing. A proposal to merge /day, /weekly, /monthly into one skill was considered and rejected — the dispatcher pattern (/day's Due Board) already routes; the broken part is the question mechanic.

**Question:** How do we make the weekly retro consume the week's existing evidence so the founder confirms/corrects instead of composing answers from scratch?

## Appetite

Low blast radius (two skill files; no product code, no DB). Fully reversible (git revert of skill edits). Low decision density — mechanic is decided (answer-first); only wording calibration may need founder input.

## Solution

**1. /weekly Step 5 redesign — answer-first, confirm-second.**
A transcript-mining subagent (same infrastructure as existing Step 2.7 prompt-pattern mining) scans the period's session logs and **drafts evidence-grounded answers** to the 4 mandatory questions:

- *Avoidance:* actions discussed 2+ times across sessions but never executed (e.g., "you discussed reaching out to X three times and didn't")
- *Build/sell/learn ratio:* estimated from commit mix + conversation topic distribution
- *Hypothesis test:* real-person / prod-usage tests found in transcripts (codebase surprises still excluded)
- *Re-derivation:* strategy topics re-explained across sessions with no new evidence

Each drafted answer ends with **"Confirm or correct?"** — the founder reacts in one word instead of composing essays. If the subagent finds no evidence for a question, it falls back to asking that one question directly (never silently skips). Evidence-derived questions and the pattern interrupt (Step 6) stay as-is — they're already evidence-grounded.

**2. /day Step 8 Due Board — offer, don't just print.**
When a review is overdue, /day asks inline: "weekly is Nd overdue — run it now? (y/n)" and invokes it on yes. Keeps the "never auto-invoke" spirit — the founder still decides, but with one keystroke instead of a copy-paste.

## Risks / Non-Goals

### Risks
- **Drafted answers anchor the founder** — a wrong draft confirmed lazily is worse than no draft. Mitigation: each draft must cite its evidence (session date + quote fragment); no-evidence questions fall back to direct asking.
- **Transcript mining is slow/heavy** on big weeks. Mitigation: reuse Step 2.7's background-subagent pattern (sonnet, runs in parallel while other steps proceed).
- **Softening the sting** — answer-first could turn the retro into a rubber stamp. Mitigation: drafts must state the uncomfortable finding plainly ("zero user conversations found in transcripts"), and the "scary thing must have a name and a date" rule in Step 7 is untouched.

### Non-Goals
- Do NOT merge /day, /weekly, /monthly into one skill — explicitly rejected; scopes are distinct and the Due Board already dispatches.
- Do NOT remove or reword the 4 mandatory questions' intent — only invert the ask mechanic.
- Do NOT touch /monthly.
- Do NOT change /weekly's evidence-gathering steps (1–4), Step 6 pattern interrupt, or Step 7 commitment format.
- Do NOT auto-run weekly/monthly from /day without a y/n confirmation.

### Alternatives Considered
- **Full merge into one adaptive skill:** rejected — ~2,300 lines in one context, distinct scopes, dispatcher exists.
- **Delete the mandatory questions:** rejected — avoidance check + zero-user-conversations flag are the retro's core; "a retro that never stings is a journal entry."
- **Pre-fill from /day's daily outputs instead of transcripts:** rejected — /day captures ops health, not the founder's reasoning/avoidances; transcripts are where the answers actually live.

### Rollback Strategy
`git revert` the commits touching `.claude/commands/slava/maintain/weekly/SKILL.md` and `.claude/commands/slava/day.md`. No state files or schemas change.

## Done-When

- [ ] Running /weekly presents drafted, evidence-cited answers to all 4 mandatory questions with "Confirm or correct?" instead of open-ended asks
- [ ] A question with no transcript evidence is asked directly (visible fallback, not skipped)
- [ ] Each draft cites at least one concrete evidence fragment (date + paraphrase/quote)
- [ ] /day Due Board offers "run it now? (y/n)" for overdue reviews and invokes the skill on yes
- [ ] Step 7 commitment format (named person + date) unchanged and still enforced
- [ ] Skill frontmatter validator passes (`python3 scripts/fix-skill-frontmatter.py`)
