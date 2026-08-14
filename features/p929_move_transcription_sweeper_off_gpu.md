---
status: backlog
type: task
rank: 71
created_date: '2026-06-11'
tags: [infrastructure, transcription, gcp, cost, pg_cron]
delivery_stage: park
pipeline_ran: [create-spec, challenge-prd, park]
---

# P929: Move transcription sweeper off the GPU service

## Parked (2026-06-11, after /challenge-prd)

Filed for later, not active. Parked because the challenge showed the cost win **requires** the hard part and the hard part carries new failure modes — for an unverified, small saving.

**Why the saving can't be had cheaply:** a reset-only pg_cron job does NOT stop the GPU waking — the scheduler still pokes `/sweep` on the L4 to do re-dispatch, and the work-check happens *inside* the instance (cold-start already paid). To actually stop the GPU waking you must move **re-dispatch** off the GPU-poke path — which is exactly the part that introduces the two failure modes below.

**Two new failure modes vs today's direct-drain sweeper (the current `/sweep` calls `claim_pending_job` inline on the GPU — neither problem exists today):**
1. **Webhook-secret accessibility in pg_cron.** Re-dispatch needs the static webhook secret to reach `enqueue-transcription`. It currently lives only as a literal inside the ad-hoc prod `tx_jobs_enqueue` trigger. pg_cron can only use it via Supabase Vault or a second embedded literal — unresolved, and load-bearing.
2. **Cloud Tasks task-name=job_id tombstone.** Re-dispatching via a Cloud Task named `job_id` (the "reuse the happy path" framing) collides with Cloud Tasks' post-completion dedup window: a job that *failed processing* (task completed, row reset to `pending`) — exactly the recovery case — gets its `CreateTask` **silently dropped** with `ALREADY_EXISTS` until the window clears. The direct-drain sweeper never hits this. Fix would require attempt-scoped task names (`job_id-attemptN`), making it a parallel dispatch path, not a reuse of the happy path.

**Cost is small and unverified:** founder-reported ~$25/mo, but the idle window was observed ~5 min, not ~15 (decisions.md 2026-06-04) → real waste likely ~$8/mo. Not worth touching the recovery safety net behind core `/live` for that.

**Verified-safe along the way (kept for the revisit):** `claim_pending_job` is `LANGUAGE sql`, no `auth.uid()` guard, granted to `service_role`; pg_cron runs as `postgres` (superuser, bypasses the grant). So the decisions.md:5697 `auth.uid()`-NULL-under-pg_cron gotcha does NOT bite the reset/claim path.

**Before un-parking, resolve:** (1) secret source — Supabase Vault vs second embedded literal; (2) task-naming scheme that survives the tombstone (attempt-scoped names) while keeping the DB claim as the real dedup.

**Revisit when:** session/transcription volume (and thus GPU cost) rises materially, OR the recurring "scheduler-pinging-Run" cost-tripwire alarm (`/day`, `/gcp-spend`) becomes a real nuisance. Cheap interim if it does: stretch the scheduler interval 2h → 24h (1-line, ~85% of the saving, zero new failure modes, and it yields a real billing number to justify the full redesign).

---

## Problem

**Situation:** Transcription recovery runs via `tx-job-janitor` (Cloud Scheduler, ~2h) → `POST /sweep` on the GPU-backed `transcribe-session` Cloud Run service. `/sweep` runs `reset_stale_jobs()` (DB-only) then drains any `pending` rows via the atomic claim (`docs/technical/infrastructure.md:63`).

**Complication:** `transcribe-session` has an NVIDIA L4 attached to every instance. Each 2h wake-up cold-starts an L4 to run a pure-SQL sweep, and Cloud Run holds the instance ~15 min before scale-to-zero. With near-zero session volume, ~every sweep does **zero GPU work** yet bills ~15 min of idle L4 — ~$25/mo of pure waste (founder-reported; mechanism confirmed, dollar figure not independently verified against the billing console).

**Question:** How do we keep full recovery coverage while stopping the recovery path from spinning up an L4 to run a database query?

## Appetite

Medium blast radius — touches the transcription recovery path (the safety net behind the core `/live` value), not the happy path. Reversible (re-create the Cloud Scheduler job; revert the migration). Low–medium decision density: one real open question (where the re-enqueue secret lives), the rest is a known pg_cron pattern already used in this repo (P703).

## Solution

Split `/sweep`'s two responsibilities by where they actually run:

