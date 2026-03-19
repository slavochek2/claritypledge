---
status: in-progress
type: story
rank: 250008.75
workstream: foundation
created_date: 2026-03-19
flow: dev
tags: [performance, ux]
---

# P555: Eliminate double loading for signed-in users

## Problem

Signed-in users hitting `/` see two sequential loading states:
1. **ClarityPageLoader** (~300-500ms) — HomeRedirect waits for `sessionChecked` AND `!isLoading` (profile fetch)
2. **FeedSkeleton** (~200-800ms) — feed queries run after redirect to `/feed`

Total perceived wait: 500-1300ms of loaders before content.

## Root Cause (verified by /challenge-prd)

Supabase already caches auth sessions in localStorage — `getSession()` resolves in ~10ms. The real bottleneck is:
- `HomeRedirect` waits for **profile fetch** to complete (via `isLoading`) before redirecting
- Profile fetch is 200-500ms (network round-trip to Supabase)
- Only THEN does the redirect to `/feed` happen, triggering another round of data fetching

**Decision:** No localStorage auth hint needed (BLOCK from challenge-prd). Supabase handles this.

## Solution

### 1. Redirect on session check, not profile fetch (eliminates Loader #1)

Change `HomeRedirect` to redirect as soon as `sessionChecked=true` AND `session !== null`, WITHOUT waiting for `isLoading=false`.

**Current:**
```typescript
if (!sessionChecked || isLoading) return <ClarityPageLoader />;
if (showUserMenu) return <Navigate to="/feed" />;  // waits for profile
```

**Proposed:**
```typescript
if (!sessionChecked) return <ClarityPageLoader />;
if (session) return <Navigate to="/feed" />;  // redirects immediately
// anonymous → show landing
```

This means the redirect happens ~10ms after mount (localStorage session read) instead of 300-500ms (after profile fetch).

**Trade-off:** The nav bar won't show the user avatar immediately on /feed — it will appear after profile loads. This is acceptable because the feed content loads independently.

### 2. Self-host Google Fonts (eliminates 700ms font chain)

Lighthouse showed a 3-hop font waterfall: HTML → CSS → Google Fonts API → .woff2 file = 700ms. Self-hosting the fonts eliminates 2 hops.

Download Playfair Display and Inter woff2 files, serve from `/fonts/`, update CSS.

## Decisions

- **No localStorage auth hint** — Supabase already caches sessions. Adding a second cache creates divergent state for zero gain.
- **No navigation progress indicator** — `react-router-dom` v6 with `BrowserRouter` doesn't support `useNavigation()`. Would require migrating to `createBrowserRouter` — too much scope.
- **No feed prefetch** — `getPublicPointsFeed` requires `viewerUserId` for position data. Prefetching without it would cause a flash when positions appear. Not worth the complexity.

## Key Files

- `src/App.tsx:61-85` — HomeRedirect component
- `src/hooks/use-nav-auth-state.ts` — provides sessionChecked, isLoading, showUserMenu
- `src/auth/AuthContext.tsx` — auth state management
- `index.html` — Google Fonts link
- `src/index.css` — font-face declarations

## Acceptance Criteria

- [ ] Signed-in user hitting `/` redirects to /feed within ~50ms (no ClarityPageLoader visible)
- [ ] Anonymous user hitting `/` sees landing page immediately (no loader)
- [ ] Nav bar avatar appears after profile loads (acceptable delay)
- [ ] Google Fonts self-hosted — no external font requests on initial load
- [ ] No console errors introduced
- [ ] Existing auth flows (login, logout, signup, callback) still work

## Testing

- E2E: Authenticated user redirect speed (no loader visible)
- E2E: Anonymous user sees landing immediately
- E2E: Auth flows still work after change
- E2E: No external Google Fonts requests
