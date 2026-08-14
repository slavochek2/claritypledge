---
type: task
rank: 30
created_date: '2026-08-14'
tags: [skills, weekly, monthly, process]
status: all-done
pipeline_ran: [create-spec, dev]
completed_at: '2026-08-14'
driver: anomaly
---

# P1081: Task inbox — make it discoverable, make it close

> **Rewritten 2026-08-14.** The first draft of this spec claimed `docs/process-learnings.md`
> "does not exist and never has" and built its whole solution on creating it. That claim was
> false: the file has existed since 2026-02-25, has 29 commits, was last written 2026-08-03,
> and holds 8 open entries. See `## Superseded Framing` at the bottom for what was wrong and
> why it matters that the rollback plan said to delete the file.

## Problem

**Situation:** `docs/process-learnings.md` is the repo's deferred-work inbox. `/weekly`
step 2.5 reads it, flags entries sitting 2+ weeks, and feeds the count into the closing
ACTIONS section (`maintain/weekly/SKILL.md:207, 577`). `/claude-conversations-to-cp` writes
to it when a mining run surfaces workflow friction
(`maintain/claude-conversations-to-cp.md:49, 158, 305, 321`).

**Complication — two failures, neither of which is an absent file:**

1. **Nothing can retire an entry.** The inbox holds **8 open items**, oldest dated
   2026-05-19. `/weekly` can surface and age-flag them; it has no step that marks one done.
   The write paths are automated, the only exit is a manual decision, so the section gets
   louder every week while the cost of skipping it stays zero. This already happened once:
   `docs/decisions.md` (~L15520) records the file reaching 14 items with zero resolved —
   *"the file became a graveyard"* — cleaned 14 → 4, with a graduation rule that was never
   wired into anything that runs. Five months later it is at 8.

2. **No agent can discover the inbox exists.** `grep -rn "process-learnings"` returns **zero
   hits** in `CLAUDE.md`, in `.claude/rules/`, and in `docs/CHARTER.md`. Exactly two skills
   name it, and both were written specifically against it. `/kdd` no longer writes here at
   all (`maintain/kdd/SKILL.md:398` — "One file, no graduation step" folded proposals into
   `decisions.md`), leaving a reader and one incidental writer with no shared owner.
   **Observed consequence:** the session that filed this very spec told the founder to
   *remember* a 14-day follow-up himself rather than filing it — the correct behaviour was
   unavailable to it, not skipped by it.

**Question:** How does an agent in any session file a deferred item into an inbox it can
find, and how does that item ever leave the inbox?

## Appetite

Low blast radius — three skill files, one shared-config pointer, one new skill; no product
code, no DB, no migrations. Reversible by `git revert` of the skill edits. Decision density
is low: store location, reader, and format are already fixed by existing dependents.

**One hard constraint on the whole appetite:** the store holds live content, including a
pre-commitment whose own text says *"still unfilled — and a campaign is imminent."* No step
of this work may delete, truncate, or rewrite existing entries.

## Solution

Ordered by what addresses the observed failure. Steps 1–2 are the spec; 3–5 are worth
having and do not address Point 1 above.

**1. `/weekly` must be able to CLOSE an entry.** Step 2.5 currently reads and age-flags.
Add: for each surfaced entry, offer resolve / keep / drop. Resolving follows the existing
documented graduation rule (delete from the store, add a `[process]` entry to
`docs/decisions.md`). A queue that only accumulates is the failure this spec exists to fix,
and the 8 live entries are the evidence it is already happening.

**2. Make the inbox discoverable to agents that were never told about it.** One pointer in
shared config naming the store, what it is for, and the rule *"file it, don't ask the human
to remember it."* Without this, the behaviour in Complication 2 recurs on every session that
did not read this spec.
**Gate:** `CLAUDE.md` and `.claude/rules/*.md` may not be edited directly — run
`/slava:maintain:claude-md` first and let it decide placement and wording. Do not assume
`CLAUDE.md` is the right home; the gate may route it to a rules file.

**3. New `/note` skill.** Writes one entry to the store from any session: text, today's
date, `Status: proposed`, and a `due:` field (`week` default, `month` on request). This is
the write path the founder currently lacks — but note the store filled to 8 entries without
it, so it is not what is blocking Point 1.

