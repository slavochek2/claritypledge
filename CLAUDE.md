# CLAUDE.md

This file provides guidance when working with code in this repository.

## Project Overview

The Clarity Pledge is a web application where professionals publicly commit to clear communication. Users sign a pledge via magic link authentication, receive a public profile page with a shareable certificate, and can collect endorsements from colleagues.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgreSQL + Auth) + Tailwind CSS + Radix UI

## Development Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint

# Testing
npm test                 # Run all tests with Vitest
npm test -- <file>       # Run specific test file
npm test -- --watch      # Watch mode
```

## Configuration

**Environment Variables:** Create `.env.local` from `.env.example`:
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Path Aliases:** Configured in [vite.config.ts](vite.config.ts:13-19) and [tsconfig.json](tsconfig.json:4-11):
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@lib/*` → `src/lib/*`

## Architecture

### Authentication Flow (CRITICAL)

The authentication system uses a **Reader-Writer pattern** to prevent race conditions:

1. **Reader** ([use-user.ts](src/hooks/use-user.ts)): Read-only hook that observes auth state and fetches user profiles. Never writes to database or handles redirects.

2. **Writer** ([auth-callback-page.tsx](src/polymet/pages/auth-callback-page.tsx)): Handles the critical transaction after magic link verification:
   - Verifies incoming session
   - Creates profile for new users (signup)
   - Redirects existing users to their profile (login)

**DO NOT move profile creation logic to hooks or global context.** This separation is intentional to avoid race conditions that occurred in earlier implementations.

### Data Layer ([api.ts](src/polymet/data/api.ts))

All Supabase interactions go through `src/polymet/data/api.ts`. Key patterns:

- **`createProfile()`**: Sends magic link only. Does NOT write to database. Profile creation happens in auth callback.
- **Database writes**: Profiles are created via `upsert()` in [auth-callback-page.tsx](src/polymet/pages/auth-callback-page.tsx:49-61) after email verification.
- **Profile fetching**: Profiles and witnesses are fetched separately (not via joins) to avoid Supabase PostgREST limitations.
- **Slug generation**: Slugs are created from names (`john-doe`) and must be unique. See `generateSlug()` and `ensureUniqueSlug()`.

### Database Schema ([schema.sql](supabase/schema.sql))

Two main tables with RLS policies:

**profiles table:**
- `id` (uuid, FK to auth.users)
- `slug` (unique, URL-friendly identifier)
- `email`, `name`, `role`, `linkedin_url`, `reason`
- `avatar_color`, `is_verified`, timestamps

**witnesses table:**
- `id`, `profile_id` (FK to profiles)
- `witness_name`, `witness_linkedin_url`
- `witness_profile_id` (optional FK if witness is also a user)
- `is_verified`, timestamps

**Trigger:** `handle_new_user()` creates profile on auth.users insert. Currently used as fallback; primary profile creation happens in auth callback.

### Component Organization

**UI Components** (`src/components/ui/`): Radix UI primitives (shadcn/ui pattern)
- Built with class-variance-authority for variants
- Styled with Tailwind CSS

**App Components** (`src/polymet/components/`):
- Feature components (pledge forms, certificates, witness lists)
- Navigation components in `navigation/` subdirectory
- Profile views split into owner/visitor views

**Pages** (`src/polymet/pages/`): Route components
- All pages wrapped in `ClarityLandingLayout`
- Routes defined in [App.tsx](src/App.tsx)

### Key Routes

- `/` - Landing page
- `/sign-pledge` - Pledge signup form
- `/auth/callback` - **Critical auth handler** (do not modify without understanding Reader-Writer pattern)
- `/p/:id` - Public profile pages (`:id` is slug, not UUID)
- `/clarity-champions` - Directory of verified signatories
- `/dashboard` - User dashboard (authenticated)
- `/verify/:id` - Email verification handler
- `/debug`, `/test-db`, `/diagnostic` - Debug utilities

## Type Definitions

Core types in [src/polymet/types/index.ts](src/polymet/types/index.ts):

```typescript
interface Profile {
  id: string;           // UUID from auth.users
  slug: string;         // URL-friendly identifier (used in routes)
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;
}

interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}
```

**Important:** Database uses snake_case, frontend uses camelCase. `mapProfileFromDb()` handles conversion.

## Common Gotchas

1. **Profile lookup**: Routes use `slug` (e.g., `/p/john-doe`), not UUID. Use `getProfileBySlug()` for routes, `getProfile(id)` when you have UUID.

2. **Auth race conditions**: The app previously had issues with "Profile Not Found" errors during auth. This was fixed by isolating profile creation in `auth-callback-page.tsx`. Don't create profiles elsewhere.

3. **Witness fetching**: Always fetch witnesses separately from profiles. Nested `select()` queries don't work reliably with Supabase.

4. **Email verification**: Users aren't "verified" until they click the magic link. Profile creation happens on callback, not during signup.

5. **Navigation state**: The app uses `SimpleNavigation` component to avoid auth state flicker. Check [clarity-navigation.tsx](src/polymet/components/clarity-navigation.tsx) for current implementation.

## Testing

Tests use Vitest + React Testing Library + jsdom:
- Setup file: [src/tests/setup.ts](src/tests/setup.ts)
- Test files colocated with components or in `src/tests/`
- Critical auth flow tests in [critical-auth-flow.test.tsx](src/tests/critical-auth-flow.test.tsx)

## Known Issues & Solutions

See README's "Common Issues" section and full troubleshooting in `TROUBLESHOOTING.md` (if it exists).

Most common issues relate to:
- Magic link auth configuration (redirect URLs)
- Profile creation timing (should only happen in auth callback)
- Supabase RLS policies
- Slug uniqueness

## Code Style Conventions

- React 19 patterns (no more FC type annotation needed)
- Hooks at component top
- Server state via Supabase queries (no global state library)
- Tailwind CSS for styling (utility-first)
- shadcn/ui patterns for UI components
- Comprehensive console logging in data layer for debugging
