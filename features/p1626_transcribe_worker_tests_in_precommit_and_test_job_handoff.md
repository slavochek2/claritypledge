---
status: qa
type: task
rank: 99
workstream: events
created_date: '2026-11-05'
tags: [transcription, pre-commit, self-hosted-test, cloud-tasks]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1626: Worker tests in pre-commit, and the normal job hand-off on self-hosted TEST

## Problem

**Situation:** P1608 proved event transcription with real speech, but its jobs reached the test worker by a direct post or another session's `/sweep`. P1611 landed through a pre-commit that never runs the worker's Python tests.
**Complication:** A commit landed with one of those tests failing (decisions.md 2026-11-05). The normal hand-off on TEST has never run, so a broken dispatch would look like a slow job.
**Question:** Can a failing worker test block its commit, and can a TEST job reach the worker through tick, edge function, Cloud Tasks with nothing kept warm?

> Founder, verbatim: "If they are missing, it must say so loudly and never pass silently." "Do not leave a worker always warm, and do not add a timer that bills while idle. Never touch prod for this."

## Appetite

Blast radius: part 1 blocks commits touching one service; part 2 changes TEST only, but every later TEST room then spends real money. Reversibility: git revert; delete the TEST queue, service account and vault rows. Decision density: low, with the three questions below.

## Invariants

