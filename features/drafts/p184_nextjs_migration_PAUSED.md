---
status: draft
type: task
workstream: foundation
tags: []
rank: 125310.0
created_date: 2026-01-09
---
# P24: Next.js Migration - PAUSED

**Status:** PAUSED - 3-4 attempts failed, needs different approach
**Last Attempt:** 2026-01-09
**Preserved Branch:** `cloud-agent/execute-nextjs-migration-9608`
**Remote:** https://github.com/slavochek2/claritypledge (pushed)

---

## Summary

After 3-4 attempts at migrating from Vite to Next.js, we're pausing this effort. The migration is not impossible, but the current approach (AI agent executing large spec autonomously) isn't working.

---

## What Was Attempted

| Attempt | Branch/Location | Outcome |
|---------|-----------------|---------|
| 1 | worktree-2 (local) | Failed - tried hybrid Vite+Next.js, bundler conflicts |
| 2 | cloud-agent branch | 90% done - missing env vars, fixed, but not fully tested |
| 3 | worktree-3 (P25 spec) | Finalization spec written but unclear if executed |
| 4 | worktree-2 (current) | Build passes, routes 404, hydration errors, tests broken |

---

## Current State of Preserved Branch

**Branch:** `cloud-agent/execute-nextjs-migration-9608`

### What Works
- [x] `npm run build` - Passes (with warnings)
- [x] Landing page `/` - Renders with SSR
- [x] Sign pledge flow - Form works, redirects to confirmation
- [x] Profile pages `/p/[slug]` - Render with SSR
- [x] Dev server starts

### What's Broken
- [ ] **Hydration errors on /about** - Server/client HTML mismatch
- [ ] **Missing route /article** - Footer links to 404
- [ ] **All tests fail** - Missing `vitest.config.ts`, Vitest can't run
- [ ] **Lockfile corruption** - `npm` warns about SWC dependencies
- [ ] **43 files still import react-router-dom** - Mixed router usage
- [ ] **No manifest.json** - PWA broken

### Console Errors Observed
```
Error: Hydration failed because the initial UI does not match what was rendered on the server.
Warning: Expected server HTML to contain a matching <nav> in <div>
Failed to load resource: 404 /manifest.json
Failed to load resource: 404 /article
```

---

## Root Cause Analysis

### Why It Keeps Failing

1. **Task too large for autonomous AI execution**
   - Original spec: 936 lines, 7 checkpoints
   - Agent marks "complete" without verifying critical paths
   - No human checkpoint between implementation and "done"

2. **Verification gap**
   - AI can build code but can't truly verify it works
   - "Build passes" ≠ "App works"
   - Hydration errors and 404s not caught by `npm run build`

3. **Spec complexity mismatch**
   - Comprehensive specs are good for humans
   - AI agents skip steps, don't follow TDD pattern
   - Verification tests written but not actually run

4. **Architectural complexity underestimated**
   - Vite → Next.js is not just config change
   - Every file needs review for client/server boundary
   - Auth flow, routing, data fetching all change

---

## Lessons Learned

### What Doesn't Work

1. **Big-bang migration in one shot**
   - Too many moving parts
   - Too many things can break
   - Hard to debug when everything changes

2. **AI agent executing large specs autonomously**
   - Agent optimizes for "task complete" not "actually works"
   - No real user testing between steps
   - Claims completion prematurely

3. **TDD without enforcement**
   - Specs say "write test first"
   - Agent writes test, then code, but doesn't verify test passes
   - Tests exist but are never run

4. **Hybrid approaches mid-migration**
   - Running Vite and Next.js simultaneously is fragile
   - Creates confusion about which bundler serves what
   - Import paths become ambiguous

### What Might Work

1. **Tiny incremental PRs with human verification**
   - 1 route per PR
   - Human tests each PR before merge
   - Slower but reliable

2. **Simpler goal: Just OG tags**
   - If main goal is SEO/social sharing
   - Can achieve with Edge Functions alone
   - No full framework migration needed

3. **Full commitment (remove Vite first)**
   - If migrating, commit fully
   - Remove Vite before adding Next.js
   - No hybrid state

4. **Pair programming / human in loop**
   - AI writes code, human verifies
   - Catch hydration errors, 404s immediately
   - Don't batch multiple checkpoints

---

## When to Resume

Resume this migration when:

1. **Product is more stable** - Fewer active features in flux
2. **SEO becomes blocking** - Currently nice-to-have, not blocking
3. **Can dedicate 2-3 focused days** - Not async cloud agent sessions
4. **Have human verification at each step** - Not autonomous AI

---

## Alternative Approaches (If Needed Sooner)

### Option A: OG Tags Only (Edge Functions)
- Keep Vite SPA
- Add Vercel Edge middleware for meta tags
- 2-4 hours, no architecture change
- Gets 80% of SEO benefit

### Option B: Pre-rendering
- Use `vite-plugin-prerender` for static pages
- Pre-render landing, about, profiles at build time
- Still SPA, but HTML present for crawlers

### Option C: Fresh Start with Next.js
- New Next.js project from scratch
- Copy components one by one
- Start from known-good Next.js template
- More work upfront, less debugging

---

## Files to Archive

These specs are superseded by this document:
- `features/_drafts/p24_front_to_next_js.md` - Original 936-line spec
- `features/_drafts/p182_nextjs_migration_v2.md` - Fix-first attempt
- `features/_drafts/p181_incremental_nextjs_seo.md` - Incremental approach
- `features/p25_nextjs_finalization.md` - Finalization spec

All contain useful information but represent failed approaches.

---

## Preserved Work

The branch `cloud-agent/execute-nextjs-migration-9608` contains:
- Full Next.js App Router structure in `src/app/`
- Supabase SSR setup in `src/lib/supabase/`
- Middleware for auth token refresh
- ~90% of routes migrated (with issues)

This can be used as reference for future attempt, but should not be merged as-is.

---

## Decision

**PAUSE this effort.**

Focus on features that deliver user value. Revisit Next.js migration when:
- SEO becomes a blocking issue
- Product architecture stabilizes
- Can allocate dedicated human time for verification

---

*Last updated: 2026-01-09*
*Previous specs: p24_front_to_next_js.md, p182_nextjs_migration_v2.md, p181_incremental_nextjs_seo.md, p25_nextjs_finalization.md*