**4. Private routing.** An entry naming infrastructure, credentials, security mechanics, or
absolute user paths goes to `.private/docs/process-learnings.md` (does not yet exist); the
public store carries no placeholder for it. `/weekly` reads the private store when present.
**If it is absent, that must print as a distinguishable line, not as ordinary output** — a
reader wired to a store that isn't there is the exact defect this spec was originally
misdiagnosed as, and it must not be introduced for real.

**5. `/monthly` gains the same reader**, scoped to `due: month`.

**Format note (do first, it is one line):** the store's header documents the field as
`Status: proposed`; all 8 entries write `**Status:** proposed`. A semantic reader finds them;
`grep -c "Status: proposed"` returns 1 (the header). Any mechanical count or close built on
the literal form will silently see zero. Reconcile header and entries to one form before
building step 1 against it.

**Seed entries** (outstanding, to be filed as part of this work):
- Re-run `~/.claude/hooks/measure/decision-brief-rate.py` on or after 2026-08-28; pre-change
  baseline 9.12 asks/active day. If the rate has not fallen, presentation order was not the
  constraint. *(private — names global config paths)*
- `~/.claude` holds uncommitted agent-config changes and has no remote. *(private)*

## Risks / Non-Goals

### Risks
- **MITIGATE — Rollback destroys live content.** The first draft of this spec instructed
  `delete docs/process-learnings.md` on rollback. That would have discarded 8 entries
  including the unfilled pre-campaign thresholds. Rollback is `git revert` of skill edits
  only; the store is never deleted.
- **MITIGATE — The queue stays a guilt backlog.** This is the live state, not a
  hypothetical. Step 1 is the mitigation; the existing 2+ week flag is not, because it has
  been flagging since May.
- **MITIGATE — Silent skip on the private store.** See step 4.
- **MITIGATE — Privacy misrouting.** `/note` applies the repo's existing rule at write time;
  `audit-privacy.sh` is the backstop, not the control.
- **ACCEPT — Intake is not throttled.** Automated writers can keep filing faster than weekly
  closes. Revisit only if the count rises after step 1 ships.

### Non-Goals
- Do NOT repoint `/weekly` step 2.5 or `/claude-conversations-to-cp` at a different filename.
- Do NOT delete, truncate, or bulk-edit the 8 existing entries. Step 1's close path is
  founder-driven, one entry at a time.
- Do NOT add categories, priorities, recurrence, or assignees. Three fields (text, date,
  `due:`) are the whole design.
- Do NOT build a reader into `/day`. The Due Board already auto-runs overdue reviews; a
  fourth surface re-creates the duplication P900 removed.
- Do NOT re-point `/kdd` at this store. Its proposals live in `decisions.md` by an explicit
  decision (`kdd/SKILL.md:398`); reversing that is a separate question.
- Do NOT convert existing `docs/decisions.md` `Status: proposed` entries into notes.
- Do NOT refactor `/weekly`'s other steps while editing 2.5.