- Nothing here changes prod: not its worker, secrets, queue, IAM, or deployed functions.
- The hook passes only on pytest exit 0. Missing dependencies, a collection error, or no tests collected all block, by name (P1608's masking family, epistemic gate 7).
- No Cloud Scheduler job, no minimum instances, no call to `/sweep` (decisions.md 2026-10-01: a sub-idle ping bills around the clock on this service).
- Credentials travel only by file, never in argv or the transcript (credentials.md).

## Facts measured 2026-11-05, read-only

**Hook.** `scripts/pre-commit-checks.sh` has no pytest step; no `.github` workflow runs these tests. pytest is on the Mac, numpy is not, so 3 test modules cannot be collected on Python 3.14. The image uses Python 3.12, which is not installed here.

**Chain: four links are missing, not one.**

| Link | State on TEST |
|---|---|
| Vault | None of the 3 `enqueue_room_transcription_*` secrets |
| Edge function | Three of the four function secrets it needs were absent from the server: `GCP_ENQUEUER_SA_KEY`, `TRANSCRIBE_ROOM_BATCH_URL`, and the new queue name. `CRON_SECRET` was already there. The first draft called it absent because `--check-secrets` reads the Mac file, not the server; corrected by listing the server names |
| Queue | Only `transcribe-room-jobs`, shared with prod |
| Worker IAM | `transcribe-room-batch-test` allows only the founder's user. `tx-task-invoker` is not allowed, so every task would get 403 |

**What repair would release: 0 jobs.** The tick takes only `pending` with `dispatched_at IS NULL`; there are 0. The room-job trigger fires only on insert. Rounds the tick could close: 0. No room is open.

**Left stuck, not released:** 5 round jobs (30 mic-minutes, about $0.14) and 2 room jobs (about 3 mic-minutes, about $0.02), all from 2026-11-04. Only `/sweep` moves them.

**In use:** no test-worker log entry in the last 6 hours and no local P1608 process at 07:08 UTC. Re-check immediately before the paid run.

## Solution

### 1. Pre-commit

When staged paths include `services/transcribe-room-batch/`, run that service's tests with the environment below and block on anything but exit 0. Other commits do not touch Python.

Environment: a venv outside the repo, shared by worktrees, built by one script from the hash-locked `requirements.txt` on the image's Python 3.12. A missing venv, or one built from a different lockfile, blocks with a banner naming the command to build it. **Building it needs the founder's yes.**

Report, do not fix: `services/transcribe` has the same gap (and one module uncollectable here), plus any other test suite found outside pre-commit.

### 2. TEST hand-off

Isolate TEST on GCP rather than share prod's parts:

- A `transcribe-room-jobs-test` queue, at most 3 attempts.
- A `tx-enqueuer-test` service account that may enqueue only there.
- A `tx-task-invoker-test` service account that may invoke only `transcribe-room-batch-test`. `INVOKER_SA` is a constant today, so it becomes `TRANSCRIBE_ROOM_INVOKER_SA` with today's value as the default; prod behaviour is unchanged.
- Function secrets on TEST, via `scripts/selfhosted/deploy-functions.sh --secrets`, including `TRANSCRIBE_ROOM_BATCH_URL` set to the test worker. Before setting vault rows, prove it is not the prod URL.
- The 3 vault rows on TEST, through the existing TEST SQL path, with values from a file.

Order: secrets and IAM first, one hand-posted job id of no value (expect `claimed: false`) as a chain probe, then the paid run.

Then, after checking no other session is on the worker, run once: `P1608_DISPATCH=chain npm run test:e2e:p1608`. Proof is in the logs: the test queue logs every dispatch (sampling 1.0), and its task names carry the job id, so each of the run's job ids has a dispatch on the test queue, plus a worker `claimed` line and `/process` request with the Cloud Tasks user agent. The worker does not log `X-CloudTasks-*` headers. The test's report cannot show this.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Later TEST rooms now start paid jobs | ACCEPT | See Cost Budget; `transcribe_channel_posting` remains the off switch, and the key is capped |
| A test key could reach prod | MITIGATE | Separate accounts, least privilege; `tx-task-invoker` stays off this key |
| Another session deploys over the worker | MITIGATE | Check image and logs right before and right after the run; a change invalidates the proof |
| A P1608 run fails on a stray | ACCEPT | Report it. Never re-run until green; only one run is authorised |
| Pre-commit gets slower on these commits | ACCEPT | Only when the service is staged |
| A 2-hour-old abandoned round could appear before the run | MITIGATE | Recount undispatched and closable rounds immediately before the vault write; above zero, stop and tell the founder |

**Non-Goals**
- Do NOT touch prod, or clear the 7 stuck jobs without the founder's word.
- Do NOT fix the other services' gaps.
- Do NOT add CI, a scheduler, or a retry path for lost dispatches (P1608's observation that the tick stamps before dispatching stays a separate bug).

## Alternatives Considered

- **Reuse `tx-enqueuer` and `tx-task-invoker` on TEST:** rejected for security. A prod-valid key on the TEST VM could send tasks to the prod worker.
- **Warn instead of block when dependencies are missing:** rejected, it is the silent pass the founder ruled out, and a warning in a long hook is not read.
- **Stub numpy to run tests without installing:** rejected, the tests exercise real numeric code.
- **Docker for the tests:** rejected, it adds a daemon the hook depends on and a slower failure mode.

## Rollback Strategy

Revert the hook and `INVOKER_SA` commits. On TEST: delete the 3 vault rows, the queue, both service accounts and their keys, and the invoker binding. The chain then returns to today's state.

## Cost Budget

Per [metered-services.md](../docs/technical/metered-services.md). Worker: 2 vCPU, 2 GiB, no CPU throttling, about $0.19 per awake hour (2 x $0.000024 + 2 x $0.0000025 per second), awake about 15 minutes after each request.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| The one P1608 run | none, test-only | none | Gemini $0.25 usual, $0.48 worst (P1608 budget); worker about 25 min, $0.08 |
| Later TEST rooms, busiest measured day (2026-11-02: 45 clean and room jobs, 283 window minutes, rooms in 7 hours) | none | none | Worker at most 7 x $0.19 = $1.33 a day; Gemini, assuming 2 mics, 566 x $0.0045 = $2.55 a day |
| Cloud Tasks | none | none | Free tier covers this volume |
| Supabase | none | none | Self-hosted, no plan limit |
| New scheduler | none | none | None added |

Traffic for the paid run, with J jobs (P1608 had 2 round jobs plus a room job, so J is about 3): at most 3J = 9 Cloud Tasks deliveries, 3 attempts per task, one probe delivery, one queue log line per attempt and dispatch (about 20 lines), and each failed delivery writes one worker log line. Monthly: 10 runs cost 10 times the per-run line above. Later rooms at the busiest measured pace every day are an upper bound that the key's cap stops first.

1. **Fits the plan limit today?** Yes, the batch key is budget-capped and no vendor cap applies.
2. **Fits at 10x?** About $39 a day on a busy day would trip that cap, which is the intended stop. Verdict: fits, with a visible stop.
3. **If not:** turn off `transcribe_channel_posting` on TEST.

The busiest-day figure is an upper estimate; many of those rooms had no real audio.

## Pre-deploy Checklist

TEST only; prod needs nothing.

### Secrets to provision

- [x] `CRON_SECRET`, `GCP_ENQUEUER_SA_KEY`, `TRANSCRIBE_ROOM_BATCH_URL`, `TRANSCRIBE_ROOM_QUEUE`, `TRANSCRIBE_ROOM_INVOKER_SA` in the TEST functions file, pushed with `--secrets`
- [x] The 3 vault rows on TEST

### Post-deploy verification

- [x] `--check-secrets` no longer lists the chain's names

## Done-When

- [x] A known-failing worker test blocks a commit that touches the service: the branch's `pre-commit-checks.sh`, run on that staged test, exit 1. `[post-deploy]` repeat with a real `git commit` once on main: worktrees run main's hook, and a hook-path override is refused by the push guard.
- [x] A commit with no change to that service runs no Python; shown by its output.
- [x] Missing and stale venvs each block with the banner; exit codes pasted.
- [x] A collection error blocks too; exit code pasted.
- [x] Other services' gap reported in the handoff.
- [x] Immediately before enabling: release count restated. It is 0, or the founder was told first.
- [x] One `P1608_DISPATCH=chain` run finished; worker logs show every one of its jobs delivered by Cloud Tasks from the test queue. Run result reported whatever it was.
- [x] After the run, no instance stays billed and no scheduler targets the test worker, shown by command.
- [x] Prod unchanged: its worker revision, IAM and queue compared before and after.
- [x] Reviewed by Gemini 4 Argon and Codex; load-bearing findings verified by command.

## Build record, 2026-11-05

Founder decisions: install approved; the 7 stuck jobs stay.

**Paid run:** `P1608_DISPATCH=chain`, once, PASS, 9.5 minutes. Round 1 had 18 phrases listed under the right person, no strays. Jobs `d0131b7e`, `277caa4b` and `e3c2c0b7` each have test-queue task names and worker claims with user agent `Google-Cloud-Tasks`; the test posted none. No `/sweep` request appeared. The stuck round jobs still count 5.

**Prod:** worker revision, worker IAM hash and queue hash match the baseline. Its only log lines in the window are an idle instance shutting down at 09:15 UTC.

**Limits**
- `e3c2c0b7` was delivered three times, a minute apart (a deferring job, as P1608 describes), and each said claimed attempt 1. Normal for deferral, not separately investigated.
- TEST runs this branch's edge function. Any landing before this ships redeploys main's copy, which uses the prod invoker; the TEST key cannot act as it, so dispatch fails and jobs stay pending. Ship this first.
- The Mac secrets file is older than the server's, so `--secrets` refuses. Existing state, not changed here.
- The venv is moved after building, so its console scripts have stale paths. The hook uses `python -m pytest`, which is unaffected.
- Reviews: Argon and Codex; Argon alone on the last small fix. The Opus adversary that `/finish` suggests for gate changes was not run, since the founder named these two.

## Related

- P1608, P1611 (sources), P1596 (pipeline), P1307 (room chain), P1557 (self-hosted TEST), P1612 (TEST deploy lock)
- decisions.md 2026-11-05, 2026-10-01 (scheduler ping), 2026-06-12 (Cloud Tasks name dedup)
