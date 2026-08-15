---
status: backlog
type: task
rank: 10
created_date: '2026-06-02'
tags: [observability, transcription, cost, p858]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P874: Transcription Pipeline Observability

> **DOWNGRADED 2026-08-14.** Its own Solution section reports job volume at *"~0 jobs/30d"* and warns *"monitoring follows the data, not the reverse."* Zero events have run, so building it now installs an empty gauge. Unpark when real job volume exists.

> Follow-on to [P858: Event-Driven Transcription](./done/2026-04-22/p858_event_driven_transcription.md). Deploy + cost-cap validation lives in P858's `## Pre-deploy Checklist` + `features/uat/p858.md` — this spec is the **operational visibility layer**, not the deploy.

> **Status: BACKLOG. Tier 0 already shipped** — a job-health block (status counts + stale/lost detection) was added to the `/day` skill (`.claude/commands/slava/day.md`, `=== TRANSCRIPTION HEALTH ===`), which is the minimal monitoring that follows the data without new runtime. This spec's remaining deliverable — the `transcription_health()` **SQL view** (Tier A: p95 timing, failure-category aggregation) and any dashboard (Tier B/C) — is **deferred until the `/day` counts aren't enough** (i.e., once P858 is producing real job volume). Don't build the view ahead of that need. The `attempts` distribution is added to the `/day` block once P858's migration is on prod.

## Problem

**Situation:** P858 replaces the always-warm transcription poll with an event-driven trigger (GPU wakes per job, scales to zero idle). It is implemented and about to be deployed.

