---
status: all-done
type: comment
tags: []
rank: 125418.0
created_date: 2026-01-07
completed_at: '2026-02-09'
---

# P182: Next.js Migration (v2 - Fix-First Strategy)

## Cloud Agent Instructions

**Starting Branch:** `origin/cloud-agent/execute-the-nextjs-4883` (previous attempt, ~90% complete)
**Target Branch:** `feature/nextjs-migration-v2`
**Model:** Claude Opus 4.5 (use `/c claude [task]`)
**Time Budget:** ~2-3 hours

### Strategy: Fix First, Then Fresh if Needed

A previous cloud agent attempted this migration and got ~90% done. The landing page and profile pages work with SSR. Some issues remain.

**Phase 1: Try to fix the existing work (budget: 1.5 hours)**
- Start from the previous attempt
- Identify and fix remaining issues
- If successful, you're done

**Phase 2: Start fresh only if Phase 1 fails (budget: 1.5 hours)**
- Document what went wrong in Phase 1
- Apply learnings to a clean migration
- Simpler approach: fewer files, no TDD overhead

---

## Setup

```bash
# Checkout the previous attempt
git fetch origin
git checkout -B feature/nextjs-migration-v2 origin/cloud-agent/execute-the-nextjs-4883

# Ensure env vars are set (CRITICAL - previous failure was missing these)
cat >> .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
EOF

# Install and start
npm install
npm run dev
```

---

## Phase 1: Fix Existing Work

### What's Working (verified)
- ✅ Landing page (`/`) - full SSR, all sections render
- ✅ Profile pages (`/p/[slug]`) - SSR with dynamic meta tags
- ✅ Supabase server client - queries work
- ✅ Navigation - links work

### What Needs Verification
Test each of these with Playwright MCP. Fix any that fail:

1. **Auth flow** (`/sign-pledge` → magic link → `/auth/callback`)
   - Sign up form submits
   - Magic link email sends (check Supabase logs)
   - Callback creates profile

2. **Protected routes** (`/settings`)
   - Redirects to sign-in if not authenticated
   - Shows settings if authenticated

3. **Other pages**
   - `/about` - static content
   - `/pledgers` or `/understanding-champions` - list of profiles
   - `/privacy-policy`, `/terms-of-service` - legal pages
   - `/live` - live meeting feature
   - `/demo` - demo page

4. **Client-side interactivity**
   - FAQ accordion expands/collapses
   - Witness form submits
   - Navigation menu (mobile)

### Fix Strategy

For each broken feature:
1. Check browser console for errors
2. Check server terminal for errors
3. Identify root cause (missing "use client", wrong import, etc.)
4. Fix minimally - don't refactor working code
5. Verify fix with Playwright MCP
6. Commit: `fix: [description]`

### Common Issues to Watch For

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| "process is not defined" | Missing `NEXT_PUBLIC_` env var | Add to `.env.local` |
| "useState is not defined" | Missing "use client" directive | Add `'use client'` at top of file |
| 404 on route | Missing `page.tsx` in route folder | Create the route |
| Hydration mismatch | Server/client render different HTML | Use `useEffect` for client-only code |
| "cookies() should be awaited" | Next.js 14+ async cookies | Add `await` before `cookies()` |

---

## Phase 2: Fresh Start (Only if Phase 1 Fails)

If after 1.5 hours you cannot get the existing work stable, start fresh.

### Document First

Before starting fresh, write to `docs/nextjs-migration-blockers.md`:
- What specific issues couldn't be fixed
- Root cause analysis
- What you learned

### Fresh Migration (Simplified)

**Key differences from original spec:**
1. **No hybrid approach** - Remove Vite completely before starting Next.js
2. **No TDD overhead** - Just verify manually with Playwright MCP
3. **Fewer checkpoints** - Landing page → Profile pages → Auth → Done

```bash
# Start fresh from main
git checkout main
git checkout -b feature/nextjs-migration-fresh

# Remove Vite
rm vite.config.ts
npm uninstall vite @vitejs/plugin-react vite-plugin-pwa

# Install Next.js
npm install next@14 @supabase/ssr
```

**Minimal file structure:**
```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout (globals, providers)
│   ├── page.tsx            # Landing page
│   ├── p/[slug]/page.tsx   # Profile pages
│   ├── auth/callback/route.ts  # Auth callback
│   └── [...catchall]/page.tsx  # Catch-all for other routes
├── features/               # Existing app code (renamed from src/app)
├── components/ui/          # Unchanged
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser client
│       └── server.ts       # Server client
└── middleware.ts           # Auth token refresh
```

**Critical: Don't rename `src/app` to `src/features`**

The original spec renamed `src/app` → `src/features` which caused massive import churn. Instead:
- Keep existing code where it is
- Create new `src/app-next/` for Next.js routes (or use root-level `app/`)
- Routes import from existing locations

---

## Success Criteria

- [ ] `npm run build` succeeds with no errors
- [ ] Landing page loads with SSR (check view-source)
- [ ] Profile page `/p/test-user` shows correct meta tags
- [ ] Auth flow works (sign up → magic link → profile created)
- [ ] No console errors on main pages
- [ ] Playwright MCP visual check passes for: landing, profile, sign-pledge

---

## Environment Variables

The `.env.local` must have:
```env
# Required for Next.js
NEXT_PUBLIC_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>

# Keep Vite vars for any legacy code
VITE_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

---

## Learnings from Previous Attempts

### Attempt 1 (worktree-2, local)
- **Error:** "process is not defined" in Next.js client code
- **Cause:** Tried to run Vite and Next.js simultaneously (hybrid approach)
- **Lesson:** Don't mix bundlers. Remove Vite completely.

### Attempt 2 (cloud agent)
- **Error:** "Supabase URL and Key required"
- **Cause:** `.env.local` had `VITE_*` vars but not `NEXT_PUBLIC_*` vars
- **Lesson:** Always add both env var prefixes during migration
- **Status:** ~90% working after adding env vars. Landing + profiles work.

---

## Autonomous Mode Rules

1. **DO NOT use AskUserQuestion** — make reasonable decisions
2. **Fix minimally** — don't refactor working code
3. **Commit frequently** — enables rollback
4. **Use Playwright MCP** for visual verification
5. **If stuck 3+ times on same issue:**
   - Document the blocker
   - Move to Phase 2 (fresh start)
   - Apply learnings from Phase 1
