---
status: week
type: task
rank: 30
created_date: '2026-08-14'
tags: [skills, weekly, monthly, process]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1081: Deferred Notes Queue — `/note` writes it, `/weekly` and `/monthly` close it

> Completes P900, which wired `/weekly`'s ACTIONS section to read "process debt entries"
> from a store that was never created.

## Problem

**Situation:** `/weekly` step 2.5 reads `docs/process-learnings.md`, scans for
`Status: proposed` entries, flags anything sitting 2+ weeks, and feeds the result into
its closing ACTIONS section (`maintain/weekly/SKILL.md:207, 577`). `/claude-conversations-to-cp`
writes to the same file, routing "workflow friction, recurring manual steps" there
(`maintain/claude-conversations-to-cp.md:49, 158, 305, 321`).

**Complication:** `docs/process-learnings.md` does not exist and never has. Step 2.5
therefore prints `PROCESS DEBT: no tracking file yet` and skips on every run — and
because that string reads as ordinary output rather than an error, nothing has ever
looked broken. A reader and a writer are wired to an absent store. Separately, the only
write path is a byproduct of a conversation-mining run; there is no way to queue an item
from an arbitrary session, so deferred work ("re-run this measurement in 14 days") is
held in the founder's memory, which is the stated failure mode.

**Question:** How does a note filed from any session reach the routine review that should
act on it, without becoming a second backlog nobody closes?

## Appetite

Low blast radius — three skill files plus one new tracked doc; no product code, no DB, no
migrations. Fully reversible (`git revert` of skill edits; deleting the store returns
step 2.5 to its current silent-skip behaviour). Low decision density — the store's
location and the reader are already fixed by existing dependents; the only open choice
(public `docs/` vs `.private/docs/` routing) is resolved by the repo's existing privacy
rule.

## Solution

**1. Create the store.** `docs/process-learnings.md`, in the shape step 2.5 already
expects: dated entries carrying `Status: proposed` / `Status: done`, one per item.
Add a `due:` field with values `week` or `month`.

**2. New `/note` skill.** Writes one entry to the store from any session. Takes the note
text and an optional cadence (`week` default, `month` on request). Applies the repo's
existing privacy rule at write time: an entry naming infrastructure, credentials, security
mechanics, or absolute user paths is written to `.private/docs/process-learnings.md`
instead, and the public store carries no placeholder for it.

**3. `/weekly` reads and CLOSES.** Step 2.5 additionally reads the private store when it
exists. Entries tagged `due: week` are surfaced in ACTIONS. **The step must be able to
mark an entry `Status: done`** — a queue that only ever accumulates is the failure this
spec is trying to avoid, and is the same shape as the 62 unresolved `Status: proposed`
occurrences already recorded in `docs/decisions.md`.

**4. `/monthly` gains the same reader**, scoped to `due: month`.

**Seed entries** (already outstanding, to be filed as part of this work):
- Re-run `~/.claude/hooks/measure/decision-brief-rate.py` on or after 2026-08-28;
  pre-change baseline 9.12 asks/active day. If the rate has not fallen, presentation
  order was not the constraint. *(private — names global config paths)*
- `~/.claude` holds uncommitted agent-config changes and has no remote. *(private)*
- Step 2.5 silently skipped for its whole lifetime; recorded so the fix is evidenced
  rather than assumed. *(public)*

## Risks / Non-Goals

### Risks
- **The queue becomes a guilt backlog.** Mitigation: `/weekly` must close entries, not
  only list them; ageing entries already get louder via the existing 2+ week flag.
- **Privacy misrouting.** A note about infra lands in the public repo. Mitigation: `/note`
  applies the existing rule at write time, and `audit-privacy.sh` remains the backstop.
- **Silent-skip recurs.** If the private store is absent, the new read path could skip
  just as quietly. Mitigation: the absence of a store the skill was told to read must
  print as a distinguishable line, not as normal output. This is the defect being fixed —
  do not reproduce it.

### Non-Goals
- Do NOT repoint `/weekly` step 2.5 or `/claude-conversations-to-cp` at a different
  filename. Both already name `docs/process-learnings.md`; the file is what is missing.
- Do NOT add categories, priorities, recurrence, or assignees. Three fields (text, date,
  `due:`) are the whole design.
- Do NOT build a `/note` reader into `/day`. The Due Board already auto-runs overdue
  reviews; adding a fourth surface re-creates the duplication P900 removed.
- Do NOT refactor `/weekly`'s other steps while editing 2.5.
- Do NOT convert existing `docs/decisions.md` `Status: proposed` entries into notes.
  That is a separate, larger question already recorded there.

### Alternatives Considered
- **A parallel notes file with a new name** — rejected: two existing dependents already
  name `process-learnings.md`, so a new file would leave both still wired to nothing.
- **Notes in `pp/docs/`** — rejected: `/weekly` and `/monthly` are cp-scoped and run from
  cp; a cross-repo read adds a dependency for no gain. Privacy is handled by the
  `.private/` route, which is already the repo's convention.
- **A full task system (categories, priorities, recurrence)** — rejected: becomes its own
  maintenance job, which defeats the purpose of a queue for things you would otherwise
  forget.
- **Relying on `/day`'s Due Board alone** — rejected: it schedules *reviews*, and holds no
  per-item content.

### Rollback Strategy
`git revert` the skill edits; delete `docs/process-learnings.md`. Step 2.5 returns to
printing `no tracking file yet`. The private store is in a separate nested repo and is
removed independently. No product surface is touched, so no deploy is involved.

## Done-When

- [ ] `docs/process-learnings.md` exists and `/weekly` step 2.5 no longer prints
      `no tracking file yet`
- [ ] `/note "text"` appends a dated `Status: proposed` entry with `due: week`
- [ ] `/note "text" month` writes an entry with `due: month`
- [ ] A note naming infra/credentials/absolute user paths is written to the private store,
      and `./scripts/audit-privacy.sh` passes on the public one
- [ ] `/weekly` surfaces `due: week` entries in ACTIONS and can mark one `Status: done`
- [ ] `/monthly` surfaces `due: month` entries
- [ ] A run with an absent store prints a distinguishable line rather than reading as
      normal output — verified by temporarily renaming the store and observing the output
- [ ] The three seed entries above are filed in the correct stores
- [ ] `./scripts/pre-commit-checks.sh` passes
