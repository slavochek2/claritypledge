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