### Alternatives Considered
- **Build the note-filing path first (the original spec's shape)** — rejected: the store
  demonstrably fills without it (8 entries, none filed by a `/note` command). Intake is not
  the constraint; exit is.
- **Throttle intake instead of building an exit** — i.e. stop automated runs from filing
  proposals nobody intends to act on. Rejected *for now*, and it is the more demanding
  reading: it would shrink future inflow but leaves the 8 current entries exactly where they
  are. Recorded as the fallback if the count rises post-ship.
- **A parallel notes file with a new name** — rejected: two dependents already name this one.
- **Notes in `pp/docs/`** — rejected: `/weekly` and `/monthly` are cp-scoped; `.private/` is
  the repo's existing privacy route.
- **A full task system (categories, priorities, recurrence)** — rejected: becomes its own
  maintenance job.
- **Relying on `/day`'s Due Board alone** — rejected: it schedules *reviews*, and holds no
  per-item content.

### Rollback Strategy
`git revert` the skill edits and the shared-config pointer. **Do not delete
`docs/process-learnings.md`** — it predates this spec by six months and holds live content.
If created, `.private/docs/process-learnings.md` is in a separate nested repo and is removed
independently. No product surface is touched, so no deploy is involved.

## Done-When

- [x] Header and all entries in `docs/process-learnings.md` use one consistent `Status:` form,
      and the reader matches it — verified by a literal count returning 8, not 1.
      *Standardised on the bold form the 8 entries already used (zero entry content touched);
      the header was reworded so it no longer matches. `grep -c '^\*\*Status:\*\* proposed'`
      returned exactly 8 at reconcile time.*
- [x] `/weekly` step 2.5 offers resolve / keep / drop per surfaced entry, and resolving
      removes it from the store and adds a `[process]` entry to `docs/decisions.md`.
      *One batched prompt, not one per entry; default is keep, so an unattended `/day`-triggered
      run never blocks.*
- [x] A `/weekly` run is executed and its `PROCESS DEBT:` line is pasted as evidence, showing
      the real count (currently 8) rather than `no tracking file yet`.
      **Deviation, disclosed:** step 2.5 and the step-4 `PROCESS DEBT:` line were executed
      verbatim; the *full* `/weekly` was not run, because its other steps fire GCP-spend,
      Mixpanel, SEO and ops-email scans irrelevant to this AC. Output pasted in the run report.
- [x] At least one of the 8 existing entries is closed through the new path, end to end.
      *"/dev pre-flight doesn't check branch lineage" — founder-selected, graduated to
      `decisions.md` 2026-08-14 `[process]`, removed from the store with a tombstone, count
      verified 10 → 9.*
- [x] `/slava:maintain:claude-md` has been run and the inbox pointer is placed where it
      routed it — an agent reading only shared config can find the store and knows to file
      rather than ask the founder to remember.
      *Gate routed it to `CLAUDE.md` (Task Tracking), NOT a rules file: `.claude/rules/*.md`
      are path-triggered, and this rule must fire while writing a summary sentence, which
      touches no path. Budget was at 350/350; "Retiring a tool" moved to
      `docs/technical/cli-tools.md` as the founder-chosen exchange.*
- [x] `/note "text"` appends a dated `Status: proposed` entry with `due: week`
- [x] `/note "text" month` writes an entry with `due: month`
- [x] A note naming infra/credentials/absolute user paths goes to the private store, and
      `./scripts/audit-privacy.sh` passes on the public one
- [x] `/monthly` surfaces `due: month` entries — *scoped filter verified: 1 month entry
      selected, 9 weekly-scope entries (including all undated legacy ones) correctly excluded.*
- [x] A run with an absent private store prints a distinguishable line — verified by
      temporarily renaming the store and observing the output.
      *Renamed the real store, not a copy; restore verified at 2 entries. `0 open` and `ABSENT`
      render differently, and a missing **public** store prints a third, louder line.*
- [x] The two seed entries above are filed in the private store
- [x] All 8 pre-existing entries are still present except any deliberately closed in step 4
      — *7 intact, 1 deliberately closed.*
- [x] `./scripts/pre-commit-checks.sh` passes

## Superseded Framing

The 2026-08-14 first draft stated: *"`docs/process-learnings.md` does not exist and never
has. Step 2.5 therefore prints `PROCESS DEBT: no tracking file yet` and skips on every run."*

Both sentences are false. `git log --follow` shows the file created 2026-02-25 with 29
commits through 2026-08-03. The file-absent branch in `weekly/SKILL.md:207` cannot fire. The
draft's third seed entry ("Step 2.5 silently skipped for its whole lifetime; recorded so the
fix is evidenced rather than assumed") asserted an unverified inference as a recorded fact
and has been dropped.

Kept here rather than deleted because the failure is instructive: the draft reasoned from
two skills naming a file to the conclusion that the file was missing, without running `ls`.
`.claude/rules/epistemic.md` gate 1 covers the inverse (never assert absence without a grep);
this was the same error pointed at a file rather than a token. The most expensive consequence
was not the wrong Problem section — it was the Rollback Strategy instructing a future agent
to delete a six-month-old file holding an unfilled pre-campaign commitment.