1. **Stale-job reset → Supabase pg_cron, zero GCP cost.** `reset_stale_jobs()` is pure SQL. Schedule it via `cron.schedule` (same pattern as P703's `cleanup_stale_live_invites`, `supabase/migrations/20260414100002_p703_live_invites_cron.sql`), with the graceful `pg_extension` guard so local/test skips it. This resets rows stuck in `processing` >30 min back to `pending`.

2. **Re-enqueue genuinely-pending rows → only invoke GPU when work exists.** After the reset, any remaining `pending` rows (lost-trigger jobs + freshly-reset stale jobs) get re-enqueued through the **existing happy-path enqueuer** (`enqueue-transcription` edge fn → Cloud Tasks, task name = job id for free dedup). The L4 spins up only when there is real transcription work — exactly when you'd want it warm. No pending rows → no GPU, ever.

3. **Retire `tx-job-janitor`** (and the GPU `/sweep` invocation it drives) once 1+2 are verified live. The shared `attempts`/`max_attempts` counter and `claim_pending_job` gating are untouched — retry accounting is preserved because re-enqueue still flows through the same atomic claim.

Net effect: recovery coverage is identical (lost triggers, stale `processing` rows, transient-failure retries), but the recovery sweep never touches an L4.

## Risks / Non-Goals

### Risks

- **Re-enqueue needs the webhook secret → can't be a repo migration.** The re-enqueue call to `enqueue-transcription` carries the static webhook secret, exactly like the existing prod-only `tx_jobs_enqueue` trigger (ad-hoc SQL, never committed — `infrastructure.md:62`). Mitigation: provision the re-enqueue half as ad-hoc prod-only SQL reading the secret the same way the trigger does; the `reset_stale_jobs()` cron (no secret) ships as a normal repo migration. **[FOUNDER DECISION: confirm the re-enqueue secret source — reuse the trigger's secret mechanism, or a Vault/settings reference?]**
- **Double-dispatch during the recovery window.** A row could be re-enqueued by the cron while its original Cloud Tasks dispatch is still in flight. Mitigation: task name = job id dedups at Cloud Tasks; `claim_pending_job` (FOR UPDATE SKIP LOCKED) dedups at the DB. Both guards already exist — verify they hold for the cron-initiated path, not just the INSERT path.
- **pg_cron absent on test/local.** Mitigation: the P703 `pg_extension` guard pattern — skip cleanly when the extension is missing. Recovery is a prod-only concern.
- **Recovery latency unchanged-or-better.** pg_cron interval must stay ≫ the ~15-min idle window so it doesn't itself thrash. Match the current ~2h (or looser); recovery-within-hours is the existing SLA.
- **Losing the only Cloud Scheduler.** After retiring `tx-job-janitor`, there is no GCP-side heartbeat on the service. Acceptable — the service is event-driven and scale-to-zero by design; the DB is the source of truth for stuck work.

### Non-Goals

- Do NOT change the happy-path trigger chain (INSERT → `tx_jobs_enqueue` pg_net trigger → `enqueue-transcription` → Cloud Tasks → `/transcribe-async`).
- Do NOT modify `attempts`/`max_attempts` retry accounting or `claim_pending_job`.
- Do NOT alter GPU service config (maxScale, concurrency, cpu-throttling, timeout).
- Do NOT commit any secret-bearing SQL as a repo migration (public repo).
- Do NOT delete the `/sweep` HTTP endpoint code in the same change — leave it dormant so re-enabling `tx-job-janitor` is a one-command rollback until the new path is proven.

### Alternatives Considered

- **Stretch the scheduler interval (2h → 24h).** One-line change, cuts ~85% of the cost, full recovery preserved (slower). Rejected as the primary fix because it leaves the architectural defect — a DB sweep still cold-starts an L4 — and still bills idle GPU 1×/day. Kept as the documented fallback if the pg_cron path is deferred.
- **Delete `tx-job-janitor` outright, no replacement.** $0 cost but zero automated recovery — stuck jobs require manual SQL. Rejected: transcription is core `/live` value; silent stuck rows are a real regression.
- **Move `/sweep` to a separate CPU-only Cloud Run service.** Eliminates GPU idle but adds a standing GCP service + deploy surface. Rejected: pg_cron already runs in Supabase at zero marginal infra; no new external dependency.

### Rollback Strategy

1. Re-create the Cloud Scheduler job `tx-job-janitor` (~2h, OIDC as `tx-task-invoker`) pointing at the still-present `/sweep` endpoint — restores the prior behavior in one command.
2. `cron.unschedule()` the pg_cron job (or revert the migration).
3. Remove the ad-hoc re-enqueue SQL from prod.
No data migration involved — `transcription_jobs` schema is untouched, so rollback is config-only.

## Done-When

- [ ] `reset_stale_jobs()` runs on a Supabase pg_cron schedule in prod; a row artificially stuck in `processing` >30 min is observed reset to `pending` with no GPU instance started.
- [ ] A `pending` row with no live Cloud Tasks dispatch (simulated lost trigger) is re-enqueued and transcribed without manual intervention.
- [ ] With zero pending/stale rows, a full cron cycle starts **no** `transcribe-session` instance (verified via Cloud Run metrics / logs — no L4 cold start).
- [ ] `tx-job-janitor` Cloud Scheduler job is deleted (or disabled) and the GPU service is no longer invoked on a timer.
- [ ] `attempts`/`max_attempts` still increments exactly once per real attempt through the cron-initiated re-enqueue path (no double-count vs. the trigger path).
- [ ] pg_cron migration skips cleanly on a local/test instance lacking the extension (no error).
- [ ] `docs/technical/infrastructure.md` Cloud Run section updated: sweeper is now pg_cron + conditional re-enqueue; `tx-job-janitor` removed from the scheduler description.
- [ ] Billing console (or Cloud Run GPU-second metric) shows the recurring idle-L4 wake-ups gone after ~one billing cycle.
