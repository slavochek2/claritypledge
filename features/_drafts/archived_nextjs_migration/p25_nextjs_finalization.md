# P25: Next.js Migration Finalization

## Status: Ready for Finalization

The Next.js migration is ~80% complete but exists in a **separate worktree**.
Build passes, structure is correct, but tests need fixing.

## CRITICAL: Working Directory

**You are NOT working in the main repo.**

The Next.js migration lives in **worktree-3**:
```
/Users/slavochek/Documents/claritypledge-3
```

**Before doing ANYTHING**, change to that directory:
```bash
cd /Users/slavochek/Documents/claritypledge-3
```

All file paths in this document are relative to that worktree, NOT the main repo.

| Location | Path |
|----------|------|
| Main repo (Vite) | `/Users/slavochek/Documents/polymet-clarity-pledge-app` |
| **Worktree-3 (Next.js)** | `/Users/slavochek/Documents/claritypledge-3` |
| Branch | `nextjs-migration` |
| Dev server port | `localhost:5300` (per CLAUDE.md worktree convention) |

**Note:** The dev script currently says port 3000. Issue 6 below fixes this.

## Cloud Agent Instructions

**Worktree:** `/Users/slavochek/Documents/claritypledge-3` (branch `nextjs-migration`)
**Model:** Claude (use `/c claude [task]`)
**Workflow:** Use `/loop` for each fix
**Estimated Time:** 30-60 minutes

### Before Starting

```bash
# FIRST: Change to the correct worktree
cd /Users/slavochek/Documents/claritypledge-3

# Verify you're in the right place
pwd                    # Should show claritypledge-3
git branch             # Should show * nextjs-migration
git status             # Should be clean

# Check current state
npm test               # Will show 8 failures - that's expected
```

---

## What's Working

- [x] Build passes (`npm run build` - 19 routes)
- [x] TypeScript compiles (`npx tsc --noEmit`)
- [x] Next.js App Router structure (`src/app/`)
- [x] Supabase SSR configured (`src/lib/supabase/server.ts`, `client.ts`)
- [x] Middleware for auth refresh (`src/middleware.ts`)
- [x] Profile pages with SSR meta tags (`src/app/p/[slug]/page.tsx`)
- [x] Directory rename complete (`src/app` → `src/features`)
- [x] ESLint passes (warnings only, no errors)

---

## Critical Issues to Fix (3)

### Issue 1: Unit Tests Failing - "React is not defined"

**Location:** `src/tests/critical-auth-flow.test.tsx`
**Impact:** 8 of 10 tests fail with `ReferenceError: React is not defined`

**Root Cause:** Tests use JSX but React isn't in scope. The Vite config auto-imported React, but the new vitest setup may not.

**Fix Options:**

Option A - Add React import to test file:
```typescript
// At top of src/tests/critical-auth-flow.test.tsx
import React from 'react';
```

Option B - Update vitest.config.ts to auto-import React:
```typescript
// In vitest.config.ts, ensure:
esbuild: {
  jsxInject: `import React from 'react'`
}
// OR ensure jsxImportSource is configured
```

**Verification:** `npm test` should show 10 passed, 0 failed.

---

### Issue 2: Dead Vite Code (src/main.tsx)

**Location:** `src/main.tsx`
**Impact:** Contains `import.meta.env.VITE_*` references that don't work in Next.js

**Current Content:**
- Sentry initialization with `import.meta.env.VITE_SENTRY_DSN`
- LogRocket initialization with `import.meta.env.PROD`
- React DOM render (not used by Next.js)

**Fix:**
```bash
rm src/main.tsx
```

**Note:** If you want to keep Sentry/LogRocket, move initialization to `src/app/providers.tsx`:
```typescript
// In providers.tsx, add:
useEffect(() => {
  if (process.env.NODE_ENV === 'production') {
    // Sentry
    import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: 'production',
      });
    });

    // LogRocket
    import('logrocket').then((LogRocket) => {
      LogRocket.default.init('alblur/claritypledge');
    });
  }
}, []);
```

**Verification:** `grep -r "import.meta.env.VITE" src/` should return nothing.

---

### Issue 3: react-router-dom Import in Auth Callback

**Location:** `src/app/auth/callback/complete/auth-callback-complete.tsx`
**Line 16:** `import { BrowserRouter } from 'react-router-dom';`

**Problem:** Next.js uses `next/navigation`, not react-router-dom. The BrowserRouter wrapper is incompatible with App Router.

