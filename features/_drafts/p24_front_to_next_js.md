# P24: Migrate Public Pages to Next.js for SEO

## Problem

React SPA (Vite) renders client-side only. This hurts SEO:
- Google may not wait for JS to execute
- No server-rendered meta tags per page
- Social media previews show blank/generic content
- Core Web Vitals suffer from slower First Contentful Paint

## Solution

Migrate to Next.js App Router. Keep React — Next.js *is* React with a server layer.

## Scope

**Pages that need SSR/SSG (SEO benefit):**
- `/` — Landing page (SSG)
- `/about` — About page (SSG)
- `/p/:slug` — Public profiles (SSR)
- `/understanding-champions` — Directory (SSR)

**Pages that stay client-only (no SEO need):**
- `/sign-pledge` — Conversion funnel
- `/auth/callback` — Auth flow
- `/settings` — Authenticated
- `/clarity-partners/*` — App functionality

## What Stays the Same

- All React components
- Tailwind CSS + shadcn/ui
- Supabase as backend
- Auth flow logic (magic link)
- Business logic in hooks

## What Changes

| Before (Vite) | After (Next.js) |
|---------------|-----------------|
| `VITE_*` env vars | `NEXT_PUBLIC_*` env vars |
| React Router | Next.js App Router |
| `@supabase/auth-helpers-react` | `@supabase/ssr` |
| Single Supabase client | Server + Client Supabase clients |
| No middleware | Middleware for auth cookies |

## Known Risks

| Risk | Mitigation |
|------|------------|
| Supabase SSR auth cookies | Follow official `@supabase/ssr` docs, test magic link flow early |
| "use client" waterfall | Keep interactive components isolated, don't over-nest |
| `window` undefined errors | Check for browser APIs, use dynamic imports if needed |
| Auth redirect loops | Test callback flow on Vercel preview before merging |

## Effort Estimate

**Realistic:** 1-2 days with AI assistance

- 4-6 hours if everything works first try
- Full day for normal hiccups (auth, env vars, SSR errors)
- Budget second day for auth debugging

## Migration Phases

### Phase 1: SEO Win (MVP)
1. Set up Next.js project structure alongside existing code
2. Configure `@supabase/ssr` + middleware
3. Migrate 4 public pages to Server Components
4. Keep all interactive parts as Client Components (`"use client"`)
5. Update env vars (`VITE_*` → `NEXT_PUBLIC_*`)
6. Deploy to Vercel

### Phase 2: Cleanup (Later)
- Optimize data fetching patterns
- Convert more components to Server Components where beneficial
- Add streaming/suspense for profile pages

## Success Criteria

- [ ] Landing page renders HTML on first response (view-source shows content)
- [ ] `/p/:slug` profiles have unique meta tags per profile
- [ ] Social media previews show profile name + pledge info
- [ ] Magic link auth flow works end-to-end
- [ ] No regression in authenticated features

## Decision

**Full migration (Option A)** over hybrid approach because:
- Single codebase, simpler mental model
- Vercel-native (faster builds, better caching)
- Avoids shared auth state complexity between two apps
- App is still small enough to migrate cleanly
