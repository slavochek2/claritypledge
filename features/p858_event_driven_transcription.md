---
status: week
type: change-request
rank: 1000765.0
changes: p495
tags:
  - redesign
  - p495
  - transcription
  - cost
  - infrastructure
created_date: 2026-05-31
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P858: Event-Driven Transcription (GPU wakes per job, not per poll)

> **Redesign of:** [P495: Live Session Transcription](done/24_mar_26/p495_live_session_transcription.md)
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

## Next Steps

- Run `/architect features/p858_event_driven_transcription.md` — remaining genuine architecture decisions: trigger-bridge choice (A/B/C), how fire-and-forget is implemented (background task vs. separate worker), sweeper implementation, and the stale-reset extraction. Serialization is NO LONGER a hard problem (5-GPU headroom).