**Fix:**

1. Remove the import:
```typescript
// DELETE this line:
import { BrowserRouter } from 'react-router-dom';
```

2. Remove the BrowserRouter wrapper from the component (around line 114):
```typescript
// BEFORE:
<BrowserRouter>
  <AuthProvider>
    <AuthCallbackContent />
  </AuthProvider>
</BrowserRouter>

// AFTER:
<AuthProvider>
  <AuthCallbackContent />
</AuthProvider>
```

**Note:** AuthProvider should already be provided by the root layout's providers.tsx, so you may be able to remove that wrapper too. Test to verify.

**Verification:** `grep -r "BrowserRouter" src/` should return nothing.

---

## Medium Issues (Optional but Recommended)

### Issue 4: Missing Checkpoint Tests (2-7)

The original tech-spec (`features/_drafts/p24_front_to_next_js.md`) defined verification tests for checkpoints 2-7, but only `__tests__/checkpoint-1.test.ts` exists.

**Options:**
- Create the remaining tests (recommended for regression safety)
- Verify manually and document that tests are skipped

**Manual Verification Commands:**
```bash
# Checkpoint 2: Landing page SSR
curl -s http://localhost:5300 | grep -q "Clarity Pledge" && echo "PASS" || echo "FAIL"

# Checkpoint 3: Profile page SSR (requires test user in DB)
curl -s http://localhost:5300/p/test-user | grep -q "og:title" && echo "PASS" || echo "FAIL"

# Checkpoint 4: Static pages
curl -s http://localhost:5300/about | grep -q "About" && echo "PASS" || echo "FAIL"

# Checkpoint 5: Auth routes exist
curl -s -o /dev/null -w "%{http_code}" http://localhost:5300/sign-pledge | grep -q "200" && echo "PASS" || echo "FAIL"
```

### Issue 5: ESLint Warnings (19 total)

All warnings are `react-refresh/only-export-components` - harmless for production but affect hot reload in dev.

**Fix (if desired):** Split files that export both components and non-components (constants, types).

### Issue 6: Wrong Dev Server Port (MUST FIX)

**Location:** `package.json`
**Current:** `"dev": "next dev --port 3000"`
**Should be:** `"dev": "next dev --port 5300"`

Per CLAUDE.md, worktree-3 must run on port 5300 to avoid conflicts with other worktrees.

**Fix:**
```json
// In package.json, change the dev script:
"dev": "next dev --port 5300"
```

---

## Verification Checklist

After all fixes, run these commands **from the worktree directory**:

```bash
# Ensure you're in the right directory
cd /Users/slavochek/Documents/claritypledge-3

# Must all pass
npm test                                    # 0 failures
npm run build                               # Succeeds
npm run lint                                # No errors (warnings OK)
grep -r "import.meta.env.VITE" src/         # No output
grep -r "BrowserRouter" src/                # No output
ls src/main.tsx 2>/dev/null || echo "OK"    # Should print "OK"

# Manual verification (start dev server first)
npm run dev &
sleep 5
curl -s http://localhost:5300 | grep -q "Clarity Pledge" && echo "Landing: OK"
curl -s http://localhost:5300/about | grep -q "About" && echo "About: OK"
```

---

## Success Criteria

Migration is complete when:

1. **All unit tests pass** - `npm test` shows 0 failures
2. **Build succeeds** - `npm run build` completes without errors
3. **No Vite references** - No `import.meta.env.VITE_*` in codebase
4. **No react-router-dom in App Router** - BrowserRouter removed from auth callback
5. **Visual verification** - Landing page, profile page, and auth flow work

---

## After Completion

**All commands from worktree-3:**

```bash
cd /Users/slavochek/Documents/claritypledge-3
```

1. Commit the fixes:
```bash
git add -A
git commit -m "fix: Complete Next.js migration - fix tests, remove Vite artifacts"
```

2. Optionally merge to main (or wait for full E2E testing):
```bash
# From the MAIN repo (not the worktree)
cd /Users/slavochek/Documents/polymet-clarity-pledge-app
git merge nextjs-migration
```

---

## Rollback

If something breaks badly:
```bash
git checkout main
```

The `nextjs-migration` branch preserves all progress.

---

## Reference

- Original tech-spec: `features/_drafts/p24_front_to_next_js.md`
- Code review findings: This document was created based on adversarial review of worktree-3
