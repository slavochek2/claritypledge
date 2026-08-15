---
status: all-done
type: change-request
rank: 0.001
changes: p495
tags:
  - redesign
  - p495
  - transcription
  - cost
  - infrastructure
created_date: 2026-05-31T00:00:00.000Z
feature_type: backend
pipeline_ran: [change-request, architect, generate-tests, spec-review, dev]
uat_file: features/uat/p858.md
test_files:
  - services/transcribe/tests/test_p858_claim.py
  - services/transcribe/tests/test_p858_retry.py
  - services/transcribe/tests/test_p858_sweep.py
  - services/transcribe/tests/test_p858_validation.py
  - services/transcribe/tests/test_p858_async_endpoint.py
  - e2e/integration/p858-retry-accounting-migration.spec.ts
completed_at: 2026-06-04
---

# P858: Event-Driven Transcription (GPU wakes per job, not per poll)

> **Redesign of:** [P495: Live Session Transcription](../24_mar_26/p495_live_session_transcription.md)
> **What was wrong:** P495 triggers transcription via a Cloud Scheduler job that polls `POST /poll` every 5 minutes. Because the GPU service runs with `cpu-throttling=false`, each poll resets the idle-shutdown timer before the GPU can scale to zero — so a 1× NVIDIA L4 stays warm 24/7. Verified cost: **~€659/month gross** (credit-masked to ~€12 net) for a service that processed **0 jobs in the last 30 days**. The poll keeps an expensive GPU alive to ask an empty queue "anything yet?" — the exact inversion of pay-per-use. The scale-to-zero cost model P495 *claimed* ("no cost when idle") was never realized because the scheduler defeated it.

## Operating Mode

> This spec is an **incremental correction** to P495, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> The transcription *processing* pipeline (Whisper, diarization, speaker mapping, storage, RLS, UI)
> is settled and out of scope. **Only the trigger mechanism changes.**
> Settled decisions from P495 are not up for re-examination.

## Problem Statement

P495's transcription pipeline works correctly — when it runs, it produces good transcripts. The defect is purely in **how processing is triggered**.

The shipped trigger is a Cloud Scheduler job (`transcribe-poll`, `*/5 * * * *`) hitting `POST /poll`. Combined with `cpu-throttling=false` on a GPU Cloud Run service, this holds the L4 GPU warm continuously. The GPU bills while *allocated*, not while *working* — so an idle GPU that processes nothing still costs ~€0.80/hr ≈ €659/mo gross.

This is currently masked by GCP startup credits (net ~€12), but: (a) it silently burns the €25k credit at ~€660/mo for zero value, and (b) it becomes a real out-of-pocket bill the moment credits expire. The scheduler is **currently paused** (verified safe: 0 jobs in 30 days) as a stopgap — this spec is the permanent fix.

P495's original problem statement ("audio exists but is never transcribed") remains fully valid. This redesign does not touch *why* transcription exists, only *when the GPU wakes*.

## Jobs To Be Done

- **Preserved from P495:** All user-facing jobs unchanged — transcript ready by next morning for coaching prep; read what each person said; reliable speaker attribution for mirror agents; participants review/copy transcripts; failed transcriptions retryable.
- **Corrected:** "Transcription starts automatically after upload" — P495 satisfied this via a 5-min poll (≤5 min latency + permanent GPU cost). Redesign satisfies it via an insert-triggered wake (one ~30s cold-start, ~€0 idle cost).
- **New:** "The system pays only for actual transcription work" — idle cost ≈ €0; cost scales with jobs, not wall-clock time.

## Current State

P495 shipped (`services/transcribe/main.py`, `docs/technical/infrastructure.md`):

- Client `stopAndUploadRecording()` inserts a row into `transcription_jobs (status='pending')` after audio upload (`src/app/data/api.ts` → `createTranscriptionJob()` → `create_transcription_job` RPC).
- **Cloud Scheduler `transcribe-poll`** fires `POST /poll` every 5 minutes.
- `POST /poll` (`main.py:92-140`) loops up to `MAX_JOBS_PER_POLL=10`, draining `get_pending_job()` and calling `transcribe_session()` per job. Returns immediately if queue empty.
- GPU Cloud Run `transcribe-session` (us-east4, L4, **`maxScale:5`**, `min-instances:0`, `cpu-throttling:false`). Verified Cloud Run GPU quota for us-east4 = **5** (no-zonal-redundancy). NOTE: `docs/technical/infrastructure.md:59-61` is **stale** — it says `maxScale:1` / `NVIDIA_L4_GPUS=1`; reality is 5. Fix the doc as part of this work.

**Before (current):**
```
                        every 5 min, 24/7
  Cloud Scheduler ───────────────────────────▶  POST /poll
  (transcribe-poll)                              │
                                                 ▼
                                    GPU stays WARM (cpu-throttle=false
                                    + 5-min poll < idle timeout)
                                                 │
                              ┌──────────────────┴───────────────────┐
                              │ queue empty (30 days)  │ job present  │
                              ▼                        ▼              │
                       return 200, do nothing    process job(s)      │
                              │                                       │
                       GPU NEVER scales to zero  →  ~€659/mo gross    │
```

## Root Cause

GPU Cloud Run bills for **allocated** GPU-time, not work done. Cloud Run scales an instance to zero only after an idle period (~15 min) with no requests. The scheduler sends a request every **5 minutes** — shorter than the idle window — so the shutdown timer never elapses. With `cpu-throttling=false`, the GPU is allocated for the instance's whole lifetime, not just during request handling. Net effect: a free heartbeat (`POST /poll` 200 OK) holds a billable GPU on permanently.

`min-instances:0` was *supposed* to deliver scale-to-zero, but the poll structurally prevents it. The cost is independent of job volume — proven by ~€659/mo at 0 jobs.

Code/config references:
- `services/transcribe/main.py:92-140` — `/poll` is the scheduler entry; does real GPU work, returns fast when empty.
- `docs/technical/infrastructure.md:59-61` — `min-instances:0`, `maxScale:1`, GPU quota `NVIDIA_L4_GPUS=1` (concurrent triggers → 429).
- Cloud Scheduler `transcribe-poll` (us-central1, `*/5 * * * *`) — the keep-warm driver (created via one-off `gcloud`, not in repo; **currently PAUSED**).

## Redesign

Replace the constant poll with an **event-driven trigger**: a `transcription_jobs` insert wakes the GPU once, it processes the job(s), then scales to zero. No standing scheduler. The GPU is allocated only while a job is actually being transcribed.

**After (redesign):**
```
  Client uploads audio
        │
        ▼
  INSERT transcription_jobs (status='pending')   ◀── unchanged (P495 Decision 1)
        │
        ▼
  [TRIGGER BRIDGE — see Open Design Decision]
        │   (Supabase insert → GCP invocation; returns 202 immediately, fire-and-forget)
        ▼
  POST /transcribe  ──▶  GPU spins 0→N (~30s cold start), up to 5 concurrent
        │                process job in background → write transcript
        ▼                │
  GPU scales back to zero  ◀─────────┘  (after ~15 min idle)
        │
        ▼
  idle cost ≈ €0   (cost only while a job runs)
```

