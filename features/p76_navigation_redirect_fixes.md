# Tech-Spec: Navigation & Post-Auth Redirect Fixes

**Created:** 2026-01-19
**Status:** Ready for Development

## Overview

### Problem Statement

1. **Event RSVP flow is broken:** When unauthenticated users click RSVP on an event, they're redirected to signup with `?redirect=/events/{slug}&action=rsvp` params. However, these params are lost during auth — `signInWithEmail()` and `signInWithGoogle()` only pass `source` to the callback URL. Users land on dashboard instead of the event, causing drop-off before completing RSVP.

2. **Back buttons inconsistent:** Some logged-in pages send users to landing page (`/`) instead of dashboard (`/home`). Settings goes to user's profile, but should go to `/home`. Events detail goes to `/events` list, but for logged-in users dashboard makes more sense. Profile page has no back button.

3. **Login↔Signup switch loses params:** Both directions use `window.location.href` which drops all URL params when switching.

### Solution

1. Add generic `redirect` and `action` params support to auth functions
2. Pass these params through signup/login pages and Google OAuth
3. Update back buttons to respect logged-in state → dashboard

### Scope

**In Scope:**
- Fix event RSVP redirect flow (magic link + Google OAuth)
- Fix back buttons: settings→dashboard, events→dashboard (logged in), profile→dashboard (logged in)
- Preserve URL params when switching between login/signup

**Out of Scope:**
- Pledge completion redirect (dashboard is fine for now)
- Standardizing back button visual styles (works, just inconsistent)
- Other post-auth redirect scenarios (general signup/login → dashboard is correct)

## Context for Development

### Codebase Patterns

- Auth functions in `src/app/data/api.ts`
- Auth callback handling in `src/auth/AuthCallbackPage.tsx`
- Navigation components in `src/app/components/layout/`
- Back buttons use `<Link to="...">` pattern with `ArrowLeft` icon

### Files to Modify

| File | Change |
|------|--------|
| `src/app/data/api.ts` | Add `redirect`/`action` params to `signInWithEmail()` and `signInWithGoogle()` |
| `src/app/pages/signup-page.tsx` | Read and pass `redirect`/`action` params to auth functions |
| `src/app/pages/login-page.tsx` | Preserve params on login↔signup switch (bidirectional) |
| `src/app/components/pledge/login-form.tsx` | Pass params through if present |
| `src/app/components/auth/google-auth-button.tsx` | Accept and pass `redirect`/`action` props |
| `src/app/pages/settings-page.tsx` | Change back button from profile (`/p/slug`) to `/home` |
| `src/app/pages/profile-page.tsx` | Add conditional back button: `/home` if logged in, `/` if not |
| `src/app/prototypes/events/components/EventDetail.tsx` | Back button → `/home` if logged in, `/events` if not |

### Technical Decisions

1. **URL params over localStorage:** Simpler, stateless, survives browser refresh, works with magic links
2. **Conditional back buttons:** Check `useAuth()` session, render different `<Link to="...">` based on auth state
3. **Generic redirect support:** Auth functions accept optional `redirect` string, append to callback URL if provided
4. **Invalid redirect fallback:** If redirect URL is malformed or non-existent, fall back to `/home`

## Implementation Plan

### Tasks

- [ ] Task 1: Update `signInWithEmail()` to accept and forward `redirect` and `action` params
- [ ] Task 2: Update `signInWithGoogle()` to accept and forward `redirect` and `action` params
- [ ] Task 3: Update `signup-page.tsx` to read URL params and pass to auth functions
- [ ] Task 4: Update `login-page.tsx` and `signup-page.tsx` to preserve URL params when switching (bidirectional)
- [ ] Task 5: Update `login-form.tsx` to support redirect params (if used standalone)
- [ ] Task 6: Update `GoogleAuthButton` to accept `redirect` and `action` props
- [ ] Task 7: Update `settings-page.tsx` back button → `/home`
- [ ] Task 8: Add `profile-page.tsx` back button → conditional (logged in: `/home`, else: `/`)
- [ ] Task 9: Update `EventDetail.tsx` back button → conditional (logged in: `/home`, else: `/events`)
- [ ] Task 10: Test full event RSVP flow (magic link path)
- [ ] Task 11: Test full event RSVP flow (Google OAuth path)
- [ ] Task 12: Test back buttons on all affected pages

### Acceptance Criteria

- [ ] AC1: Given I'm not logged in and click RSVP on an event, when I complete signup via magic link, then I land on `/events/{slug}/confirm` with RSVP auto-completed
- [ ] AC2: Given I'm not logged in and click RSVP on an event, when I complete signup via Google OAuth, then I land on `/events/{slug}/confirm` with RSVP auto-completed
- [ ] AC3: Given I'm on the login page with `?redirect=/events/test&action=rsvp` params, when I click "Create account" to switch to signup, then the URL params are preserved
- [ ] AC3b: Given I'm on the signup page with `?redirect=/events/test&action=rsvp` params, when I click "Log in" to switch to login, then the URL params are preserved
- [ ] AC4: Given I'm logged in and on the Settings page, when I click the back button, then I navigate to `/home` (dashboard)
- [ ] AC5: Given I'm logged in and viewing my profile (`/p/my-slug`), when I click the back button, then I navigate to `/home` (dashboard)
- [ ] AC6: Given I'm logged in and viewing an event detail page, when I click the back button, then I navigate to `/home` (dashboard)
- [ ] AC7: Given I'm NOT logged in and viewing a public profile, when I click the back button, then I navigate to `/` (landing)

## Additional Context

### Dependencies

- No new dependencies required
- Uses existing `useAuth()` hook for auth state detection
- Uses existing `useSearchParams()` and `useLocation()` for URL param handling

### Testing Strategy

- Unit test: Verify auth functions build correct redirect URLs with params
- Manual E2E: Complete event RSVP flow via both magic link and Google OAuth
- Manual: Verify back buttons on settings, profile, events pages
- **Verify during testing:** Google OAuth preserves `redirect`/`action` params through Supabase round-trip (if not, add localStorage fallback)

### Notes

- `AuthCallbackPage.tsx` already has logic to handle `action=rsvp` and `redirect` params (lines 390-427) — we're just ensuring params reach it
- Event RSVP already works for logged-in users (direct RSVP, no auth needed)
- The `/signup?redirect=...&action=rsvp` pattern is already used in `EventDetail.tsx:124`, just needs the params forwarded through auth
