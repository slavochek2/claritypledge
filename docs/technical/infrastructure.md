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

- **Service:** `transcribe-session` in `us-east4`, project `gen-lang-client-0869694595`
- **GPU:** NVIDIA L4, `maxScale: 5`, `min-instances: 0` (scale to zero), `--concurrency=1`. One job per instance = one L4 per simultaneous job; instance count tracks demand 0→5. `cpu-throttling=false` is REQUIRED (background processing after the 202 needs CPU between requests) — cost comes from scale-to-zero once the poll is gone, NOT from throttling.
- **Timeout:** 3600s HTTP request timeout (covers full-hour recordings; the processing request stays in-flight as the keepalive against idle-shutdown).
- **Quota:** `NVIDIA_L4_GPUS = 5` in `us-east4` (no-zonal-redundancy). Up to 5 sessions transcribe in parallel; a 6th simultaneous job is held by Cloud Tasks (`maxConcurrentDispatches=5`) until a slot frees — not silently lost.
- **Trigger (P858 — event-driven):** a `transcription_jobs` INSERT fires a Supabase DB webhook (pg_net) → Cloud Tasks queue (`maxConcurrentDispatches=5`, key-free OIDC auth) → `POST /transcribe-async`. That endpoint atomically claims the job (`claim_pending_job` RPC, FOR UPDATE SKIP LOCKED), returns **202 immediately**, and processes in the background (fire-and-forget — a blocking response would let Cloud Tasks' dispatch deadline elapse and redeliver → duplicate processing). No standing 5-min poll; idle cost ≈ €0.
- **Sweeper (P858):** Cloud Scheduler `tx-job-janitor` (~2h, OIDC) → `POST /sweep` runs `reset_stale_jobs()` then drains remaining `pending` rows via the atomic claim. Interval ≫ the ~15-min idle window, so it does NOT keep the GPU warm. It is the recovery path for lost triggers + transient-failure auto-retries + crashed-mid-processing stale jobs — NOT a work-poll.
- **Retry accounting (P858):** `transcription_jobs.attempts` / `max_attempts` (default 3) — a single counter on the row, incremented once per real attempt at the atomic claim. Trigger + sweeper share it; the claim refuses a row at `attempts >= max_attempts` and marks it `failed`.
- **Billing backstop (P858):** GCP budget alert at **€30/day** on the GPU project notifies the founder — the only defense against an UNANTICIPATED failure mode (worst-case 5 × €0.80/hr ≈ €96/day). Pages on anomaly without false-firing on a legitimate burst.
- **Deploy:** always `--no-traffic` + manual traffic migration. Auto-rollout kills in-flight work.
- **Whisper model:** baked into Docker image at `/app/models`. Cold start loads from cache in ~6s (no network download).
- **Observability:** the `transcription_jobs` table tracks pipeline state (`pending → processing → completed/failed`). `_progress()` in `pipeline.py` writes step-level state to the `error_message` field at each stage (`downloading_audio`, `vad`, `whisper`, `diarization`, `merging`, `storing`). On crash, the last step is visible. The sweeper's `reset_stale_jobs()` resets jobs stuck in `processing` >30 min (the cutoff is now meaningful because `update_job_status` bumps `updated_at` on every write).
- **`/poll` is DEPRECATED (P858 Decision 9):** the old 5-min Cloud Scheduler batch-drain held the GPU warm 24/7 (~€659/mo at 0 jobs). `transcribe-poll` is DISABLED, retained only as rollback until the event-driven path is verified in prod, then deleted. `/transcribe-async` (claim path) supersedes it. Direct `/transcribe` calls without a `job_id` still bypass job tracking — manual/debug only.
- **`session_transcripts` RLS:** the anon key silently returns `[]` (no anon read policy). Use `PROD_SUPABASE_SERVICE_ROLE_KEY` for admin/polling queries on this table.