**Complication:** Cost-leak *detection* already exists — the `/day` cost tripwire (`day.md:110-132`) and `/gcp-spend` flag warm-GPU / scheduler-pinging-Run patterns every session (added after the ~€659/mo leak), and the €30/day billing alert is part of the P858 deploy. What we still lack is consolidated **job-level health**: how many jobs are queued / processing / done / failed, why they failed, how long they take, and retry pressure — plus the *visual* scale-to-zero view (the tripwire detects the leak pattern but doesn't show the instance-count curve). The genuine gap is job health + a glanceable instance graph, **not** cost detection.

**Question:** What's the minimum observability that (a) lets us validate P858 works and stays cost-capped, and (b) serves as the ongoing operational view — without building a system that itself needs maintaining (or that could itself leak cost)?

## Appetite

Low blast radius — read-only; touches no pipeline or P858 service code. Fully reversible (drop a view / delete a dashboard config). Low-to-medium decision density: the one real decision is *which tier* (A/B/C below), and the recommendation is already A-now / C-deferred.

## Solution

**Key finding: almost every signal is already emitted — the gap is assembly, not capture.**

| Signal | Source (already exists) |
|---|---|
| Queue depth (pending) / in-flight (processing) | `transcription_jobs` count by `status` |
| Success / failure + the failing step | `transcription_jobs.status` + `error_message` (pipeline writes the live step into it) |
| Time-to-finish | `completed_at − created_at` |
| Retry pressure | `transcription_jobs.attempts` |
| Stale / lost jobs | `processing` rows with old `updated_at`; `pending` older than ~2 min |
| **GPU instance count / scale-to-zero** | Cloud Run metric `container/instance_count` (the cost driver) |
| Daily GPU spend | GCP Billing + the €30/day budget |
| Queue-level fires/retries | Cloud Tasks queue metrics |
| Exceptions | Sentry (prod) |
| Daily warm-GPU/scheduler leak | `/day` cost tripwire (already exists) |

**Tiered — do A now; defer C:**

- **Tier A (this spec's deliverable):** a read-only `transcription_health()` SQL view/RPC over `transcription_jobs` — queue depth, in-flight count, completed/failed counts, failure breakdown, avg + p95 time-to-finish, attempts distribution, stale-job count. No new runtime. Doubles as the **P858 UAT lens** (watch the test through it) and the ongoing snapshot. **Ops/`service_role` only:** EXECUTE granted to `service_role` (the context `/day` and developer curl/Supabase-dashboard use), NEVER to `authenticated` — it aggregates across ALL sessions, so exposing it to app users would bypass `transcription_jobs`' participant-only RLS (`20260313120000_p495_transcription_tables.sql:85-94`).

> **Prerequisite (sequencing):** the view references `transcription_jobs.attempts`, which exists only in P858's migration. **P858's migrations must be applied to the target DB before this view is created** (already applied to test; prod is gated on P858 ship). Build P874 after P858's schema lands — not before.
- **Tier B (later, when glancing daily):** a config dashboard (Looker Studio or GCP Cloud Monitoring) wired to the existing Cloud Run / billing / Cloud Tasks metrics + the tier-A view. Configuration, not a new app — no standing process to maintain.
- **Tier C (deferred — premature):** a custom in-app live dashboard. A new page + data path + auth + upkeep. Justify only when job volume makes the console/SQL too slow to scan. At current volume (~0 jobs/30d) this is a standing maintenance cost with no payoff.

**Sequencing decision (resolved):** deploy + validate P858 *first*; write the tier-A view as the UAT instrument; defer any dashboard (B/C) until real job data shows what's actually worth watching. Monitoring follows the data, not the reverse.

## Risks / Non-Goals

### Risks
- **Designing a dashboard before any data → guessing at what matters.** Mitigation: tier A first; B/C only after the deploy produces real numbers.
- **A monitoring component that itself wakes the GPU or runs always-on → reintroduces a cost leak.** Mitigation: tier A is a read-only DB query; GPU/cost view uses built-in Cloud Run/billing metrics. No path that invokes `transcribe-session`.
- **The view drifts from the real schema if `transcription_jobs` changes.** Mitigation: it reads only stable columns (`status`, `created_at`, `completed_at`, `updated_at`, `attempts`); a migration test guards the columns (P858 already adds one).

### Non-Goals
- Do NOT modify the transcription pipeline or any P858 service code (read-only observability only).
- Do NOT build the tier-C custom in-app dashboard now — deferred until volume justifies it.
- Do NOT add a new always-on service or background poller (no new runtime that could itself leak cost).
- Do NOT duplicate Cloud Run / billing metrics into a custom store — read them where GCP already holds them.
- Do NOT duplicate P858's deploy/cost-cap validation here — that's owned by P858's Pre-deploy Checklist + UAT.
- Do NOT grant the health view/RPC to the `authenticated` role — it is a `service_role`/ops tool; surfacing cross-session aggregates to app users bypasses participant RLS. (This is also why Tier C, an in-app dashboard, would need its own per-session auth design — another reason it's deferred.)
- Do NOT re-build cost-leak detection — `/day` + `/gcp-spend` already own it; P874 adds job-health, not a second cost monitor.

## Done-When

- [ ] **Prerequisite:** P858's migrations (`attempts`/`max_attempts`) are applied to the target DB *before* the view is created (the view references `attempts`).
- [ ] A read-only `transcription_health()` view/RPC returns: pending count, processing count, completed/failed counts, failure breakdown by category, avg + p95 time-to-finish, attempts distribution, and stale-job count. (p95 may be NULL/noisy at low N — accepted for an ops tool.)
- [ ] It is read-only (no writes, no GPU invocation) and runs against test or prod.
- [ ] EXECUTE granted to `service_role` only; verified an `authenticated` user cannot call it. Surfaced during P858 UAT (via `/day` / service-role curl) as the test lens.
- [ ] Confirmed the existing `/day` cost tripwire + `/gcp-spend` + the Cloud Run `instance_count` graph are sufficient for scale-to-zero + daily-spend visibility — **no new cost-monitoring build**; only the instance-count graph URL is bookmarked.
- [ ] A recorded decision on whether to proceed to Tier B (config dashboard), made *after* P858 produces real job data — or an explicit "deferred, revisit at N jobs/week" (founder sets N at revisit time).

## Alternatives Considered

- **Tier A — read-only `transcription_health()` view (chosen for now).** No new runtime; reuses the existing job ledger; serves UAT + ongoing. Trade-off: text/query output, not a visual at-a-glance — acceptable at current volume.
- **Tier B — config dashboard (deferred until daily-glance need).** Visual, no code to maintain (configuration). Trade-off: a second place to keep wired; only pays off with regular viewing.
- **Tier C — custom in-app dashboard (rejected for now).** Richest UX. Rejected: a new page + data path + auth + standing upkeep for a system doing a handful of jobs/week — runtime complexity with no current payoff.

## Rollback Strategy

Tier A is a single DB object — `DROP VIEW`/`DROP FUNCTION transcription_health` (one migration) removes it with no dependents (nothing writes through it). Tier B/C, if ever built, are removed by deleting the dashboard config / reverting the feature branch.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN-1] Hidden dependency: the view references `transcription_jobs.attempts`, which exists only in P858's unmerged migration — not acknowledged. | Added explicit **prerequisite**: P858 migrations applied to the target DB before the view is created (Solution + Done-When). | Factual sequencing; prevents a column-not-found failure if P874 is built before P858's schema lands. |
| 2 | /challenge-prd | [WARN-2] "callable from `/day` and the app" → RLS exposure: a cross-session aggregate granted to `authenticated` bypasses participant-only RLS. | Scoped to **`service_role`/ops only**; EXECUTE never granted to `authenticated`; added a Non-Goal + a Done-When verification. | The view aggregates across all sessions — an ops tool, not an app surface. Matches the (already-rejected) Tier-C boundary. |
| 3 | /challenge-prd | [WARN-3] Cost-framing overstated the gap — `/day` + `/gcp-spend` already detect GPU cost leaks (`day.md:110-132`). | Reframed Problem + Done-When item 4 as **"confirm existing tripwire coverage, no new build"**; genuine gap narrowed to job-level health + a visual instance graph. | Honesty about scope: the SQL view (job health) is the real new work; cost detection already exists. |
| 4 | /challenge-prd | [NOTE] p95 noisy at ~0 jobs/30d; Tier-B "revisit at N jobs/week" trigger is vague. | Accepted: p95 returns NULL/sparse at low N (ops tool, founder has context); Tier-B trigger left as an explicit deferred founder decision. | Acceptable for an internal tool; defining N is a judgment call best made when real data exists. |
