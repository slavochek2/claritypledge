---
status: all-done
type: story
tags: []
rank: 125438.0
created_date: 2026-01-07
completed_at: '2026-02-09'
---

# P47: Prototypes Subdomain

## Status: CLOSED - Solved with Vercel Preview Deployments

## Original Problem

We're building experimental features in worktrees (3-7+) that need shareable URLs without polluting main app.

## Solution Found: Vercel Preview Deployments

Instead of building custom infrastructure, we discovered Vercel already provides this:

1. **Push worktree branch to GitHub** → Vercel auto-deploys
2. **Share the preview URL** → Public by default (after disabling Deployment Protection)
3. **Each branch = isolated deployment** → No bundle bloat, no risk to production

## Implementation (Done 2026-01-07)

### Branches pushed:
- `p38-variant-a-wt3` - Telegram Poll Flow
- `p38-variant-b-wt4` - Spatial Swipe Board
- `p38-variant-c-wt5` - Live Presence Minimal
- `p38-variant-d-wt6` - Desktop Power Dashboard
- `p38-variant-e-wt7` - Async Story Mode

### Vercel config:
- Added `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Preview environment
- Disabled Deployment Protection for public access

### Access pattern:
```
https://claritypledge-git-{branch-name}-slavas-projects-42f2b5c0.vercel.app/tree
```

## Why Original Plan Was Overkill

| Original Plan | What We Actually Needed |
|---------------|------------------------|
| Separate Vite app | Already have separate branches |
| Custom subdomain | Vercel preview URLs work fine |
| Gallery page | `/tree` route in each worktree |
| 1-2 hours setup | 5 minutes (push + add env vars) |

## Lessons Learned

1. **Check existing tools first** - Vercel previews existed all along
2. **Branches were local** - Worktrees weren't pushed to GitHub, so Vercel never saw them
3. **KISS wins** - No infrastructure needed, just git push
