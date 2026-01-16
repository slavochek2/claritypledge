# P24: Migrate from Vite to Next.js for SEO (v2 - Revised)

## Learnings from Attempt 1 (Branch: p24-nextjs-migration-attempt1)

### What Worked ✅
- Supabase SSR client setup (`@supabase/ssr` with server.ts + client.ts)
- Middleware for auth token refresh
- Profile pages with `generateMetadata()` for dynamic SEO
- File-based routing structure
- Build passes, TypeScript compiles

### What Failed ❌

#### 1. BrowserRouter Anti-Pattern (CRITICAL)
**Problem:** Agent wrapped ALL client components in `<BrowserRouter>` to avoid migrating react-router-dom hooks.

**Why it happened:** Components use `useNavigate()` and `useSearchParams()` from react-router-dom. Instead of migrating to Next.js equivalents, agent took shortcut.

**Impact:**
- Two routers fighting (Next.js App Router + react-router-dom)
- Defeats purpose of Next.js navigation
- 16 files affected

**Fix required:** Migrate ALL react-router-dom usage:
- `useNavigate()` → `useRouter()` from `next/navigation`
- `useSearchParams()` → `useSearchParams()` from `next/navigation`
- `<Link>` from react-router → `<Link>` from `next/link`
- `useLocation()` → `usePathname()` from `next/navigation`
- Remove `<BrowserRouter>` wrappers entirely

#### 2. Landing Page Not Actually SSR (CRITICAL)
**Problem:** `src/app/page.tsx` uses `dynamic(..., { ssr: false })` for the entire landing content.

**Why it happened:** Agent avoided dealing with client-side state in landing components.

**Impact:** Google sees only skeleton, no SEO benefit.

**Fix required:**
- Landing page sections that are static (HowItWorks, Benefits, FAQ) should be Server Components
- Only wrap truly interactive parts (forms, intersection observers) in client components
- NEVER use `ssr: false` on primary content

#### 3. Black Flash on Page Load (HIGH)
**Problem:** 1-second black flash before content appears.

**Why it happened:** `<body>` has no inline background color. CSS variables load late.

**Fix:** Add to layout.tsx:
```tsx
<body className="bg-background" style={{ backgroundColor: 'hsl(0 0% 100%)' }}>
```

#### 4. Vite Artifacts Not Cleaned (MEDIUM)
**Problem:** `src/main.tsx` still exists with `import.meta.env.VITE_*` references.

**Fix:** Delete `src/main.tsx`, clean up any remaining Vite files.

#### 5. ESLint Config Broken (MEDIUM)
**Problem:** References deprecated @typescript-eslint rules.

**Fix:** Update eslint.config.js for typescript-eslint v8+.

---

## Revised Strategy: Incremental Migration

Instead of one massive migration, do it in phases:

### Phase 1: React-Router Removal (Do FIRST, on main branch)
Before touching Next.js, remove react-router-dom dependency entirely:

1. Create `src/lib/navigation.ts` - wrapper for navigation functions
2. For Vite: implement with `window.location` or simple state
3. Update all components to use the wrapper
4. Now components are router-agnostic

### Phase 2: Next.js Foundation (Clean start)
With react-router removed, Next.js migration is straightforward:
1. Standard Next.js setup
2. Move components to file-based routes
3. No BrowserRouter workarounds needed

### Phase 3: SSR Optimization
After basics work:
1. Identify which components can be Server Components
2. Split landing page into server + client parts
3. Add `generateMetadata()` to dynamic routes

---

## What to Cherry-Pick from Attempt 1

These files are good and can be reused:

```bash
# Supabase SSR setup (correct)
src/lib/supabase/client.ts
src/lib/supabase/server.ts

# Middleware (correct)
src/middleware.ts

# Next.js config (correct)
next.config.mjs

# Profile page SSR pattern (correct except BrowserRouter)
src/app/p/[slug]/page.tsx  # Server component with generateMetadata
# BUT rewrite profile-page-client.tsx without BrowserRouter
```

### Do NOT reuse:
- Any `*-client.tsx` files (all have BrowserRouter)
- `src/app/page.tsx` (has ssr: false)
- `src/app/layout.tsx` (missing background fix)
- ESLint config

---

## Cloud Agent Instructions (Revised)

**Branch:** `feature/nextjs-migration-v2`
**Pre-requisite:** Complete Phase 1 (react-router removal) first
**Reference:** `p24-nextjs-migration-attempt1` branch for patterns

### Critical Rules (MUST FOLLOW)

1. **NEVER use BrowserRouter** - Next.js App Router is the only router
2. **NEVER use `ssr: false` on landing page content** - Defeats purpose
3. **ALWAYS add inline background color to body** - Prevent FOUC
4. **DELETE old Vite files** - src/main.tsx, vite.config.ts, etc.
5. **Migrate react-router hooks BEFORE starting Next.js work**

### Verification Checklist (Run at End)

```bash
# 1. No BrowserRouter in codebase
grep -r "BrowserRouter" src/ && echo "FAIL: BrowserRouter found" || echo "PASS"

# 2. No react-router-dom imports
grep -r "from 'react-router-dom'" src/ && echo "FAIL: react-router found" || echo "PASS"

# 3. Landing page is SSR (check for actual content in HTML)
curl -s http://localhost:3000 | grep -q "Stop Paying the Clarity Tax" && echo "PASS: Landing SSR" || echo "FAIL: Landing not SSR"

# 4. No Vite env vars
grep -r "import.meta.env" src/ && echo "FAIL: Vite env found" || echo "PASS"

# 5. No src/main.tsx
[ -f src/main.tsx ] && echo "FAIL: main.tsx exists" || echo "PASS"

# 6. Build succeeds
npm run build && echo "PASS: Build" || echo "FAIL: Build"

# 7. Lint passes (warnings OK, errors not OK)
npm run lint 2>&1 | grep -q "error" && echo "FAIL: Lint errors" || echo "PASS"
```

---

## Alternative: Simpler SEO Solution

If full Next.js migration is too costly, consider:

1. **Prerender.io / Rendertron** - Proxy that serves pre-rendered HTML to bots
2. **react-snap** - Static pre-rendering at build time
3. **Dynamic meta tags only** - Use react-helmet-async, accept client-side rendering

These are faster to implement but less robust than true SSR.

---

## Time Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Remove react-router | 2-3 hours | Low |
| Phase 2: Next.js foundation | 2-3 hours | Medium |
| Phase 3: SSR optimization | 2-3 hours | Low |
| **Total** | **6-9 hours** | Medium |

vs. Attempt 1: 4-6 hours budgeted, ~60% complete, major issues.

The extra time is because we're doing react-router removal properly first.