Behavioral contract:
- A pending job is **claimed within ~1 minute** of insert (not up to 5 min). Trigger latency is seconds; the ~1 min allows for cold start.
- **Fire-and-forget:** the trigger endpoint claims the job (flips `pending`→`processing`), returns **202 immediately**, and runs transcription in the background. The HTTP response must NOT wait for the 5–15 min transcription to finish — otherwise the trigger times out and retries, causing duplicate processing. *(This closes adversarial BLOCK #1.)*
- **Concurrency: up to 5 GPUs** (verified Cloud Run quota for us-east4 = 5 L4, no-zonal-redundancy). Up to 5 sessions transcribe in parallel; only a 6th+ simultaneous job queues. No serialization-to-1 needed.
- ~30s cold-start per wake is acceptable.
- **Latency target:** transcript typically ready within ~10 min for normal sessions; full-hour recordings may take longer because processing time scales with audio length (~5–15 min GPU work for 60 min audio). The trigger guarantees *start* within ~1 min; total time = start + cold-start + processing. `[FOUNDER DECISION: ~10 min target, not a hard cap for long sessions]`
- Idle cost ≈ €0.

### Open Design Decision — the trigger bridge `[/architect]`

Supabase (Postgres) is **not** GCP-native, so the insert must reach a GCP invocation. With 5-GPU headroom, serialization is NOT a hard requirement (Cloud Run handles up to 5 concurrent natively; queueing only matters beyond 5). Candidate bridges, to be resolved in `/architect`:

| Option | Path | Notes |
|---|---|---|
| **A. Supabase DB Webhook → thin dispatcher → `/transcribe`** | `transcription_jobs` insert fires a Supabase webhook (pg_net) → HTTPS → dispatcher returns 202 fast, runs job in background | Fewest components. **Must be fire-and-forget** — pg_net times out in seconds; dispatcher cannot block on the 15-min job |
| **B. Supabase Webhook → Cloud Tasks → `/transcribe`** | Insert → webhook → Cloud Task → invoke | Cloud Tasks gives free retry + backoff + natural concurrency capping (set to ≤5). Recommended starting hypothesis — but only if target returns fast (fire-and-forget); else Cloud Tasks' dispatch deadline marks the long job failed and retries it |
| **C. Direct from `clarity-live-page.tsx`** | Client calls a trigger endpoint right after the insert | No webhook infra, but reintroduces P495's "lost if browser closes early" fragility. The sweeper (below) is the backstop for this |

**Reliability backstop — DECIDED: auto-sweeper.** `[FOUNDER DECISION]` A low-frequency sweeper (e.g. every 1–2h) drains any `pending` job a lost trigger left behind. It is **not** a work-poll (the trigger does that, instantly) — it's a rare janitor. Because its interval (1–2h) ≫ the GPU idle-shutdown window (~15 min), it does **not** keep the GPU warm, so it does not recreate the cost bug. **The sweeper must also run the stale-job reset** (see below) — this is mandatory, not optional.

### cpu-throttling — RESOLVED, do not flip it `[closes adversarial BLOCK #2b]`

These two fixes collide on one setting, so the spec resolves it explicitly rather than leaving /architect a coin-flip:
- Fire-and-forget (background processing after the 202) **requires `cpu-throttling=false`** — Cloud Run freezes CPU outside an active request, so a background task on a throttled instance would claim the job, return 202, then **stall forever** (and only the 30-min sweeper reset would notice).
- The €659 cost was **NOT** caused by `cpu-throttling=false` itself — it was caused by the **5-min poll holding a request open** so the instance never reached idle-shutdown.

**Decision: keep `cpu-throttling=false`. Get cost savings from scale-to-zero after idle, NOT from throttling.** Once the poll is gone, `cpu-throttling=false` + `min-instances=0` genuinely scales to zero (no requests → idle timeout elapses → instance killed → €0). Verify via billing, not assumption. Do **not** "turn throttling on to save money" — that breaks background processing.

**`[/architect]` In-flight keepalive vs idle-shutdown.** Fire-and-forget + scale-to-zero raises one question /architect must pin: what prevents idle-shutdown from killing an instance while a background job is still running (especially a long one)? Options: keep the HTTP request open for the job duration (Cloud Run request timeout up to 60 min — but then it's not truly fire-and-forget on the *processing* side, only on the *trigger* side), or signal liveness so Cloud Run doesn't reclaim a working instance. Specify the keepalive mechanism; do not assume the instance survives.

### Retry accounting — single source of truth `[closes adversarial double-retry]`

Retry-max-3 must be counted on the **job row** (an `attempts` / retry counter), not per-trigger. Otherwise: app retries 3× → Cloud Tasks retries on 429/5xx → sweeper re-dispatches → 6+ real attempts (cost + duplicate work). All retry paths (trigger, Cloud Tasks backoff, sweeper) MUST read and increment the same job-row counter and stop at 3. Cloud Tasks retry and the sweeper must respect the counter, never start a fresh count.

### Stale-job recovery `[/architect — closes adversarial BLOCK #3]`

The P495 "reset jobs stuck in `processing` >30 min back to `pending`" logic lives **inside** `get_pending_job()` (`storage.py`), which only runs on a `/poll`. Deleting the poll removes this recovery. Given the **27% historical failure rate**, a job that crashes mid-`processing` (instance killed before the `except` writes `failed`) would otherwise stay stuck forever. **Fix:** extract stale-reset out of `get_pending_job()` so the sweeper runs it every cycle. Without this, the queue can silently jam.

### 27% failure-rate investigation `[FOLDED IN — FOUNDER DECISION]`

15 of 56 historical jobs failed (27%). This rebuild touches the processing path, so we investigate the cause as part of the work (not a separate task). Deliverable: read the `failed` jobs' error messages from `transcription_jobs`, categorize the failure modes (OOM? timeout? audio format? diarization crash? HF token?), and either fix the top cause or document why it's deferred. The auto-retry (max 3) mitigates transient failures but must not mask a systematic one.

## Predecessor Sections Superseded

| Section | P495 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Deployment / Cloud Scheduler | "Cloud Scheduler (polls for pending jobs every 5 min): `--schedule '*/5 * * * *' --uri '.../poll'`" | **Superseded** | Event-driven trigger bridge (this spec, Redesign) |
| Cost model | "Scale-to-zero means no cost when idle." | **Superseded (was hollow, now real)** | Redesign delivers actual scale-to-zero; idle ≈ €0 |
| `main.py:92-140` `/poll` as scheduler entry | "Cloud Scheduler entry point: process up to MAX_JOBS_PER_POLL... Amortizes GPU cold start across the batch" | **Partially superseded** | `/poll` may be retained for sweeper/manual use; no longer the 5-min-driven primary path. Batch-amortization rationale drops (per-job invocation instead) |
| IAM | "Cloud Scheduler service account needs `roles/run.invoker`" | **Superseded** | Removed at cutover (no standing scheduler); trigger bridge gets its own invoker identity |
| Processing cost estimate | "~$0.11-0.17 per session-hour (L4 at $0.67/hr)" | **Still valid** | Per-job processing cost unchanged; only idle cost eliminated |

All P495 **acceptance criteria** remain valid — none were about the poll mechanism; all concern transcript output, visibility, security, and the ≤15-min processing bound (which the ~30s cold-start fits within).

Also stale (fix in this work): `docs/technical/infrastructure.md:59-61` records `maxScale:1` / `NVIDIA_L4_GPUS=1`. Verified reality: `maxScale:5`, Cloud Run GPU quota us-east4 = 5. The earlier draft of THIS spec also wrongly assumed quota=1 and designed serialization-to-1 — corrected to 5-concurrent headroom.

## Requirements

1. A `transcription_jobs` insert causes the job to be claimed and processed without any standing 5-min scheduler keeping the GPU warm.
2. **Fire-and-forget trigger:** the trigger returns 202 immediately and processes in the background; the HTTP response never waits for transcription to complete (prevents trigger-timeout retry → duplicate processing).
3. Idle GPU cost ≈ €0 via **scale-to-zero after idle** — keep `cpu-throttling=false` (required for background processing); do NOT flip it on. Cost comes from the instance reaching idle-shutdown once the poll is gone, not from throttling. Verify scale-to-zero via billing. (See "cpu-throttling — RESOLVED".)
4. Concurrency up to **5** (verified quota) — up to 5 sessions transcribe in parallel; a 6th+ is held by Cloud Run `maxScale=5` (429 → Cloud Tasks/trigger retries), not silently lost.
5. Auto-retry transient failures **max 3 times total**, counted on the **job row** (not per-trigger). All retry paths (trigger, Cloud Tasks backoff, sweeper) read/increment the same counter and stop at 3, then mark `failed`. No path starts a fresh count. (See "Retry accounting".)
6. A lost/missed trigger is recovered by the **auto-sweeper** (1–2h interval ≫ 15-min idle window, so no warm-GPU cost). Sweeper also runs the **stale-`processing` reset** (extracted out of `get_pending_job()`).
7. Investigate the **27% historical failure rate**: categorize `failed` job errors, fix the top cause or document deferral.
8. The `transcribe-poll` Cloud Scheduler job is **disabled and retained as rollback** until the new path is verified in prod, THEN deleted. (Resolves the earlier delete-vs-keep contradiction; preserves a rollback path.)
9. Stays self-hosted on GCP GPU (credit-eligible). No third-party transcription API (not credit-eligible — explicit non-goal).
10. Cold-start ≤ ~60s; transcript typically ready ~10 min for normal sessions (not a hard cap for full-hour recordings — processing scales with audio length).

## What Stays the Same

- The entire `services/transcribe/` processing pipeline: Whisper `large-v3-turbo`, pyannote VAD/diarization, speaker mapping, merger, round splitter, storage. **No processing-logic changes.**
- DB schema: `session_transcripts`, `transcription_jobs`, `user_voice_profiles`, RLS, private-session `BEFORE INSERT` block, retry RPC.
- All frontend: `my-sessions-page.tsx`, `api.ts`, `sessions-service.ts`, `clarity-live-page.tsx`, transcript UI.
- Client-side `createTranscriptionJob()` insert (P495 Decision 1) — preserved; the insert now also *is* the trigger event.
- GPU type/region (L4, us-east4, quota=5), Secret Manager secrets, `storage.objectViewer` IAM.
- No client-side real-time status polling (P495 Decision 7) — unchanged.

## Surfaces in Scope

**In scope:**
- Trigger bridge (NEW infra — option A/B/C from Open Design Decision): Supabase webhook config, optional Cloud Tasks queue, optional thin dispatcher.
- `services/transcribe/main.py` — possibly a new/adjusted endpoint to accept event-driven single-job invocation cleanly (existing `POST /transcribe` already takes `session_code`+`session_id`+`job_id`; may be reusable as-is).
- Cloud Run `transcribe-session` config — confirm `min-instances:0`; keep `cpu-throttling=false` (decided — required for background processing); cost comes from scale-to-zero, not throttling.
- Cloud Scheduler — `transcribe-poll` **disabled, retained as rollback**, deleted only after prod verification. NEW sweeper job (1–2h, distinct name) added.
- `services/transcribe/storage.py` — extract stale-`processing` reset out of `get_pending_job()` so the sweeper can run it.
- `services/transcribe/main.py` — retry-max-3 logic; fire-and-forget trigger endpoint.
- `docs/technical/infrastructure.md` — fix stale `maxScale:1`/`quota=1` → `5`; document the event-driven trigger + sweeper.
- `.claude/commands/slava/day.md` — allowlist the new sweeper name so the cost tripwire doesn't false-positive on it (distinguish "1–2h sweeper, safe" from "5-min poll, leak").
- IAM — trigger bridge invoker identity; remove scheduler invoker at final cutover.
- Failure-rate investigation: query + categorize `failed` jobs.

**Out of scope:**
- Transcription quality, model choice, diarization accuracy, speaker mapping (EXCEPT where the 27% failure investigation points at one of these as the root cause — then fixing that specific cause is in scope).
- DB schema and RLS.
- All frontend / transcript display.
- The `/live` recording and upload flow itself (the client INSERT stays; whether the client also directly triggers (Option C) is the only frontend-adjacent decision).

## Acceptance Criteria

Maps to the four things "we want" (self-triggers / ~€0 idle / reliable / on GCP):

**Self-triggers**
- [ ] Inserting a `transcription_jobs` row causes the job to be claimed within ~1 min, with no 5-min scheduler running.
- [ ] Trigger returns 202 immediately (verified: trigger response time < a few seconds even though processing takes minutes — i.e. fire-and-forget confirmed, no trigger-timeout retry).
- [ ] A real `/live` session end-to-end produces a transcript via the new path (transcript row created).

**~€0 idle**
- [ ] With zero pending jobs, Cloud Run shows **0 instances** and billing shows ≈€0 GPU over a 24h idle window.
- [ ] `/day` cost tripwire shows no warm-GPU leak; the new sweeper is allowlisted (not flagged as `SCHEDULER_PINGING_RUN`).
- [ ] GPU scales back to zero after a job completes (verified: 0 instances within ~15 min of finishing).

**Cost capped (if something breaks)**
- [ ] **Container concurrency = 1**: 5 simultaneous jobs spin up 5 distinct instances (one L4 each), NOT 5 jobs packed onto one GPU — confirms demand-driven 0→5 autoscale. (Hard ceiling: quota = 5 + `maxScale=5`.)
- [ ] **Billing budget alert at €30/day** on the GPU project fires a notification (test with a temporarily low threshold). Backstop independent of every app-level cap; pages well before the worst-case 5 × €0.80/hr ≈ €96/day ceiling.

**Latency (testable fixture)**
- [ ] A fixed **10-minute audio fixture** produces a transcript within a defined bound (e.g. ≤8 min wall-clock from insert, including cold start) — the falsifiable latency check. ("~10 min typical" prose is not a pass/fail; this fixture is.)

**Reliable**
- [ ] A forced transient failure auto-retries up to 3× **total** (counter on the job row; verify Cloud Tasks retry + sweeper do NOT add a 4th+), then marks `failed`.
- [ ] cpu-throttling stays `false` AND background processing completes after the 202 (verify a job inserted, 202 returned in seconds, transcript still written minutes later — i.e. background task did not freeze).
- [ ] A simulated lost trigger (insert with no trigger fired) is picked up by the sweeper within its interval.
- [ ] A job artificially stuck in `processing` >30 min is reset by the sweeper (stale-reset works without the old poll).
- [ ] Up to 5 concurrent jobs all complete; a 6th queues and completes after (no silent loss).
- [ ] 27% failure investigation: `failed` jobs categorized; top cause fixed or deferral documented with reason.

**On GCP / safety**
- [ ] Billing shows transcription drawing on credits (GCP-native, not third-party).
- [ ] `transcribe-poll` retained-disabled as rollback until verified, then deleted (confirm via `gcloud scheduler jobs list`).
- [ ] `docs/technical/infrastructure.md` corrected (`maxScale:5`, quota=5, event-driven documented).
- [ ] All existing P495 transcription tests still pass; out-of-scope surfaces (schema, frontend, pipeline logic) unchanged.

## Technical Architecture

### Technical Analysis

**Current code state (verified this session against the worktree, not from memory):**

- **`services/transcribe/main.py`** — FastAPI app. Three endpoints:
  - `POST /transcribe` (lines 69-89) is **synchronous**: it `await`s `transcribe_session(session_code, session_id, job_id)` and returns the full `TranscribeResponse` (`transcript_id`, `segment_count`, `language`, `processing_time_ms`, `speakers`). On exception it raises `HTTPException(500)`. *This is the request the event trigger will land on, and it currently blocks for the entire multi-minute job.*
  - `POST /poll` (lines 92-140) is the Cloud Scheduler entry: loops `get_pending_job()` up to `MAX_JOBS_PER_POLL=10`, calling `transcribe_session` per job. This is the path being decommissioned.
  - `GET /health` (lines 63-66).
  - No inbound auth token of the service's own — `/poll` is reached because the scheduler's service account holds `roles/run.invoker` (OIDC); the service is `--no-allow-unauthenticated`.
- **`services/transcribe/pipeline.py`** — `transcribe_session()` flips the job to `processing` via `update_job_status(job_id, "processing")` at line 70 — **inside processing, not atomically at claim time.** Writes progress strings into `error_message` per step (`_progress()`, line 55-65); sets `completed` (clears `error_message`) at line 174 or `failed` + `error_message` at line 194. No `attempts` accounting anywhere.
- **`services/transcribe/storage.py`**:
  - `get_pending_job()` (lines 164-201) does TWO things non-atomically: (1) the stale-reset — SELECTs `processing` rows with `updated_at < now()-30min` and UPDATEs them back to `pending` (lines 172-187, `STALE_JOB_MINUTES=30`); (2) SELECTs the oldest `status='pending'` row `ORDER BY created_at LIMIT 1` (lines 190-197). **No claim guard** — the SELECT does not flip status, so two callers can read the same row.
  - `update_job_status()` (lines 136-158) writes `status` + `error_message` (+ `completed_at` when `completed`). Uses the Supabase **service-role** client (bypasses RLS).
- **`transcription_jobs` schema** (`supabase/migrations/20260313120000_p495_transcription_tables.sql`, lines 31-44): columns are EXACTLY `id, session_code, session_id, status CHECK(pending|processing|completed|failed), error_message, created_at, completed_at, updated_at`. Index `idx_transcription_jobs_session_id`. **No `attempts`/`retry_count`/`max_attempts` column.** No `updated_at` auto-update trigger exists in the migration — the stale-reset relies on `update_job_status` writing `updated_at`… **and it does NOT** (`update_job_status` writes `status`, `error_message`, optionally `completed_at`, but never `updated_at`). The stale-reset's `lt("updated_at", cutoff)` therefore compares against the row's INSERT-time `updated_at` default. *Flagged as a latent bug to confirm in the build (Decision 8).*
- **`retry_transcription(p_session_id)` RPC** (same migration, lines 149-182; SECURITY DEFINER, participant-only, 5-min rate-limited): **INSERTs a NEW `pending` job row.** This is the MANUAL/user-initiated retry. Distinct from the spec's AUTO transient-failure retry.
- **`create_transcription_job(p_session_id)` RPC** (`supabase/migrations/20260313140327_p495_create_transcription_job_rpc.sql`, SECURITY DEFINER, participant-only, private-session-blocked): the CLIENT insert path. **Contains a hard idempotency guard** (lines 26-31): `IF EXISTS (SELECT 1 FROM transcription_jobs WHERE session_id = p_session_id) RETURN;` — it INSERTs at most ONE row per session, ever. Consequence: the client cannot create a second job for a session; only `retry_transcription` can. This is decisive for Decision 5 — *counting rows-per-session as the retry count is broken because the only way a second auto-row could appear is blocked, and the manual-retry rows would conflate with any auto count.*
- **Client call site:** `src/app/data/api.ts:3934` `createTranscriptionJob()` → `.rpc('create_transcription_job', { p_session_id: sessionId })`; called from `src/app/pages/clarity-live-page.tsx:3446` after `stopAndUploadRecording()` resolves (line 3442 comment: "Trigger transcription job — must be outside stopAndUploadRecording"), guarded for non-private sessions.
- **`services/transcribe/config.py`** env vars: `GCS_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HF_TOKEN, WHISPER_MODEL, GPU_ENABLED, PORT` (+ mock/local-dev flags). No inbound auth secret.
- **`docs/technical/infrastructure.md`** lines 54-66: STALE — line 59 says `maxScale: 1`, line 61 says `NVIDIA_L4_GPUS = 1` / "Serialize triggers or raise quota", line 60 says `1800s` timeout. Verified reality per spec: `maxScale: 5`, us-east4 L4 quota = 5. Line 65 documents that `/transcribe` without `job_id` bypasses job tracking — **only `/poll` creates the pending→processing accounting today.**
- **`.claude/commands/slava/day.md`** lines 125-129: the cost tripwire's scheduler check filters job names by regex `run\.app|cloud-?run|poll|warm|transcribe` and flags any match as `SCHEDULER_PINGING_RUN`. **A sweeper named with any of those tokens (e.g. `transcribe-sweeper`) WILL false-positive.** The allowlist mechanism is: name the sweeper so it does NOT match, OR add an explicit exclusion to the filter.

**Reuse inventory (every existing component touching this area):**

| Component | Path | Reuse decision in P858 |
|---|---|---|
| `POST /transcribe` (sync, takes `session_code`+`session_id`+`job_id`) | `services/transcribe/main.py:69-89` | **Reuse as the processing primitive**, but it must NOT be the trigger landing endpoint while synchronous — wrapped by a new claim+async endpoint (Decision 2/3). |
| `POST /poll` (scheduler entry, batch drain) | `services/transcribe/main.py:92-140` | **Retired as primary path.** Logic refactored: the sweeper reuses the claim+dispatch loop; `/poll` itself is decommissioned with the scheduler (Decision 9). |
| `GET /health` | `services/transcribe/main.py:63-66` | Reuse unchanged. |
| `transcribe_session()` (full pipeline + status writes) | `services/transcribe/pipeline.py:33-206` | **Reuse unchanged** (processing is settled/out of scope) — except the pending→processing flip at line 70 becomes redundant once the claim is atomic (Decision 6); left as a harmless idempotent re-write. |
| `get_pending_job()` (non-atomic select + inline stale-reset) | `services/transcribe/storage.py:164-201` | **Split** into `claim_pending_job()` (atomic, Decision 6) + `reset_stale_jobs()` (standalone, Decision 8). |
| `update_job_status()` (service-role writer) | `services/transcribe/storage.py:136-158` | Reuse; extend to also write `updated_at` and to carry `attempts` increments where the claim happens (Decision 5/8). |
| `retry_transcription(p_session_id)` RPC (manual retry, inserts new row) | `migration 20260313120000:149-182` | **Reuse unchanged.** New auto-retry is a DIFFERENT mechanism (in-place re-dispatch on the same row), so manual and auto never share a counter source by accident (Decision 5). NOTE: each manual-retry INSERT gets its OWN fresh `attempts=0` counter — there is no session-level ceiling across manual retries; bounded instead by the 5-min rate limit + `maxScale=5` + the €30/day billing alert (accepted). |
| `create_transcription_job(p_session_id)` RPC (client insert, idempotent) | `migration 20260313140327` | **Reuse unchanged** — its insert IS the trigger event for Decision 1. |
| `transcription_jobs` table | `migration 20260313120000:31-44` | **Extended** by a new migration adding `attempts`/`max_attempts` (Decision 5 — flagged schema deviation). |
| Client trigger call | `api.ts:3934`, `clarity-live-page.tsx:3446` | **Reuse unchanged** (out of scope — Option C rejected, Decision 1). |
| Scheduler `roles/run.invoker` IAM | (out-of-repo `gcloud`) | **Removed at cutover** (Decision 9); trigger bridge gets its own invoker identity (Decision 1, coordinate with Security). |
| `infrastructure.md` transcribe-session block | `docs/technical/infrastructure.md:54-66` | **Corrected** (`maxScale:5`, quota=5, event-driven + sweeper documented). |
| `day.md` cost tripwire | `.claude/commands/slava/day.md:125-141` | **Updated** to allowlist the sweeper name (Decision 7). |

**Dependencies:**
- GCP Cloud Run `transcribe-session` (us-east4, L4, `maxScale:5`, `min-instances:0`, `cpu-throttling:false`) — reused; config confirmed, not flipped.
- Supabase Postgres (prod `besjtuodziykmjidubzw`) — `pg_net` extension for the DB webhook (Decision 1); a new migration for the `attempts` column.
- GCP Cloud Tasks (NEW — Decision 1, Option B): one queue with `maxConcurrentDispatches=5`, retry config bounded by the job-row counter.
- GCP Cloud Scheduler (one NEW sweeper job, distinct name — Decision 7; existing `transcribe-poll` disabled-then-deleted — Decision 9).
- GCP Secret Manager (existing secrets reused; one NEW shared-secret for trigger→service auth — flagged to Security).

---

### Architecture Decisions

#### Decision 1: Trigger bridge — Supabase DB webhook (pg_net) → Cloud Tasks → service (Option B)

**Chosen:** `transcription_jobs` INSERT fires a Supabase DB webhook (pg_net) that enqueues a **Cloud Task**; the Cloud Tasks queue (`maxConcurrentDispatches=5`) invokes a new fire-and-forget endpoint on `transcribe-session`. (Option B, the spec's starting hypothesis — confirmed correct here.)

**Rationale (ranked dimension — stability):** Two runtime failure modes that Options A and C cannot absorb are absorbed by Cloud Tasks for free, as managed state rather than code I have to write and verify:
1. **Concurrency capping at the verified quota.** Quota is 5 L4 in us-east4. `maxConcurrentDispatches=5` makes Cloud Tasks hold dispatch #6 until a slot frees, instead of firing it into a `429` that some other layer must catch and re-drive. The cap lives in managed config, not in a hand-rolled semaphore.
2. **Bounded, backed-off redelivery on transient invocation failure** (cold-start `429`, 5xx, network drop on the dispatch hop) — Cloud Tasks retries with exponential backoff against the SAME task, governed by the job-row counter (Decision 5). pg_net (Option A) gives a single fire with a seconds-long deadline and no managed retry; a dropped dispatch there is silently lost and only the 1-2h sweeper recovers it — a worse user-outcome (latency) and a worse stability profile.

Option C (direct from client) is rejected outright: it reintroduces P495's "lost if the browser closes before the call" fragility (the very reason the insert, not the call, is the source of truth), and it cannot cap concurrency. The sweeper is a backstop for rare loss, not a primary path.

**Trade-off:** One more managed component (Cloud Tasks queue) and one more network hop (webhook → Tasks → service) than Option A. Accepted because the hop is what buys the managed concurrency cap and managed retry; hand-building either on top of pg_net is more failure modes in my code, not fewer.

**Critical constraint (carried into Decision 3):** the Cloud Tasks **dispatch deadline** must be short, and the invoked endpoint must return `202` within seconds. If the task's HTTP target blocked for the 5-15 min job, Cloud Tasks would hit its dispatch deadline, mark the task failed, and **redeliver → duplicate processing.** Fire-and-forget on the dispatch hop is mandatory, not optional.

**Alternative rejected:** Option A (pg_net → thin dispatcher → `/transcribe`) — fewest components, but no managed concurrency cap and no managed retry; every reliability property would be hand-coded in the dispatcher and re-verified. Option C (client-direct) — rejected for fragility + no cap, as above.

#### Decision 2: Fire-and-forget on the service side — new `POST /transcribe-async` endpoint claiming-then-backgrounding

**Chosen:** Add `POST /transcribe-async` to `services/transcribe/main.py`. It (a) performs the **atomic claim** (Decision 6), (b) if it lost the claim returns `200 {"claimed": false}` (no-op — another dispatcher already owns the job), (c) if it won, schedules `transcribe_session(...)` as a background coroutine and returns **`202` immediately**. The existing synchronous `POST /transcribe` is **retained for manual/debug single-job runs** but is never the Cloud Tasks target.

**Rationale (correctness):** The trigger's success criterion is "the job is claimed and will be processed," not "the transcript exists." Returning `202` after the claim decouples dispatch-deadline from processing-time, which is the only thing that prevents the duplicate-processing loop the spec calls out as BLOCK #1. Doing the **claim before** returning (not inside the background task) means a `202` is a real guarantee the job is owned — Cloud Tasks can safely consider the task delivered.

**Implementation note — background mechanism:** Use a detached `asyncio` task (FastAPI `BackgroundTasks` runs after the response is sent, which is acceptable, but a `loop.create_task` / explicitly-managed task gives a handle for the keepalive request of Decision 3). `transcribe_session` is currently a synchronous, CPU/GPU-bound function — it must run in a thread executor (`asyncio.to_thread`) so it does not block the event loop that has to keep serving `/health` and accept the keepalive request. **This is a genuine concern to verify in the build**, not assert here.

**Trade-off:** Two transcribe entrypoints (`/transcribe` sync, `/transcribe-async` claim+background). Accepted: the sync one is the debug/manual primitive and the manual `retry_transcription` path can drive it; the async one is the production trigger target. One extra state-machine state (claimed-but-not-yet-started) — bounded and observable via `status='processing'`.

**Alternative rejected:** Make `/transcribe` itself non-blocking (background-on-entry). Rejected because it silently changes the contract of an endpoint P495 documents as synchronous (returns the full `TranscribeResponse`); a separate endpoint keeps the sync contract intact for manual/debug use and makes the async path explicit.

#### Decision 3: In-flight keepalive vs. idle-shutdown — the PROCESSING request holds itself open (request-side liveness)

**Chosen:** Resolve the MUST-PIN by separating the two hops:
- **Trigger hop (Cloud Tasks → `/transcribe-async`)** is fire-and-forget: returns `202` in seconds.
- **Processing liveness** is guaranteed by keeping an **HTTP request open on the instance for the job's duration**, via a self-issued keepalive request. Concretely: when `/transcribe-async` wins the claim, it (or a small internal mechanism) holds an in-flight request — e.g. the background task issues a long-lived loopback `GET /health`-style keepalive, OR the design promotes the processing itself onto a request that the trigger does not wait on but Cloud Run still sees as "active." Set the Cloud Run **request timeout to 3600s** (60 min — covers full-hour recordings at ~5-15 min GPU work with wide margin). 

  *Why a keepalive is needed at all:* Cloud Run only guarantees the instance is alive **while an HTTP request is in flight.** With `cpu-throttling=false` the GPU/CPU is allocated for the instance lifetime, but the instance is still reclaimed after the idle window once **no request is active.** A `202`-then-detached-background-task with NO in-flight request is exactly the case Cloud Run may reclaim mid-job. So "fire-and-forget on the trigger" (Decision 2) and "instance survives the job" (this decision) are reconciled by: the dispatcher does not wait, but the instance keeps one request open until the job finishes.

**Rationale (correctness + user outcome):** Without this, a long recording's job can be killed mid-flight; the transcript never lands and only the 1-2h sweeper notices (bad latency, and the 27%-failure context says crashes already happen). Holding the request open is the documented Cloud Run liveness contract; request timeout 3600s is the explicit knob.

**Trade-off:** "Fire-and-forget" is then only literally true for the **dispatcher→service hop**; the **service→job execution** holds its own long-lived request. This is the intended reconciliation, called out explicitly so no downstream agent reads "fire-and-forget" as "no request stays open." Mild runtime complexity: one extra in-flight request per active job. Accepted — it is the mechanism that prevents mid-job reclaim.

**Open item for the build (flagged, not asserted):** the exact keepalive shape — (a) make `/transcribe-async` itself block on the job under a 3600s timeout but have **Cloud Tasks** use a short dispatch deadline + `Prefer: respond-async`-style decoupling, vs. (b) `202` immediately and run processing under a separate self-issued keepalive request — must be **verified against current Cloud Run + Cloud Tasks behavior at build time** (Falsify-before-rely). The decision here pins the *requirement* (an in-flight request must exist for the job's lifetime; request timeout = 3600s); the precise wiring is verified, not assumed. **Hypothesis:** option (a) is simplest and sufficient — Cloud Tasks dispatch deadline can be set shorter than the processing time only if the target returns early; if Cloud Tasks insists on holding the connection until the target responds, option (b) is required. **Cheapest disproof:** deploy a stub `/transcribe-async` that sleeps 20 min then 200s, enqueue via Cloud Tasks with a 30s dispatch deadline, observe whether the task is marked failed+retried (→ need option b) or delivered (→ option a works). Run it in the build.

#### Decision 4: `cpu-throttling` — keep `false` (already decided upstream; not re-litigated)

**Chosen:** Keep `cpu-throttling=false` on `transcribe-session`. Cost savings come from **scale-to-zero after the idle window once the poll is gone**, verified via billing — not from throttling.

**Rationale:** Background processing after a `202` requires the CPU to stay allocated between requests; `cpu-throttling=true` freezes CPU outside an active request and would stall the background task. The €659 leak was the 5-min poll holding the instance above idle-shutdown, not throttling. Decided in the spec; reflected here without change.

**Trade-off:** None new — this is the status quo setting. **Alternative rejected:** flipping throttling on "to save money" — breaks background processing and does not address the actual cost driver (the poll).

#### Decision 5: Retry accounting — ADD an `attempts` column (DEVIATES from spec's "schema unchanged")

> **⚠ SCHEMA DEVIATION — flagged explicitly.** The spec's "What Stays the Same" says *"DB schema unchanged."* **This decision adds columns to `transcription_jobs`.** Reason it is unavoidable: Requirement 5 demands a single retry counter on the job row that ALL paths (trigger/Cloud Tasks/sweeper) read and increment, stopping at 3 total. The current schema has **no `attempts` column** (verified against migration `20260313120000` lines 31-44), and the only row-counting proxy — rows-per-session — is structurally broken: `create_transcription_job` blocks any second client row (idempotency guard), and `retry_transcription` rows are MANUAL retries that would conflate with auto-retries. There is no correct way to satisfy Requirement 5 without a real counter. **This deviation is required by Requirement 5 itself; surfacing it to the founder for ratification.**

**Chosen:** New migration `supabase/migrations/YYYYMMDDHHMMSS_p858_transcription_retry_accounting.sql` adds to `transcription_jobs`:
- `attempts INTEGER NOT NULL DEFAULT 0` — incremented exactly once per real processing attempt, at the moment of the atomic claim (Decision 6).
- `max_attempts INTEGER NOT NULL DEFAULT 3` — per-row cap so the policy is data-driven, not hardcoded across three call sites.

**Where increment happens:** inside the **atomic claim** (Decision 6). The claim statement is the single chokepoint every dispatcher (trigger and sweeper) passes through, so incrementing there guarantees one increment per attempt regardless of which path initiated it. The claim refuses to start when `attempts >= max_attempts` (transitions the row to `failed` instead).

**How each path respects the counter (never starts fresh):**
- **Trigger (Cloud Tasks → `/transcribe-async`):** claim increments `attempts`; if `attempts` would exceed `max_attempts`, claim fails → endpoint returns `200 {"claimed": false, "exhausted": true}` and the row is marked `failed`. Cloud Tasks sees a `200` (delivered) and does not retry.
- **Cloud Tasks backoff:** retries are for **invocation** failures (5xx/429/network) BEFORE a claim succeeds — i.e. they re-drive a task whose attempt never counted. Once a claim succeeds and processing later fails, the **failure is recorded on the row** (`status='failed'`, `attempts` already incremented); re-dispatch is NOT Cloud Tasks' job at that point — it is the sweeper's (next bullet). Cloud Tasks' own `maxAttempts` is set generously (covers transient invocation flakiness) but the job-row `max_attempts` is the real ceiling on *processing* attempts.
- **Sweeper auto-retry:** the sweeper re-dispatches a `pending` job (or a stale-reset one) ONLY if `attempts < max_attempts`. It reuses the same atomic claim → same increment. It never resets `attempts`.

**The re-trigger loop (this is the subtle part the spec calls out):** setting a `failed` job back to `pending` is an **UPDATE**, and the webhook fires only on **INSERT** — so an auto-retry does NOT re-fire the trigger. Therefore the auto-retry re-dispatch path is: on a transient (retryable) failure, the pipeline's `except` sets `status='pending'` (instead of `failed`) and clears `error_message`, leaving `attempts` as-is; the **sweeper** (Decision 7) picks the `pending` row up on its next cycle and re-dispatches via the atomic claim, which increments `attempts` again. When `attempts` reaches `max_attempts`, the claim flips it to `failed` permanently. This means auto-retry latency for a transient failure is bounded by the sweeper interval (1-2h), NOT instant — an accepted trade-off because transient failures are rare and the alternative (an UPDATE-fired re-trigger) would require a second webhook on status transitions, adding a failure mode. *(Distinguish "retryable transient" from "permanent" failures in the build via the 27%-investigation, Decision 10 — only retryable ones go back to `pending`.)*

**Trade-off:** A schema migration on a prod table (additive, `DEFAULT` backfills existing rows to `0`/`3` — safe, non-locking on Postgres for `NOT NULL DEFAULT` on recent versions). Auto-retry is not instant (sweeper-bounded). Accepted: correctness of "max 3 total, one counter" outweighs retry latency for a rare path.

**Alternative rejected:** Count rows-per-session — broken as shown (idempotency guard + manual/auto conflation). Count in Cloud Tasks task metadata — invisible to the sweeper, so the two paths could each count to 3 → up to 6 attempts; violates "same counter."

#### Decision 6: Atomic claim — conditional UPDATE … WHERE status='pending' RETURNING

**Chosen:** Replace the non-atomic `get_pending_job()` read with an atomic claim. **The claim is a Postgres function invoked via `client.rpc("claim_pending_job", {...})`** — `FOR UPDATE SKIP LOCKED` cannot be expressed through supabase-py's PostgREST `.table().update()` layer (a REST update would silently drop the lock and reintroduce double-dispatch). A new migration adds the function (see Files to Create). Its body runs:

```sql
UPDATE transcription_jobs
   SET status = 'processing',
       attempts = attempts + 1,
       updated_at = now()
 WHERE id = (
   SELECT id FROM transcription_jobs
    WHERE status = 'pending' AND attempts < max_attempts
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
 )
RETURNING id, session_code, session_id, attempts;
```

The `FOR UPDATE SKIP LOCKED` subselect + conditional UPDATE means **only one caller wins a given row**; concurrent dispatchers either claim a *different* pending row or get zero rows (no-op). Both modes are the SAME function `claim_pending_job(p_job_id UUID DEFAULT NULL)`: `p_job_id IS NULL` → claim the oldest pending row (sweeper); `p_job_id` provided → add `AND id = p_job_id` to the subselect so only that row is eligible (trigger, since Cloud Tasks carries the `job_id`). Winner gets the row; loser gets zero rows → caller returns `claimed:false`.

**Rationale (correctness — the backbone):** Fire-and-forget + a sweeper means two independent dispatchers can both see the same `pending` row. Without an atomic claim, both call `transcribe_session` → duplicate GPU work + a second `session_transcripts` INSERT. The conditional UPDATE collapses claim+flip into one statement, so the pending→processing transition is the synchronization point. This also makes the pipeline's own line-70 flip redundant (harmless idempotent re-write).

**Trade-off:** The trigger endpoint and sweeper must both route through `claim_pending_job` and honor a `false` return as a clean no-op (not an error). One new RPC/SQL path. Accepted — it is the only correct foundation for coexistence.

**Alternative rejected:** Advisory locks or a `claimed_by`/`claimed_at` lease column — more moving parts than a conditional UPDATE that the existing single-writer (service-role) model already supports.

#### Decision 7: Sweeper — Cloud Scheduler (1-2h) → new `POST /sweep` endpoint, distinct non-matching name

**Chosen:** A low-frequency Cloud Scheduler job (interval **2h**) invokes a new `POST /sweep` endpoint on `transcribe-session`. `/sweep` (a) runs `reset_stale_jobs()` (Decision 8), then (b) re-dispatches every remaining `pending` job via `claim_pending_job` (Decision 6) — draining lost-trigger leftovers and auto-retry rows. The scheduler job is named **`transcribe-session-janitor`**… **no** — that matches the `transcribe` token in `day.md`'s filter. **Chosen name: `tx-job-janitor`** (contains none of `run.app|cloud-?run|poll|warm|transcribe`), AND `day.md`'s tripwire is updated with an explicit allowlist note so the intent is documented even if the name later changes.

**Rationale (sustainability + correctness):** Interval 2h ≫ the ~15-min idle window, so the sweeper's own invocation cannot hold the GPU warm between cycles — it wakes the instance, drains, and lets it idle back to zero. That is the entire point: it must NOT recreate the poll's cost bug. It is a rare janitor (recover lost triggers + reset stale + drive auto-retries), not a work-poll. The distinct name lets the `/day` cost tripwire distinguish "2h janitor, safe" from "5-min poll, leak."

**Trade-off:** Lost-trigger and transient-retry recovery latency is bounded by the 2h interval, not seconds. Accepted: these are rare paths (the trigger is the instant primary). One new Cloud Scheduler job + one new endpoint. **Alternative rejected:** a separate Cloud Run **job** (not an endpoint hit by scheduler) — would need its own image/deploy and DB client; reusing the running service's `/sweep` endpoint reuses the existing container, secrets, and storage layer. **Alternative rejected:** shorter interval (e.g. 15-30 min) — risks approaching the idle window and re-warming; 2h keeps a wide safety margin.

#### Decision 8: Stale-reset extraction — standalone `reset_stale_jobs()` the sweeper calls

**Chosen:** Extract the stale-`processing`→`pending` reset (currently inline in `get_pending_job()`, storage.py lines 172-187) into a standalone `storage.reset_stale_jobs()`. `/sweep` calls it every cycle. While extracting, **fix the latent `updated_at` bug**: the reset compares `updated_at < now()-30min`, but `update_job_status()` never writes `updated_at` (verified — it writes `status`/`error_message`/`completed_at` only). The atomic claim (Decision 6) now writes `updated_at=now()`, and `update_job_status` must be extended to bump `updated_at` on every write, OR a DB `BEFORE UPDATE` trigger must maintain it — otherwise the stale-reset measures age from INSERT, not from last activity, and could reset a still-running job prematurely or never (the existing P495 behavior is subtly wrong here).

**Rationale (correctness — crash recovery):** Deleting the poll deletes the only caller of the stale-reset. Given the 27% historical failure rate, a job whose instance is killed mid-`processing` (before the `except` writes `failed`) would otherwise jam forever. The sweeper must own this. Fixing `updated_at` is required for the 30-min window to mean "stuck," not "old."

**Trade-off:** Touches `update_job_status` (a function the settled pipeline calls) to add an `updated_at` write — minimal-surface change, behavior-preserving for callers. Accepted because the stale-reset is otherwise unreliable. **Alternative rejected:** leave reset inside `get_pending_job` and have the sweeper call `get_pending_job` — couples the janitor to the claim-read and keeps the non-atomic select alive; extraction is cleaner and matches Decision 6.

#### Decision 9: Poll/scheduler decommission sequencing

**Chosen:** Two-phase. **Phase A (cutover):** deploy the trigger bridge + `/transcribe-async` + `/sweep`; **disable** (not delete) `transcribe-poll`; keep its `roles/run.invoker` IAM binding so re-enabling is a one-command rollback. Verify in prod (real `/live` session produces a transcript via the new path; billing shows scale-to-zero over 24h idle). **Phase B (final cutover, after verification):** delete `transcribe-poll`; **remove the scheduler service account's `roles/run.invoker`**; the trigger bridge's own invoker identity (Cloud Tasks service account or a dedicated SA — coordinate exact identity with the Security agent) is the only invoker remaining besides `tx-job-janitor`'s.

**Rationale (stability — preserve rollback):** Keeping `transcribe-poll` disabled-but-present means a single `gcloud scheduler jobs resume` restores the old path if the event-driven path regresses in prod, with zero redeploy. Removing IAM only at Phase B avoids breaking rollback during the verification window.

**Trade-off:** A disabled scheduler lingers briefly (the `/day` tripwire filters `state=ENABLED`, so a disabled job does not false-positive — verified against day.md line 128). Accepted. **Alternative rejected:** delete immediately at cutover — no rollback path if the new trigger regresses.

#### Decision 10: 27% failure-rate investigation — folded into the build sequence

**Chosen:** A build-sequence task (not run now): read `failed` jobs' `error_message` from `transcription_jobs` on **prod** (`besjtuodziykmjidubzw`, via curl + service-role key per db-access rules — this table's anon read returns `[]`), categorize failure modes (OOM / timeout / audio-format / diarization crash / HF-token / etc.), and **fix the top cause or document why it is deferred.** This investigation also feeds Decision 5's transient-vs-permanent classification: only *retryable transient* failures go back to `pending` for sweeper auto-retry; *permanent* ones (e.g. malformed audio) go straight to `failed` and must not consume retries.

**Rationale (user outcome):** Auto-retry (max 3) mitigates *transient* failures but would mask a *systematic* one — burning 3 GPU attempts on a deterministically-failing job. Categorizing first prevents that. **Trade-off:** adds an investigation step before the retry classification is final. Accepted — it is the difference between retry-as-mitigation and retry-as-cost-amplifier.

#### Decision 11: Container concurrency = 1 — one GPU per simultaneous job (how GPU count is decided)

**Chosen:** Set Cloud Run **`--concurrency=1`** on `transcribe-session`.

**Rationale (correctness + cost — this answers "how does it decide how many GPUs?"):** Cloud Run autoscales *instances* by demand, and each running instance = one L4 GPU. How many instances it starts is governed by **container concurrency** — how many simultaneous requests one instance accepts before Cloud Run spins up another. The service **currently never sets it** (verified — no `concurrency` anywhere in `services/transcribe/`, deploy config, or `infrastructure.md`), so Cloud Run's default (80) applies: up to 80 transcription requests would be routed onto a SINGLE GPU instance (OOM / severe contention) and Cloud Run would NOT scale out to a second GPU. With `concurrency=1`, each instance serves exactly one job, so the GPU count tracks simultaneous demand exactly: 1 job → 1 GPU, 3 → 3, 5 → 5; a 6th simultaneous job cannot get a 6th instance (`maxScale=5` + quota=5), so Cloud Tasks (`maxConcurrentDispatches=5`) holds it until a slot frees. Idle → 0 instances → 0 GPUs. `concurrency=1` is also **required by the keepalive** (Decision 3): one open request per job means one job per instance.

**Trade-off:** None adverse — `concurrency=1` is the correct setting for a single-model GPU workload; the only change is making it explicit instead of relying on a default that is wrong for this workload. **Alternative rejected:** leave the default — packs multiple jobs per GPU (OOM, no scale-out), defeating both the 5-parallel goal and the per-job keepalive. **Verify:** `gcloud run services describe transcribe-session` (current value unrecorded); set explicitly at deploy.

#### Decision 12: Project-level billing budget alarm (€30/day) — the catch-all cost backstop

> `[FOUNDER DECISION: €30/day alert]`

**Chosen:** Add a **GCP billing budget alert at €30/day** on the GPU project (`gen-lang-client-0869694595`) notifying the founder; optionally a budget-triggered **kill-switch** (Pub/Sub → function that sets `maxScale=0`) as a hard stop.

**Rationale (sustainability — defense against the *unknown* failure mode):** Every other cap (maxScale=5, request-timeout 3600s, attempts≤3, OIDC, scale-to-zero, atomic claim, concurrency=1) defends a *known* failure mode. A billing alarm is the only defense against one we did not anticipate — and it is exactly what was missing when the original €659/mo leak ran masked by startup credits for weeks. Note the new design's *theoretical* worst case (5 GPU × €0.80/hr ≈ €96/day) is **higher** than the old single-GPU leak precisely because it can parallelize to 5 — so a real-time spend alarm matters more here, not less. €30/day sits above a heavy-but-plausible real day yet well under the €96/day ceiling, so it pages on anomaly without false-firing on legitimate bursts.

**Trade-off:** A budget alert is reactive (it notifies; it does not by itself stop spend) unless paired with the kill-switch (one Pub/Sub + one function). Accepted: the alert alone converts "discover at month-end" into "discover in hours"; the kill-switch is the optional hard stop. **Alternative rejected:** rely solely on the `/day` manual tripwire — a once-daily human glance, not a real-time guarantee, and exactly what failed to catch the original leak promptly.

---

### Security Review

The redesign's security weight is concentrated in ONE place: it replaces a single GCP-internal caller (Cloud Scheduler SA holding `roles/run.invoker`) with an **external caller originating outside GCP** (Supabase pg_net over the public internet). That is a genuinely new external→internal trust boundary. The processing pipeline's existing controls (participant-only RLS, private-session guard, service-role writes) are unchanged and intact.

**Inbound Invocation Auth (highest priority):**
- ⚠️ **REQUIRED.** `transcribe-session` must stay deployed `--no-allow-unauthenticated`. The invoker must be a **dedicated service account** with `roles/run.invoker` scoped to this one service, presenting a **Google-signed OIDC ID token** whose `aud` claim is the Cloud Run service URL. Inbound auth must be a hard requirement, NOT left as an open decision.
- ✅ Option B (Cloud Tasks) is the correct fit on this axis: a task carries `oidcToken{serviceAccountEmail, audience}` and Google signs/rotates it automatically — **no long-lived secret anywhere.** Strictly better than Option A's static bearer header. Confirms Decision 1.
- ⚠️ At-least-once delivery (Cloud Tasks redelivery + sweeper) means two valid invocations can race for one `job_id` — security-adjacent (each duplicate = a GPU spin). Bounded only by the atomic claim (Decision 6); the `pending`→`processing` flip is the right place to make it idempotent.

**Secret Management:**
- ✅ Option B / OIDC adds **zero** new stored secrets. Existing `SUPABASE_SERVICE_ROLE_KEY`/`HF_TOKEN` stay server-side env on Cloud Run — no regression.
- ⚠️ If Option A were ever chosen, its bearer secret must live in **GCP Secret Manager** + Supabase server-side webhook headers — never a `VITE_*` var, never committed, never written into this public spec. **REQUIRED:** add a `## Pre-deploy Checklist` (mandated by `.claude/rules/features.md` when a spec introduces a new external integration). Option C (client-direct) cannot hold an invoker credential without exposing it — incompatible with an authenticated endpoint; correctly rejected.

**Webhook Payload Trust & Job Forgery:**
- ⚠️ **REQUIRED.** Treat the pg_net/Task payload as an untrusted **pointer**. Accept only `job_id`; re-fetch the row by id with the service-role key and use the DB's `session_id`/`session_code` — never payload fields. The current `/transcribe` (main.py:69-89) trusts body `session_code`/`session_id` with no re-fetch; the event path must be id-driven. The atomic claim's `RETURNING session_code, session_id` (Decision 6) already yields DB values — use those, not the payload.
- ✅ DB-side forgery is well-contained: `create_transcription_job` is participant-gated, private-session-blocked, idempotent (one row/session, server-derived code); `retry_transcription` is participant-gated + 5-min rate-limited; direct INSERT is blocked by RLS (service-role only). An ordinary authenticated user cannot forge a job through the DB. The real forgery surface is therefore **direct calls to the Cloud Run URL** — which is exactly why inbound auth is mandatory. Re-fetch-by-id also means a forged direct call can only act on a job that genuinely exists.

**Authorization / Data Protection:**
- ✅ Private-session block intact on the new path via two independent backstops: (1) `create_transcription_job` refuses private-session jobs, so the trigger never fires for one; (2) the `BEFORE INSERT` trigger `trg_block_private_session_transcript` on `session_transcripts` fails closed even for the service-role writer (RLS bypass ≠ trigger bypass).
- ✅ Participant-only SELECT on transcripts unaffected (redesign touches triggering only). The new endpoint must NOT widen service-role write capability — it only triggers the same `transcribe_session`.

**Cost-as-Security / DoS** (the feature's defining risk — a €0.80/hr GPU woken per trigger is a denial-of-wallet target):
- ⚠️ **Unauthenticated internet attacker hitting the URL directly** → fully mitigated only by `--no-allow-unauthenticated` + OIDC. **The single must-fix.**
- ✅ Authenticated app-user abuse bounded by `create_transcription_job` idempotency + `retry_transcription` 5-min rate limit + `maxScale=5`. Bounded, not zero (N legitimate sessions → N jobs) — accepted given the participant gate.
- ⚠️ Option B's `maxConcurrentDispatches≤5` + low `maxDispatchesPerSecond` gives a hard server-side throttle + bounded backoff — turns a burst into a drained queue. Option A's direct webhook would create a 429 thundering-herd where each successful retry = a GPU wake. Reinforces Decision 1.
- ⚠️ The atomic claim is the cost backstop for duplicate dispatch: zero rows claimed → return 202 and spin no GPU.

**Input Validation:**
- ✅ Supabase query injection not reachable (PostgREST parameterizes; no raw SQL in the service).
- ⚠️ **REQUIRED — GCS path traversal via `session_code`.** `download_session_audio` builds `prefix = f"sessions/{session_code}/"` (audio.py:62) with no sanitization, and `transcription_jobs.session_code` is free-text `TEXT` with no CHECK. Normal flow is safe (client charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, server-derived code), but the GPU service trusts whatever `session_code` it is handed. Validate `session_code` against the EXACT generator charset (`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` — 6 chars, no I/O/0/1; source: `src/app/data/api.ts:781` `generateRoomCode`) at the service boundary before it reaches any GCS prefix. A code failing this could never have been legitimately generated. This validator is the **path-safety** gate; **re-fetch-by-id (mitigation #3) is the forgery gate** — complementary, not redundant.

**Required mitigations (must-do before ship):**
1. `transcribe-session` stays `--no-allow-unauthenticated`; trigger authenticates via a dedicated SA + Google-signed OIDC (`aud` = service URL), carried by Cloud Tasks `oidcToken` (key-free). *(Confirm current allow-unauthenticated state via `gcloud run services describe` — `infrastructure.md` does not record it, so "not public" is unverified from the repo.)*
2. Atomic idempotent claim (Decision 6): zero rows claimed → 202, no second GPU spin.
3. Re-fetch the job by `job_id`; ignore payload-supplied `session_id`/`session_code`.
4. Validate `session_code` (`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`) at the service boundary before any GCS prefix.
5. No new secret in the client bundle / repo / public spec; add a `## Pre-deploy Checklist`.

**Recommended (hardening):** add a DB `CHECK (session_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$')` to the P858 migration so the path-safety invariant is enforced for any future writer; ensure the `tx-job-janitor` sweeper authenticates via OIDC too (it also wakes the GPU); add a Cloud Tasks dead-letter after max attempts, reconciled with the job-row counter (Decision 5) so neither path starts a fresh count.

---

### Implementation Approach

**Worktree recommended:** touches services/transcribe + a new migration + IAM + docs across many files.

#### Build Sequence

1. **Migration — retry accounting (Decision 5).** New `supabase/migrations/YYYYMMDDHHMMSS_p858_transcription_retry_accounting.sql`: `ALTER TABLE transcription_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0, ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;`. Run `./scripts/migrate.sh`. Foundational — the claim and all retry logic depend on these columns.
2. **Atomic claim (Decision 6).** Add the **`claim_pending_job(p_job_id UUID DEFAULT NULL)` DB function** via a new migration, and call it from `storage.py` via `client.rpc("claim_pending_job", {...})` — NOT a REST `.update()` (PostgREST can't do `FOR UPDATE SKIP LOCKED`). `p_job_id` NULL = oldest-pending (sweeper); set = by-id (trigger); both increment `attempts` and gate on `attempts < max_attempts`. Extract `reset_stale_jobs()` (Decision 8) out of `get_pending_job()` — **strip the inline stale-reset from `get_pending_job()` itself** so the old, `updated_at`-broken reset can never run again via a dormant `/poll`; `get_pending_job()` then holds only the oldest-pending SELECT (and is removed entirely with `/poll` at Phase B). Fix `update_job_status()` to write `updated_at` on every write (and/or a `BEFORE UPDATE` trigger).
3. **Service endpoints (Decisions 2, 3, 7).** Add `POST /transcribe-async`: accept ONLY `job_id` from the task payload (**Security mitigation #3** — never trust payload `session_code`/`session_id`); the atomic claim's `RETURNING session_code, session_id` supplies the DB values passed to `transcribe_session`. Validate `session_code` against `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` before it reaches any GCS prefix (**Security mitigation #4**). Flow: claim → `202` → background `asyncio.to_thread(transcribe_session, …)`; honor `claimed:false`/`exhausted:true`. Add `POST /sweep` (calls `reset_stale_jobs()` then drains `pending` via `claim_pending_job`). Keep `POST /transcribe` (sync, manual/debug) and `GET /health`. Decommission `/poll` logic (or leave dormant until Phase B). **Build order:** implement the claim → `202` → background skeleton first (keepalive-agnostic); pin the exact keepalive wiring only AFTER the UAT-0 disproof experiment (Step 4) decides option (a) vs (b) — don't hard-wire one and re-architect.
4. **Keepalive verification + Cloud Run config (Decisions 3, 11).** Deploy a stub and run the cheapest-disproof experiment (20-min sleep target + 30s Cloud Tasks dispatch deadline) to decide option (a) vs (b). Set Cloud Run **request timeout = 3600s** AND **`--concurrency=1`** (one job per GPU instance — current value unrecorded, set explicitly). Do NOT assume — verify against live Cloud Run + Cloud Tasks behavior.
5. **Trigger bridge (Decision 1).** Enable `pg_net`; create the Supabase DB webhook on `transcription_jobs` INSERT → Cloud Tasks `CreateTask`. Create the Cloud Tasks queue with `maxConcurrentDispatches=5`, low `maxDispatchesPerSecond`, retry config bounded (job-row `max_attempts` is the real ceiling), optional dead-letter after max attempts. **Auth (Security mitigation #1, REQUIRED):** the task carries an `oidcToken{serviceAccountEmail=<dedicated invoker SA>, audience=<service URL>}`; `transcribe-session` stays `--no-allow-unauthenticated` (confirm current state via `gcloud run services describe`). OIDC is the required mechanism for Option B — NO shared bearer secret. The `tx-job-janitor` sweeper invocation uses the same OIDC pattern.
6. **Sweeper scheduler (Decision 7).** Create Cloud Scheduler job `tx-job-janitor` (interval 2h) → `POST /sweep` with `roles/run.invoker`. Confirm the name does not match `day.md`'s regex.
7. **27% failure investigation (Decision 10).** Query prod `failed` jobs' `error_message`; categorize; fix top cause or document deferral; finalize the transient-vs-permanent classification feeding Decision 5's re-`pending` logic.
8. **Decommission sequencing (Decision 9).** Phase A: disable `transcribe-poll`, retain its IAM. Verify event-driven path in prod (real session → transcript; 24h idle billing ≈ €0; scale-to-zero within ~15 min of completion). Phase B (post-verification): delete `transcribe-poll`, remove scheduler SA `roles/run.invoker`.
9. **Docs + tripwire.** Correct `docs/technical/infrastructure.md` (`maxScale:5`, quota=5, 3600s timeout, event-driven trigger + `tx-job-janitor` sweeper, remove "serialize triggers" note). Update `.claude/commands/slava/day.md` to allowlist `tx-job-janitor` (and document the "2h janitor safe vs 5-min poll leak" distinction).
10. **Billing budget backstop (Decision 12).** Create a GCP billing budget on the GPU project (`gen-lang-client-0869694595`) with an alert at **€30/day** notifying the founder; optionally wire a budget-triggered kill-switch (Pub/Sub → function setting `maxScale=0`).
11. **Verify acceptance criteria** (spec's Acceptance Criteria block): 202-in-seconds, scale-to-zero billing, concurrency=1 → 5 distinct instances, 5-concurrent + 6th-queues, forced-transient retry caps at 3 total, lost-trigger sweeper recovery, stale-reset without poll, 10-min fixture latency, billing alert fires.

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p858_transcription_retry_accounting.sql` — adds `attempts`, `max_attempts` to `transcription_jobs` (Decision 5). May also add the recommended `CHECK (session_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$')`.
- `supabase/migrations/YYYYMMDDHHMMSS_p858_claim_pending_job_rpc.sql` — **`claim_pending_job(p_job_id UUID DEFAULT NULL)` DB function** (Decision 6) wrapping the `FOR UPDATE SKIP LOCKED` conditional UPDATE + `attempts` increment, returning the claimed row. Required because `FOR UPDATE SKIP LOCKED` is not expressible via PostgREST; called from `storage.py` via `client.rpc(...)`.
- *(Infrastructure, not repo files — provisioned via `gcloud`/Supabase, tracked in Pre-deploy):* Cloud Tasks queue (`maxConcurrentDispatches=5`); Supabase DB webhook on `transcription_jobs` INSERT (pg_net); Cloud Scheduler job `tx-job-janitor` (2h); trigger-bridge invoker identity + auth secret.

#### Files to Modify

- `services/transcribe/main.py` — add `POST /transcribe-async` (claim+background+202), `POST /sweep`; retain `/transcribe` sync + `/health`; decommission `/poll` (Decisions 2, 3, 7, 9).
- `services/transcribe/storage.py` — add `claim_pending_job()` (atomic, increments `attempts`) and the by-id variant; extract `reset_stale_jobs()` from `get_pending_job()`; make `update_job_status()` write `updated_at` (Decisions 6, 8).
- `services/transcribe/pipeline.py` — on transient (retryable) failure set `status='pending'` (not `failed`) for sweeper auto-retry; permanent failure → `failed`. **Until Step 7 finalizes the transient-vs-permanent classification, default ALL failures to permanent (`failed`) — an explicit stub, not a guess** (no error is wrongly retried before the 27% investigation; flip specific transient classes to `pending` only once Step 7 names them). Line-70 redundant flip left as harmless idempotent write (Decisions 5, 10).
- `docs/technical/infrastructure.md` (lines 54-66) — fix `maxScale:1`→`5`, `NVIDIA_L4_GPUS=1`→`5`, `1800s`→`3600s` timeout, remove "serialize triggers", document event-driven trigger + `tx-job-janitor` + `concurrency=1` + the €30/day billing budget (Decisions 9, 11, 12, spec Requirement).
- `.claude/commands/slava/day.md` (lines 125-141) — allowlist `tx-job-janitor` in the cost tripwire; document janitor-vs-poll distinction (Decision 7).

#### Files Explicitly NOT Modified (out of scope per change-request contract)

- The entire processing pipeline body of `pipeline.py` (Whisper/diarization/merge/speaker-map/storage of transcripts) — settled in P495.
- `transcription_jobs` status semantics, `session_transcripts`/`user_voice_profiles` schema, RLS, private-session guard, `retry_transcription` + `create_transcription_job` RPCs (reused unchanged).
- All frontend (`api.ts`, `clarity-live-page.tsx`, session/transcript UI) — Option C rejected, client insert unchanged.

---

## Pre-deploy Checklist

Required because P858 introduces a new external integration (Supabase DB webhook → Cloud Tasks → Cloud Run) and a new invoker identity. No new `VITE_*` var is introduced (the design uses key-free OIDC, not a client-baked secret).

### Infra to provision (GCP / Supabase — not repo files)
- [ ] **Dedicated invoker service account** with `roles/run.invoker` scoped to `transcribe-session` only.
- [ ] **Cloud Tasks queue** — `maxConcurrentDispatches=5`, low `maxDispatchesPerSecond`, bounded retry, optional dead-letter. Tasks carry `oidcToken{serviceAccountEmail=<invoker SA>, audience=<service URL>}`.
- [ ] **Supabase DB webhook** on `transcription_jobs` INSERT (enable `pg_net`) → Cloud Tasks `CreateTask`. Webhook config (target + headers) stored server-side in Supabase — never client-exposed.
- [ ] **Cloud Scheduler `tx-job-janitor`** (2h) → `POST /sweep`, authenticating via the same OIDC pattern.
- [ ] **Cloud Run `--concurrency=1` + request timeout = 3600s** on `transcribe-session`; `cpu-throttling=false`, `min-instances=0`, `maxScale=5` confirmed (one GPU per job, demand-driven 0→5).
- [ ] **GCP billing budget alert at €30/day** on the GPU project (`gen-lang-client-0869694595`) notifying the founder (Decision 12); optional budget-triggered `maxScale=0` kill-switch.
- [ ] Run the new migration on prod: `attempts` / `max_attempts` columns on `transcription_jobs`.

### Auth / security gates (from Security Review — must all hold before cutover)
- [ ] `gcloud run services describe transcribe-session` confirms `--no-allow-unauthenticated` (the repo does not record this — verify, do not assume).
- [ ] `/transcribe-async` and `/sweep` reject unauthenticated calls (verify a tokenless `curl` → 401/403).
- [ ] `/transcribe-async` ignores payload `session_code`/`session_id` and re-fetches from the DB by `job_id` (mitigation #3).
- [ ] `session_code` validated against `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` before any GCS prefix (mitigation #4).
- [ ] No new secret committed to the repo or written into this public spec (`scripts/audit-privacy.sh` clean).

### Post-deploy verification
- [ ] Real `/live` session end-to-end produces a transcript via the new path (transcript row created).
- [ ] Trigger returns 202 in seconds while processing continues (fire-and-forget confirmed — no duplicate processing from a redelivered task).
- [ ] 24h idle window: Cloud Run shows 0 instances and billing ≈ €0 GPU (scale-to-zero realized).
- [ ] 5 simultaneous jobs → 5 distinct instances (concurrency=1 confirmed); a 6th waits, none lost.
- [ ] Billing budget alert verified (temporarily low threshold fires a notification, then reset to €30/day).
- [ ] `/day` cost tripwire does not flag `tx-job-janitor` (allowlisted) and shows no warm-GPU leak.
- [ ] Check Sentry / Cloud Run logs for new errors in the first 10 minutes after cutover.
- [ ] Only after the above hold: Phase B — delete `transcribe-poll`, remove the scheduler SA's `roles/run.invoker`.

---

## Test Coverage Strategy

P858 is a backend-infrastructure change-request. The test pyramid is **inverted**: most
assurance lives in UAT/prod-observation because the feature's load-bearing guarantees
(scale-to-zero, €0 idle billing, Cloud Run/Cloud Tasks concurrency, true Postgres
atomicity, real GPU latency) are properties of *managed infrastructure under real load* —
not of pure functions. The pytest tier proves the *application-side contracts* those
infra properties feed into; UAT proves the infra properties themselves.

### Tier A — Automated (pytest + Playwright)

**Why this tier exists:** to drive `/dev` (TDD: every P858 function is red until implemented)
and to lock the application-side contracts that DON'T need a GPU: the claim's gating and
return shape, retry-counter accounting, the stale-reset + `updated_at` bug fix, session-code
validation, the fire-and-forget endpoint's payload-trust rules, and the migration's schema.

| File | Concern | Tests | What each PROVES (outcome, not call-shape) |
|------|---------|-------|--------------------------------------------|
| `services/transcribe/tests/test_p858_claim.py` | Atomic claim | 9 | Claimed-row path returns DB values + incremented `attempts`; zero-rows → `None` clean no-op (no `transcribe_session`); claim is gated (conditional update, not a bare read); by-id (trigger) vs oldest-pending (sweeper); exhausted → refused + `failed`. |
| `services/transcribe/tests/test_p858_retry.py` | Retry accounting | 7 | Counter +1 per claim (via RETURNING value); re-claim continues count (no reset); transient → `pending`, permanent → `failed`; one shared monotonic counter across trigger+sweeper; caps at `max_attempts` → no 4th attempt. |
| `services/transcribe/tests/test_p858_sweep.py` | Stale-reset + /sweep | 8 | `update_job_status` now writes `updated_at` (the bug fix) on every write; `reset_stale_jobs` resets stale rows and LEAVES fresh ones (filter changes outcome); `/sweep` runs reset THEN drains via claim; empty queue → no GPU work. |
| `services/transcribe/tests/test_p858_validation.py` | session_code validation | 4 (parametrized: 6 valid + 17 invalid) | **Strongest Tier-A test — pure function, no mock.** `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` accepts valid codes; rejects `../`, lowercase, empty, over/under-length, slashes, dots, url-encoded, unicode, None — BEFORE any GCS prefix is built (mitigation #4). |
| `services/transcribe/tests/test_p858_async_endpoint.py` | `/transcribe-async` | 6 | Won claim → 202 without blocking on processing; uses DB-RETURNED session fields, IGNORES payload `session_code`/`session_id` even when they DIFFER (mitigation #3); claim scoped by `job_id` only; `claimed:false` → 200 no-op, `transcribe_session` never called. |
| `e2e/integration/p858-retry-accounting-migration.spec.ts` | Migration (P270 mandatory) | 3 | (a) `attempts`+`max_attempts` exist (fails if migration unapplied); (b) service-role insert defaults to `attempts=0`/`max_attempts=3`; (c) a session PARTICIPANT can read the new columns via RLS. The template's "authenticated user writes a column" test is **omitted by design** — `transcription_jobs` is service-role-write-only (no `authenticated` write policy), so that scenario is unreachable; replaced with the participant-SELECT read path. |

**Honest limit of the mock (stated, not hidden):** the pytest claim tests mock the Supabase
client. A mock CANNOT prove the Postgres-level `FOR UPDATE SKIP LOCKED` atomicity (two
dispatchers, one job, no double-process). What the mock CAN and DOES prove is the
application-side half of the contract: the zero-rows branch is treated as a clean no-op
(returns `None`, no `transcribe_session`, no GPU spin). The TRUE concurrency guarantee is
verified in **UAT-11** against real Postgres.

### Tier B — UAT / prod-observation (`features/uat/p858.md`, 15 scenarios)

**Why these CANNOT be CI-automated:** each needs a real GPU deploy, real GCP billing,
real Cloud Run/Cloud Tasks scheduling, and/or real wall-clock — none reproducible in CI.
Each scenario gives a concrete verification method (gcloud command / billing console / curl / SQL).

- **UAT-0** keepalive disproof experiment (option a vs b — 20-min sleep stub + 30s dispatch
  deadline) — **PREREQUISITE, run first**; everything depends on the answer.
- **UAT-1** 24h idle → 0 instances + €0 billing (the core fix).
- **UAT-2** concurrency=1 → 5 simultaneous jobs spin 5 distinct instances, 6th queues.
- **UAT-3** scale-to-zero within ~15 min of completion.
- **UAT-4** hung job killed at 3600s.
- **UAT-5** 10-min audio fixture → transcript ≤ 8 min (falsifiable latency).
- **UAT-6** real /live session → transcript via the new path.
- **UAT-7** auth: tokenless curl → 401/403 (denial-of-wallet must-fix).
- **UAT-8** lost trigger → sweeper recovery.
- **UAT-9** stale `processing` reset by the janitor (no old poll).
- **UAT-10** retry caps at 3 total across trigger + Cloud Tasks + sweeper.
- **UAT-11** two dispatchers, one job, no double-process (**TRUE atomicity** — the guarantee
  the mock can't prove).
- **UAT-12** `/day` tripwire does not flag `tx-job-janitor`.
- **UAT-13** billing alert fires at a low test threshold.
- **UAT-14** 27% failure investigation: categorize `failed` errors, fix top cause or defer.

### Explicitly NOT unit-tested — and why

- **Atomicity under concurrency** (`FOR UPDATE SKIP LOCKED`) → real Postgres only; a mock
  proves nothing about row locking. Covered by **UAT-11**.
- **All Cloud Run / Cloud Tasks / billing infra** (scale-to-zero, idle €0, concurrency 0→5,
  dispatch deadline, request timeout 3600s, OIDC auth, budget alert) → managed-infra behavior,
  not code. Covered by **UAT-1, 2, 3, 4, 7, 13** and the keepalive experiment **UAT-0**.
- **The transcription processing pipeline** (Whisper / diarization / merge / speaker-map /
  transcript storage) → settled in P495 and OUT OF SCOPE per the change-request contract;
  existing tests (`test_pipeline.py`, `test_merger.py`, `test_round_splitter.py`,
  `test_p815_audio_normalization.py`) cover it and must keep passing.
- **Real GPU latency** → UAT-5 fixture only; no CI GPU.

### How to run each tier

```bash
# Tier A — pytest (red until /dev implements P858 functions)
pytest services/transcribe/tests/test_p858_*.py

# Tier A — TypeScript migration check (needs migration applied; .env.test.local)
npm run test:e2e -- p858

# Tier B — UAT: manual, against prod, post-deploy. Run UAT-0 (keepalive) FIRST.
#   Follow features/uat/p858.md scenario-by-scenario; record evidence per scenario.
```

**Note on the pre-commit gate:** the main `pre-commit-checks.sh` does not run pytest, so the
red TDD tests in this tier will not block commits while P858 is being implemented.
