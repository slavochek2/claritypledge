# Infrastructure

## Cloud Credits

| Provider | Credit | Source | Expires |
|----------|--------|--------|---------|
| **Google Cloud** | $25K | GFS 2024 Ecosystem Partner | TBD (check account) |

## Google Cloud Platform

**Existing infrastructure:**
- **GCS Bucket:** `[TBD - add bucket name]` — used for voice recordings, event banners
- **Project ID:** `[TBD - add project ID]`

**When to use GCS over alternatives:**
- File uploads (images, audio, documents) → GCS bucket
- Prefer GCS over Supabase Storage — we have credits and it's already set up

**Future uses to consider:**
- Background jobs (Cloud Run)
- AI/ML workloads (Vertex AI)
- CDN for static assets

---

## Environment Configuration

**Environment Variables:** Create `.env.local` from `.env.example`:
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Path Aliases:** Configured in `vite.config.ts` and `tsconfig.json`:
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@lib/*` → `src/lib/*`

---

## Worktree Dev Servers

Agent worktrees live under `.claude/worktrees/`, named by slot (`w1`, `w2`). Ports are auto-detected by `vite.config.ts` based on the slot:

```bash
cd .claude/worktrees/w1
npm run dev   # w1 = port 5100, w2 = 5200 (auto)
```

Port reference: w0 (main) = 5001, w1 = 5100, w2 = 5200. See [worktree-setup.md](worktree-setup.md).

---

## Cloud Run: transcribe-session

GPU-backed transcription service for `/live` session recordings.

- **Service:** `transcribe-session` in `us-east4`, project `gen-lang-client-0869694595`. NOT publicly invokable: `--no-allow-unauthenticated`, sole invoker `tx-task-invoker` SA (used by both Cloud Tasks and the janitor).
- **GPU:** NVIDIA L4, `maxScale: 5`, `min-instances: 0` (scale to zero), `--concurrency=1`. One job per instance = one L4 per simultaneous job; instance count tracks demand 0→5. `cpu-throttling=false` is REQUIRED (background processing after the 202 needs CPU between requests) — cost comes from scale-to-zero once the poll is gone, NOT from throttling.
- **Timeout:** 3600s HTTP request timeout (covers full-hour recordings; the processing request stays in-flight as the keepalive against idle-shutdown).
- **Quota:** `NVIDIA_L4_GPUS = 5` in `us-east4` (no-zonal-redundancy). Up to 5 sessions transcribe in parallel; a 6th simultaneous job is held by Cloud Tasks (`maxConcurrentDispatches=5`) until a slot frees — not silently lost.
- **Trigger (P858/P902 — event-driven, LIVE):** a `transcription_jobs` INSERT fires a prod-only pg_net trigger (`tx_jobs_enqueue`, ad-hoc SQL — embeds the webhook secret, so never a repo migration and never on test) → edge function `enqueue-transcription` (mints a Google OAuth token from SA key `GCP_ENQUEUER_SA_KEY` in Supabase secrets; task name = job id for dedup) → Cloud Tasks queue `transcribe-jobs` (`maxConcurrentDispatches=5`) → OIDC as `tx-task-invoker` → `POST /transcribe-async`. That endpoint atomically claims the job (`claim_pending_job` RPC, FOR UPDATE SKIP LOCKED), returns **202 immediately**, and processes in the background (fire-and-forget — a blocking response would let Cloud Tasks' dispatch deadline elapse and redeliver → duplicate processing). No standing 5-min poll; idle cost ≈ €0.
- **Sweeper (P858):** Cloud Scheduler `tx-job-janitor` (~2h, OIDC) → `POST /sweep` runs `reset_stale_jobs()` then drains remaining `pending` rows via the atomic claim. Interval ≫ the ~15-min idle window, so it does NOT keep the GPU warm. It is the recovery path for lost triggers + transient-failure auto-retries + crashed-mid-processing stale jobs — NOT a work-poll.
- **Retry accounting (P858):** `transcription_jobs.attempts` / `max_attempts` (default 3) — a single counter on the row, incremented once per real attempt at the atomic claim. Trigger + sweeper share it; the claim refuses a row at `attempts >= max_attempts` and marks it `failed`.
- **Billing backstop (P858/P902):** GCP budgets cannot be daily — implemented as a **€30 monthly** budget with stacked current-spend thresholds (100%→1000%), so a €30/day-scale leak alerts within ~a day and at every further €30. Notifies billing admins — the only defense against an UNANTICIPATED failure mode (worst-case 5 × €0.80/hr ≈ €96/day). Pages on anomaly without false-firing on a legitimate burst.
- **Deploy:** always `--no-traffic` + manual traffic migration. Auto-rollout kills in-flight work.
- **Whisper model:** baked into Docker image at `/app/models`. Cold start loads from cache in ~6s (no network download).
- **Observability:** the `transcription_jobs` table tracks pipeline state (`pending → processing → completed/failed`). `_progress()` in `pipeline.py` writes step-level state to the `error_message` field at each stage (`downloading_audio`, `vad`, `whisper`, `diarization`, `merging`, `storing`). On crash, the last step is visible. The sweeper's `reset_stale_jobs()` resets jobs stuck in `processing` >30 min (the cutoff is now meaningful because `update_job_status` bumps `updated_at` on every write).
- **`/poll` is DEPRECATED (P858 Decision 9):** the old 5-min Cloud Scheduler batch-drain held the GPU warm 24/7 (~€659/mo at 0 jobs). `transcribe-poll` was verified-then-DELETED (P902, 2026-06-05); `tx-job-janitor` is the only scheduler. `/transcribe-async` (claim path) supersedes it. Direct `/transcribe` calls without a `job_id` still bypass job tracking — manual/debug only.
- **`session_transcripts` RLS:** the anon key silently returns `[]` (no anon read policy). Use `PROD_SUPABASE_SERVICE_ROLE_KEY` for admin/polling queries on this table.

## Live room transcription: `transcribe-slice` (P1236)

The live path for `/transcribe` rooms. Read this alongside the Cloud Run section above, because the
contrast is the point: that service allocates a GPU, and **this one allocates nothing at all.**

- **Nothing is allocated between slices, or between rooms.** The Gemini Developer API bills per
  request; Supabase edge functions bill per invocation. There is no cold start to hide beyond the
  edge runtime's own sub-second one, no idle-shutdown window, and no teardown on last-member-leave —
  normal leave and abnormal termination (browser crash, dead radio) are the same case, because the
  client simply stops POSTing and cost stops.
- **What that changes about verification.** "A room that has ended leaves no GPU instance allocated"
  is trivially true here and therefore proves nothing. The assertion that actually carries the
  idle-cost invariant is: after `ended_at` is set, **zero further Gemini requests are attributable
  to that room** — checked from the billing export over the window after `ended_at`, plus
  `SELECT count(*) FROM transcribe_messages WHERE room_id = $1 AND spoken_at > ended_at` returning 0.
- **The risk migrated rather than disappeared:** from denial-of-wallet by *allocation* (P858's
  €659/mo idle GPU) to denial-of-wallet by *call volume*. Ten members at one 4-second slice each is
  2.5 requests/second sustained. The controls are three server-side ceilings, none of them visible
  or settable by a client: a 180-minute hard stop **per person, from their own `joined_at`** (P1307 D11;
  a constant in `transcribe-slice/handler.ts`, deliberately not a column — see `database.md`), a
  per-member slice counter advanced inside the same transaction as the message insert, and a per-user
  concurrent-room limit. P1307 moved the cadence to one 14-second slice (13 s + 1 s lead-in) every 13 s,
  so ten members is ~0.8 requests/second.
- **Engine:** Gemini 3.5 Transcribe on `generativelanguage.googleapis.com`. Vertex AI stays disabled.
  The key is the **batch** project's, never prod-interactive — P1162 split those precisely so a
  background workload cannot fuse the user-facing one, and a runaway room must not take `/chat` and
  banner generation down with it.
- **Hard constraint, and it has no error to catch.** With diarization off, Gemini does not reject
  over-long audio: it accepts it, bills it in full, and silently returns roughly the opening five
  minutes (P1237 RQ5). **No code path may send a whole session or a long concatenation.** The
  defence is refusing to construct the request — the ingest function derives each slice's duration
  from the WAV header the audio itself carries, and its transcriber dependency takes exactly one
  slice, so a "flush everything pending as one call" convenience cannot be added without changing
  that type.
- **The GPU is not used by rooms any more (P1307).** The client `endRoom()` that created a batch
  `transcription_jobs` row per member is gone. `/live` sessions still use `transcribe-session` through
  the unchanged P858 path above, and its scale-to-zero billing check still applies.

## Room whole-recording pass: `transcribe-room-batch` (P1307)

- **Deployed (2026-09-15):** Cloud Run `transcribe-room-batch` in `us-east4`, project
  `gen-lang-client-0869694595`, image `gcr.io/…/transcribe-room-batch:p1307-1` (Cloud Build from
  `services/transcribe-room-batch/`). Runtime account `transcribe-session-sa`; invoker
  `tx-task-invoker` only (an unauthenticated call returns 403); `--no-cpu-throttling`, 2 CPU / 2 GiB,
  0–5 instances, concurrency 5, timeout 3600 s. Env `GCS_BUCKET=claritypledge-ml-training`,
  `SUPABASE_URL`; secrets `SUPABASE_SERVICE_ROLE_KEY` ← `supabase-service-role-key`,
  `GEMINI_BATCH_API_KEY` ← `gemini-batch-api-key` (created from the `cp-batch` key). Queue
  `transcribe-room-jobs` (max 5 concurrent). Scheduler `transcribe-room-sweep`, every 10 min,
  OIDC `tx-task-invoker`. Prod function secret `TRANSCRIBE_ROOM_BATCH_URL` points at the service.
  There is no test GCP project: every change here is a prod change.

The saved transcript for a transcribe room. Separate from `transcribe-session` on purpose: the device
is the speaker, so there is no diarization, no voice profile and no Whisper — the P1237 engine ruling
for `/live` is untouched.

- **Chain:** `transcribe_room_sweep_tick()` (pg_cron, every 2 min) ends a room and inserts one
  `transcribe_room_transcription_jobs` row per member → `AFTER INSERT` trigger → `pg_net` →
  edge function `enqueue-room-transcription` (auth: `x-cron-secret`; mints a Google token from
  `GCP_ENQUEUER_SA_KEY`) → Cloud Tasks queue `transcribe-room-jobs` (task name = job id, so a duplicate
  fire is deduplicated) → OIDC (`tx-task-invoker`) → Cloud Run `transcribe-room-batch` `POST /process`,
  which claims the job atomically, returns 202 and works in the background. `POST /sweep` (Cloud
  Scheduler) resets stale claims and drains pending jobs a lost trigger left behind.
- **Service:** CPU-only (`services/transcribe-room-batch/`), ffmpeg + Gemini 3.5 Transcribe with the
  **batch** key (`GEMINI_BATCH_API_KEY`). Not publicly invokable.
- **RQ5 applies here too.** Each member's archive is decoded per MediaRecorder run and cut into
  segments of **at most five minutes**, one Gemini request each. Never a whole recording.
- **Completeness is reported:** a gap in the chunk sequence, a run without its WebM header, or a
  capture ended by the sweep's staleness rule puts the member in `incomplete_member_ids`.
- **Cross-member duplicates** are kept and labelled `also_heard_by`, never deleted.
- **Logs and task payloads carry ids and counts only** — no audio, no transcript text, no names.
- **Vault prerequisites** (per project): `enqueue_room_transcription_url`,
  `enqueue_room_transcription_secret`, `enqueue_room_transcription_anon_key`. Without them the trigger
  warns and jobs stay pending.
- **Cost:** ~€0.16 per audio-hour per person on top of the live path (P1237 measurement).
