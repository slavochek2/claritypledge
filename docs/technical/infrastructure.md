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

## Worktree Ports

Each worktree has a dedicated port to allow parallel development:

| Location | Port |
|----------|------|
| Main repo | 5001 |
| Worktree w1 | 5100 |
| Worktree w2 | 5200 |
| Worktree w3 | 5300 |
| Worktree w4-w7 | 5400-5700 |

**Port logic:** `5000 + (worktreeNum * 100)`. Configured in `vite.config.ts`.

**For agents:** Never start dev servers on arbitrary ports. Use `npm run dev` which auto-detects the correct port based on the worktree.
