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

Agent worktrees live under `.claude/worktrees/`. There are no pre-configured ports — pick any free port when starting a dev server in a worktree:

```bash
cd .claude/worktrees/feature-name
npm run dev -- --port 5101
```

**Main repo:** `npm run dev` defaults to port 5001.

**Legacy named worktrees** (`claritypledge-1..5`) used fixed ports (5100–5500). Those worktrees exist as sibling directories but are no longer the active pattern. See [worktree-setup.md](worktree-setup.md).
