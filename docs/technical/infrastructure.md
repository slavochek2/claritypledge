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
- **GPU:** 1× NVIDIA L4, `maxScale: 1`, `min-instances: 0` (scale to zero)
- **Timeout:** 1800s HTTP request timeout (container may keep running past this)
- **Quota:** `NVIDIA_L4_GPUS = 1` in `us-east4` — concurrent triggers return 429. Serialize triggers or raise quota.
- **Deploy:** always `--no-traffic` + manual traffic migration. Auto-rollout kills in-flight work.
- **Whisper model:** baked into Docker image at `/app/models`. Cold start loads from cache in ~6s (no network download).
- **Observability:** the `transcription_jobs` table tracks pipeline state (`pending → processing → completed/failed`). `_progress()` in `pipeline.py` writes step-level state to the `error_message` field at each stage (`downloading_audio`, `vad`, `whisper`, `diarization`, `merging`, `storing`). On crash, the last step is visible. Stale-job detection resets jobs stuck >30 min.
- **Direct `/transcribe` calls** without a `job_id` bypass job tracking — only the `/poll` path creates jobs.
- **`session_transcripts` RLS:** the anon key silently returns `[]` (no anon read policy). Use `PROD_SUPABASE_SERVICE_ROLE_KEY` for admin/polling queries on this table.
