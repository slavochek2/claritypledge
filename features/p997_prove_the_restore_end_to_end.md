---
status: week
type: task
rank: 1000949.0
created_date: '2026-07-15'
tags: [infrastructure, backups, disaster-recovery, untested]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P997: Restore a real prod backup once, end-to-end — the only untested link in the chain

## Problem

**Situation:** The backup pipeline is now well defended. P991 added an empty-database canary, a `.verified` marker making verification load-bearing, and a restore *rule* ("newest object with a matching marker"). P995 adds staleness alerting. `docs/technical/db-restore.md` documents the procedure.

**Complication:** **Not one of those artifacts proves the data comes back.** Every check is proven against fixtures — hand-built gzip files with three fake `profiles` rows. No real 900KB prod dump has ever been restored into a live Postgres, and no application has ever booted against a restored database. The restore procedure was written from reasoning about `pg_dump` output, not from doing it.

The backup infrastructure has now been built, hardened, adversarially reviewed, alerted on, and documented — while the question it exists to answer ("can we get the data back?") has never once been asked out loud. This spec exists because [docs/decisions.md](../docs/decisions.md) 2026-07-15 [technical] names it *the highest-value untested claim in the infrastructure*, and nothing tracked it.

**Question:** Does a real backup actually restore — and what breaks when we try?

## Appetite

Low blast radius (restore into a throwaway database; prod is never written to). Fully reversible (drop the scratch DB). Low decision density — the procedure is written; this executes it once and records what was wrong.

**This is a test, not a build.** The deliverable is evidence plus corrections to the doc, not new machinery. If it passes first try, the spec closes with a paragraph of output.

## Approach

Run [docs/technical/db-restore.md](../docs/technical/db-restore.md) exactly as written, against a real backup, and record every place reality diverges from the doc.

1. Select the newest verified backup using the documented rule. Confirm the marker's `sha256` matches the object's actual bytes — the marker mechanism has never been exercised against a real GCS object, only local fixtures.
2. Restore into a **scratch** database. Never prod, never the Supabase prod project. Expect friction here — a Supabase dump carries extensions, roles, and schemas (`auth`, `storage`, `extensions`) a bare local Postgres does not have. **Errors here are the finding**, not a nuisance to work around silently: they are what a real 3am restore would hit.
3. Verify data actually landed: compare `SELECT count(*) FROM public.profiles` against `profiles_rows` in the marker, then spot-check `stories`, `points`, `clarity_sessions`.
4. **Record wall-clock time.** Nobody knows whether restore takes 2 minutes or 2 hours. That number is the difference between an incident and a crisis, and it is currently unknown.
5. Correct `db-restore.md` against what actually happened, and remove the "Open: prove the restore" section.

## Risks / Non-Goals

### Risks
- **The restore may not cleanly work, and that is a success condition for this spec.** Finding out now beats finding out during an incident. Do NOT paper over failures to reach a green result — an honest "restore needs these 4 undocumented steps" is the whole point. **MITIGATE — report faithfully.**
- **Temptation to fix problems instead of recording them.** If restore needs the dump's flags changed, that is a *finding* that belongs in a follow-up spec, not an in-flight change to `db-backup.yml`. Changing the backup mid-test invalidates the test. **MITIGATE.**
- **Prod dumps contain real user data.** The scratch DB must be local/ephemeral and destroyed afterwards. Never restore prod data anywhere shared or persistent, and never commit dump contents or query output containing user rows. **MITIGATE — this is a privacy boundary, not a preference.**

### Non-Goals
- Do NOT restore into prod, staging, or the Supabase prod project. Scratch only.
- Do NOT modify `db-backup.yml`. P991 steps 7–8 are shipped and proven; if this test reveals the dump itself is wrong, file a new spec.
- Do NOT build restore automation, a runbook script, or a scheduled restore test. This is one manual restore, once. Automation is a decision for after we know what restore even involves.
- Do NOT redo P991 or P995.
- Do NOT commit any user data, dump excerpt, or query output containing real rows.

### Alternatives Considered
- **Automate a scheduled restore test (restore-to-scratch weekly).** The right long-term answer and explicitly out of scope: automating a procedure nobody has performed once bakes in unknown assumptions. Do it manually first; automate what we learn.
- **Trust the fixtures.** Rejected — that is the exact reasoning this spec exists to reject. Fixtures prove the *checks* work. They cannot prove a real dump restores, because they were authored from the same assumptions the checks were.
- **Restore into Supabase prod to be realistic.** Rejected outright: destructive, irreversible, and unnecessary — a scratch DB answers the question.

### Rollback Strategy
Drop the scratch database, delete the local dump. Nothing in prod is touched, so there is nothing to roll back.

## Done-When

- [ ] A real backup object from `gs://claritypledge-db-backups/` was selected using the documented marker rule, and its `sha256` verified against the marker — **evidence:** paste the object name and both hashes
- [ ] The dump restored into a scratch Postgres — **evidence:** paste the terminal output, including every error or warning, even if non-fatal
- [ ] `profiles` row count in the restored DB matches `profiles_rows` in the marker — **evidence:** paste both numbers (counts only — no user rows)
- [ ] Wall-clock restore time recorded
- [ ] `docs/technical/db-restore.md` corrected against what actually happened, and the "Open: prove the restore" section removed
- [ ] Every divergence between the doc and reality is either fixed in the doc or filed as a follow-up spec — **no silent workarounds**
- [ ] The scratch DB and local dump are destroyed

## Origin

Flagged by `/kdd` on 2026-07-15 as follow-up work with no owner. P991 owns backup integrity, P995 owns alerting, P996 owns the P-number tooling — none of them prove recoverability. See [docs/decisions.md](../docs/decisions.md) 2026-07-15 [technical]: *"Every check is fixture-proven; the last link of the chain is not."*
