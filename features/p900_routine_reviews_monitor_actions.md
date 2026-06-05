---
status: qa
type: task
rank: 1000789.0
created_date: '2026-06-05'
tags: [skills, day, weekly, monthly, routine]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
---

# P900: Routine Reviews — Monitor → Actions, Single Entry Point

> Supersedes P896 (rejected: answer-first retro replaced by removing interrogation entirely; coaching deferred to the conversations-to-* family).

## Problem

**Situation:** Routine reviews are split across `/day` (daily ops cockpit), `/weekly` (ops battery + founder retro with 4 mandatory questions and a next-week commitment), and `/monthly` (collaboration meta-review). `/day`'s Due Board prints overdue review commands but never invokes them.

**Complication:** The reviews don't happen. The founder doesn't copy-paste the printed commands, and doesn't answer `/weekly`'s retro questions — being re-interrogated by an agent feels like wasted discussion (documented in P896). Meanwhile `/weekly` duplicates checks `/day` already runs daily (DB backup age, Sentry, signup counts) and overlaps `/monthly`'s skill-gap mining. The founder's stated model: "monitor and done — see if any actions." Coaching/accountability belongs to `/claude-conversations-to-pp` and `-to-cp` (the transcript-mining skills that already surface personal and strategic patterns), not the routine skills.

**Question:** How do the three routine reviews run themselves from one entry point (`/day`), each producing monitor→actions output with zero founder interrogation?

## Appetite

Low blast radius (three skill files; no product code, no DB). Fully reversible (`git revert` of skill edits; state-file change only drops optional fields). Low decision density — all design decisions made in conversation: pure monitor (zero asks), auto-run with skip, one-command entry, no file merge.

## Solution

**1. `/weekly` → pure monitor.** Strip all founder input:
- Step 5 (retro questions: 4 mandatory + evidence-derived) — removed entirely
- Step 7 (next-week commitment STOP/START/SCARY THING) — removed
- Step 4's interactive asks (LAST WEEK yes/partial/no, USER CONVOS count) — removed
- Step 6 pattern interrupt **stays**, as printed statements requiring no response. Triggers that depended on stripped inputs (zero-user-convos flag, commitment-missed flag) are removed or rewired to evidence-only sources.
- State file `~/.claude_weekly_last_run` keeps `date:` only (the Due Board reads it).

**2. `/weekly` closing section → ACTIONS.** One-line actionable items derived from evidence already gathered: ops email ACTION_NEEDED/DECISION items, process debt entries, GCP/cost flags, code health ❌ verdict, privacy/secret findings. "ACTIONS: none" is a valid output.

**3. `/day` Due Board → auto-run.** Replace "print the command" with: announce ("weekly is Nd overdue — running it now; say 'skip' to defer"), then invoke. Max one review per `/day` run — if both weekly and monthly are due, run the most overdue and name the other. Daily output still prints first (Due Board stays Step 8). Markers are written only on review completion (existing behavior), so a skipped/abandoned run stays overdue.

**4. De-dup across the family:**
- `/weekly` drops its DB-backup and Sentry checks (`/day` runs both daily)
- `/weekly` 2.1 reads signup counts from `.private/metrics/funnel-daily.csv` (which `/day` already writes) instead of re-querying prod
- `/weekly` 2.7 prompt-pattern/skill-gap mining moves to `/monthly` (overlaps Agent B's recurring-questions analysis; gap detection needs a month of volume)
- `/day` Step 6b memory hygiene moves to `/weekly` (hygiene scan, weekly cadence)

## Risks / Non-Goals

### Risks
- **Auto-run makes some `/day` runs long.** MITIGATE: max one review per day; daily output delivered before the review starts; conversational "skip" defers without penalty.
- **Stripping commitment + user-convos removes the retro's accountability sting in the interim.** ACCEPT — founder decision (this conversation): accountability returns properly designed in the conversations-to-* coach evolution; a retro the founder doesn't engage with produces nothing either way.
- **Downstream readers of `~/.claude_weekly_last_run` may expect commitment fields** (weekly SKILL.md notes the commitment "appears in the Kanban Goals view"). MITIGATE: keep `date:`; before stripping, grep kanban/goals code for reads of that file and verify missing fields degrade gracefully.
- **`funnel-daily.csv` may be missing or stale** (fresh machine, `/day` not run recently). MITIGATE: `/weekly` falls back to the existing prod query when the CSV is absent or its last row is older than the review period.

### Non-Goals
- Do NOT merge the three skill files into one. Lazy-loading rationale: a skill's text enters context only when invoked; merged, every daily run would carry ~1,050 lines of weekly/monthly instructions that fire at most once a week. One *command* (`/day`), three files.
- Do NOT add any coaching, question-asking, or accountability mechanics — that layer is deferred to `/claude-conversations-to-pp` / `-to-cp` improvements (separate future spec).
- Do NOT touch `/monthly`'s scope beyond receiving the 2.7 mining step.
- Do NOT change `/day`'s health checks, user intelligence, or reflection steps (except moving 6b out).
- Do NOT auto-run more than one review per `/day` invocation.

### Alternatives Considered
- **Answer-first retro (P896):** draft evidence-grounded answers to the 4 questions for confirm/correct. Rejected — still interrogation; transcript-mining duplicates conversations-to-*; founder wants monitor-only routine.
- **Coach mechanic with persistent dossier:** 0–5 context-aware questions with a case-notes file in pp. Rejected for the routine skills — it rebuilds what conversations-to-pp/-to-cp already own; deferred to that family.
- **y/n confirmation before auto-run:** rejected — the observed failure is reviews not happening; a gate whose answer is always "y" is friction. Conversational "skip" preserves control.
- **Full merge into one adaptive skill:** rejected — context cost on every daily run (see Non-Goals).

### Rollback Strategy
`git revert` the commits touching `day.md`, `weekly/SKILL.md`, `monthly/SKILL.md`. State file: dropped fields were only read by weekly's own LAST WEEK step (removed in the same change); `date:` is unchanged. No product code, no schema.

## Done-When

- [x] `/weekly` runs end-to-end with zero founder prompts — no questions, no commitment, no user-convos ask
- [x] `/weekly` output ends with an ACTIONS section (actionable items or "none")
- [x] `/weekly` contains no DB-backup or Sentry check; signup counts read from `funnel-daily.csv` with prod-query fallback (CSV format verified against live file: cumulative totals, no header)
- [x] `/day` Due Board auto-runs the most-overdue review with announce + skip; never more than one per run
- [x] A skipped review stays overdue (marker only written on completion) — *mechanism verified by grep (single write site at end of each review skill; `/day` never writes markers). Founder accepted mechanical verification at ship time (2026-06-05); the first live `/day` run is the empirical check — failure mode is a one-file skill edit.*
- [x] Skill-gap mining lives in `/monthly` only (Agent D; weekly keeps a pointer stub); memory hygiene lives in `/weekly` only (2.14)
- [x] Kanban Goals view verified to degrade gracefully without commitment fields in the state file (3/3 `/api/weekly` tests pass; parser sim with date-only file returns `{date}`; Goals commitment card reads `docs/goals.md`, not the state file)
- [x] `python3 scripts/fix-skill-frontmatter.py` passes on all three skill files (only pre-existing warnings on out-of-scope `finish/criteria/*` files)
- [x] P896 in `features/archive/` with `status: rejected`
