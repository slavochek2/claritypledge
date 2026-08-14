---
status: backlog
type: task
rank: 79
created_date: '2026-07-15'
tags:
  - infrastructure
  - backups
  - disaster-recovery
  - ci
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P999: Prompt a manual backup dispatch right after a backup-pipeline change lands

## Problem

**Situation:** `db-backup.yml` runs daily at 03:00 UTC. P995 added staleness alerting that fires if too many days pass without a successful backup.

**Complication:** P997 (2026-07-15) found zero `.verified` markers in `gs://claritypledge-db-backups/` at the start of a restore test. Cause: the P991 marker-write step merged at 13:26 UTC, after that day's only scheduled run (05:22 UTC) — nothing had run since. This wasn't a broken pipeline, just an invisible same-day gap: the backup mechanism *itself* changed, but nothing prompted a fresh run to prove the new code path actually works before the next 3am cycle. P995's staleness alert is the eventual backstop, but its threshold is measured in days — it would not have caught this gap same-day, and arguably shouldn't (a multi-hour gap is not itself an incident).

**Question:** How do we close the same-day blind spot between "a change to the backup/verify pipeline merges" and "someone notices the next scheduled run hasn't happened yet / hasn't been checked"?

## Appetite

Low blast radius (touches `db-backup.yml` or its CI wrapper only, no application code). Fully reversible (remove the added step/check). Low decision density — this is a reminder mechanism, not new backup logic.

## Solution

Add a lightweight signal that fires when `.github/workflows/db-backup.yml` (or the SQL/shell verification logic inside it) changes on `main`, prompting a manual `workflow_dispatch` rather than waiting for the next scheduled run. Candidate shapes (pick the cheapest one that closes the gap — this is an implementation-time decision, not prescribed here):
- A GitHub Actions workflow triggered on `push` to `main` touching `db-backup.yml`, which posts a reminder (PR comment, or a check-run annotation) saying "backup pipeline changed — dispatch a manual run to verify before the next scheduled cycle."
- A checklist line added to this repo's PR template or `git-workflow.md`, checked manually when this file is touched.
- Extending P995's staleness check to also compare "time since `db-backup.yml` last changed" vs. "time since last successful run," alerting same-day if a run hasn't happened since a pipeline change.

## Risks / Non-Goals

### Risks
- **Alert fatigue if this fires on every doc-only comment change to the file.** Scope the trigger to lines that affect backup or verification *behavior*, not comments. **MITIGATE — if using a path-based CI trigger, accept coarse (whole-file) triggering rather than building diff-content parsing; false positives here are cheap (a no-op manual dispatch), false negatives are not.**

### Non-Goals
- Do NOT modify the backup or verification logic itself — P991 and P995 own that; this spec only adds a reminder/prompt mechanism.
- Do NOT build a general "remind after any CI file changes" system — scope strictly to `db-backup.yml` and its verification step.
- Do NOT make this a hard CI gate that blocks merging `db-backup.yml` changes — it's a reminder, not an enforcement mechanism yet. If the reminder is repeatedly ignored, that's a signal to reconsider — a decision for a later spec, not this one.

### Alternatives Considered
- **Do nothing — rely on P995's multi-day staleness alert.** Rejected as the sole mitigation: it would have caught P997's gap eventually, but only after days, not same-day. A manual restore test or an actual incident in that window would have hit the same "no marker exists" surprise P997 found.
- **Require restore tests only.** Rejected — restore testing on every pipeline change is disproportionate (P997 was a one-time manual proof, not a recurring gate); a reminder to dispatch a fresh backup is far cheaper and closes the specific gap found.

### Rollback Strategy
Remove the added CI step or checklist line. No data or schema changes involved.

## Done-When

- [ ] A change to `db-backup.yml` (or its verification logic) on `main` produces a visible prompt to manually dispatch a backup run
- [ ] The prompt/check does not fire on changes to unrelated workflow files
- [ ] Mechanism documented in `docs/technical/db-restore.md` or `db-backup.yml`'s own comments, so a future session understands why it exists

## Origin

Flagged by `/kdd` on 2026-07-15 as a follow-up from P997's restore test. See [docs/decisions.md](../docs/decisions.md) 2026-07-15 [technical]: *"No mechanism currently prompts 'dispatch a manual backup' right after a backup-pipeline change merges."*
