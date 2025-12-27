# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

## Project Overview

The Clarity Pledge is a web application where professionals publicly commit to clear communication. Users sign a pledge via magic link authentication, receive a public profile page with a shareable certificate, and can collect endorsements from colleagues.

**Domain:** `claritypledge.com` (old domain `understandingpledge.com` redirects via Vercel)

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgreSQL + Auth) + Tailwind CSS + Radix UI

## Development Commands

```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint

# Unit Tests (Vitest)
npm test                 # Run all unit tests
npm test -- <file>       # Run specific test file
npm test -- --watch      # Watch mode

# E2E Tests (Playwright)
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # Run with Playwright UI
npm run test:e2e:headed  # Run in headed browser
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

## Project Structure

```
/
├── docs/                     # Documentation (not deployed)
│   └── technical/            # Technical guides (auth, db, testing, e2e)
│
├── features/                 # Feature planning
│   ├── done/                 # Completed feature docs
│   └── *.md                  # Active features (p4_*, p5_*, etc.)
│
├── e2e/                      # Playwright E2E tests
│   └── helpers/              # Test utilities
│
├── src/                      # Application source code
│   ├── app/                  # Main application
│   │   ├── components/       # Feature components (organized by domain)
│   │   ├── content/          # App content (articles, copy)
│   │   ├── data/             # API layer (api.ts)
│   │   ├── layouts/          # Layout components
│   │   ├── pages/            # Route pages
│   │   └── types/            # TypeScript interfaces
│   ├── auth/                 # Auth module (Reader-Writer pattern)
│   ├── components/ui/        # Base UI (shadcn/ui)
│   ├── hooks/                # Shared React hooks
│   ├── lib/                  # Utilities (supabase clients)
│   └── tests/                # Unit tests (Vitest)
│
└── supabase/                 # Database (schema.sql, RLS)
```

### Conventions

- **docs/technical/** - How things work (for developers)
- **features/** - What we're building (planning docs, prefix: `p{N}_{name}.md`)
- **src/app/** - All application code lives here
- **src/app/content/** - All app content (articles, copy)

## Architecture

### Authentication Flow (CRITICAL)

The authentication system uses a **Reader-Writer pattern** to prevent race conditions:

1. **Reader** ([useAuth.ts](src/auth/useAuth.ts)): Read-only hook that observes auth state and fetches user profiles. Never writes to database or handles redirects. Import via `import { useAuth } from '@/auth'`.

2. **Writer** ([AuthCallbackPage.tsx](src/auth/AuthCallbackPage.tsx)): Handles the critical transaction after magic link verification:
   - Verifies incoming session
   - Creates profile for new users (signup)
   - Redirects existing users to their profile (login)

The auth module (`src/auth/`) is a self-contained feature module with its own public API via `index.ts`. Import from `@/auth`, never from internal files directly.

**DO NOT move profile creation logic to hooks or global context.** This separation is intentional to avoid race conditions that occurred in earlier implementations.

### Data Layer ([api.ts](src/app/data/api.ts))

All Supabase interactions go through `src/app/data/api.ts`. Key patterns:

- **`createProfile()`**: Sends magic link only. Does NOT write to database. Profile creation happens in auth callback.
- **Database writes**: Profiles are created via `upsert()` in [AuthCallbackPage.tsx](src/auth/AuthCallbackPage.tsx) after email verification.
- **Profile fetching**: Profiles and witnesses are fetched separately (not via joins) to avoid Supabase PostgREST limitations.
- **Slug generation**: Slugs are created from names (`john-doe`) and must be unique. On conflict, sequential suffixes are used (`john-doe-2`, `john-doe-3`). This is intentional for memorable URLs - timestamp fallback only after 3 retries. See `generateSlug()` in api.ts and slug conflict handling in AuthCallbackPage.tsx.

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

**RLS Design Decision:** The witnesses insert policy intentionally allows ANY authenticated user to add witnesses to ANY profile. This enables users to endorse someone's pledge without requiring the endorsee to have an account. This is a feature, not a security gap.

**Note:** There is NO database trigger for profile creation. The old `handle_new_user()` trigger was removed (2025-12-04) because it created profiles with NULL slugs. Profile creation happens ONLY in AuthCallbackPage.tsx after email verification.

**Client-Side Slug Generation Trade-off:** The slug conflict resolution logic in AuthCallbackPage.tsx runs in the browser, not in a database function. This is a deliberate trade-off:
- **Why not server-side:** Supabase doesn't support custom server functions without Edge Functions, which adds deployment complexity.
- **Safety guarantees:** The retry loop (up to 3 attempts) with timestamp fallback ensures eventual success. Worst case: user gets `john-doe-1733270400000` instead of `john-doe-2`.
- **Risk accepted:** If browser closes mid-transaction, user can re-verify via magic link. No data corruption possible.

### Component Organization

**UI Components** (`src/components/ui/`): Radix UI primitives (shadcn/ui pattern)
- Built with class-variance-authority for variants
- Styled with Tailwind CSS

**App Components** (`src/app/components/`):
- Feature components (pledge forms, certificates, witness lists)
- Navigation components in `navigation/` subdirectory
- Profile views split into owner/visitor views

**Pages** (`src/app/pages/`): Route components
- All pages wrapped in `ClarityLandingLayout`
- Routes defined in [App.tsx](src/App.tsx)

### Key Routes

- `/` - Landing page
- `/sign-pledge` - Pledge signup form
- `/auth/callback` - **Critical auth handler** (do not modify without understanding Reader-Writer pattern)
- `/p/:id` - Public profile pages (`:id` is slug, not UUID)
- `/understanding-champions` - Directory of verified signatories (old `/clarity-champions` redirects here)
- `/about` - About page with founder story and contact form
- `/settings` - User settings (authenticated)

## Type Definitions

Core types in [src/app/types/index.ts](src/app/types/index.ts):

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

2. **Auth race conditions**: The app previously had issues with "Profile Not Found" errors during auth. This was fixed by isolating profile creation in `AuthCallbackPage.tsx` (in `src/auth/`). Don't create profiles elsewhere.

3. **Witness fetching**: Always fetch witnesses separately from profiles. Nested `select()` queries don't work reliably with Supabase.

4. **Email verification**: Users aren't "verified" until they click the magic link. Profile creation happens on callback, not during signup.

5. **Navigation state**: The app uses `SimpleNavigation` component to avoid auth state flicker. Check [clarity-navigation.tsx](src/app/components/clarity-navigation.tsx) for current implementation.

## Testing

**Unit Tests** (Vitest + React Testing Library + jsdom):
- Setup: [src/tests/setup.ts](src/tests/setup.ts)
- Location: `src/tests/` or colocated with components
- Critical tests: [critical-auth-flow.test.tsx](src/tests/critical-auth-flow.test.tsx)

**E2E Tests** (Playwright):
- Location: `e2e/*.spec.ts`
- Helpers: [e2e/helpers/test-user.ts](e2e/helpers/test-user.ts)
- Config: [playwright.config.ts](playwright.config.ts)
- Requires: `.env.test.local` with `SUPABASE_SERVICE_ROLE_KEY`
- Full guide: [docs/technical/e2e-testing.md](docs/technical/e2e-testing.md)

## Known Issues

- Magic link auth requires correct redirect URLs in Supabase dashboard
- Profile creation must only happen in auth callback (not hooks)
- E2E tests: 6 skipped due to browser session detection limitation (see [e2e-testing.md](docs/technical/e2e-testing.md))

## Technical Debt / Intentional Decisions

- **Web3Forms API key in source**: The contact form on `/about` uses Web3Forms with a hardcoded access key. This is intentional - Web3Forms access keys are designed to be public (like Stripe publishable keys). Moving to env var is nice-to-have.
- **Mixpanel token in index.html**: Similarly, Mixpanel tokens are client-side by design. Environment variable would be cleaner but not a security issue.
- **"Clarity" naming in code**: Component names use "Clarity" prefix (e.g., `ClarityPledgeApp`, `ClarityChampionsPage`) which matches the brand name "Clarity Pledge".
- **Pledge Version 1 shows "Clarity Pledge"**: In `pledge-text.tsx`, version 1 of the pledge intentionally keeps the original "Clarity Pledge" title for historical accuracy. Users who signed v1 see their original pledge text.

## Design System

**Specification:** [docs/bmad/ux-design-specification.md](docs/bmad/ux-design-specification.md)

The landing page is the source of truth for visual design. All new UI should follow these patterns:

### Colors
| Token | Usage |
|-------|-------|
| `blue-500` | Primary CTA, accent icons, interactive elements |
| `blue-600` | Hover states |
| `blue-50` | Highlight backgrounds |
| `green-500/600` | Success states only (e.g., "accepted", "verified") |
| `red-500` | Recording indicator, destructive actions |
| `primary` (dark) | Own message bubbles |
| `muted` | Other message bubbles, secondary backgrounds |

### Do NOT use
- `amber-*` colors (use `blue-*` with animation for pending states)
- `orange-*` colors (use `blue-*` with messaging for retry states)
- Multiple semantic color palettes for similar concepts

### Button Patterns
```tsx
// Primary CTA (blue)
className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md"

// Secondary/Outline
className="border border-input bg-background hover:bg-accent rounded-md"

// Action pill (e.g., "Explain back")
className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full px-3 py-1.5 text-xs font-medium"
```

### Status Badges
```tsx
// Accepted/Success
className="bg-green-50 text-green-700 border border-green-200 rounded-md"

// Pending/In Progress
className="bg-blue-50 text-blue-700 border border-blue-200 rounded-md"
```

### Excalidraw Wireframe Colors

When creating wireframes in Excalidraw (`.excalidraw` files), use these hex colors consistently:

| Element Type | Stroke | Background | Text | When to use |
|--------------|--------|------------|------|-------------|
| **Primary button** | `#3b82f6` | `#3b82f6` | `#ffffff` | Main CTAs ("Let Me Explain Back") |
| **Secondary button** | `#e0e0e0` | `#ffffff` | `#1e1e1e` | Alternative actions ("Good Enough") |
| **Your status/action** | `#bfdbfe` | `#eff6ff` | `#1e40af` | "You're speaking...", "You rated: 6/10" |
| **Other person's status** | `#e0e0e0` | `#f5f5f5` | `#757575` | "Slava finished speaking", "Gosha speaking..." |
| **Content/Quotes** | `#e0e0e0` | `#fafafa` | `#1e1e1e` | "You said:...", transcript boxes |
| **Success state** | `#22c55e` | `#dcfce7` | `#166534` | ONLY for verified/confirmed ("Understanding Verified!") |
| **Recording indicator** | `#ef4444` | `#ef4444` | - | Red dot only |
| **Phone frame** | `#1e1e1e` | `#ffffff` | - | Device outline |
| **Footer area** | `#e0e0e0` | `#f5f5f5` | - | Bottom status bar |

**Key rules:**
- Blue = YOUR actions/status (things you do or your data)
- Gray = OTHER person's actions/status or neutral info
- Green = SUCCESS only (verified, confirmed, connected)
- Never use yellow/amber/orange/purple
- Buttons that look clickable should be blue (primary) or outlined (secondary)
- Info banners should be gray, NOT blue (blue implies interactivity)

## Code Style Conventions

- React 19 patterns (no more FC type annotation needed)
- Hooks at component top
- Server state via Supabase queries (no global state library)
- Tailwind CSS for styling (utility-first)
- shadcn/ui patterns for UI components
- Comprehensive console logging in data layer for debugging

## Code Quality Principles

### DRY (Don't Repeat Yourself)
- Before writing new code, search for existing implementations that can be reused
- Extract repeated logic (3+ occurrences) into shared utilities or components
- Check these locations before creating new code:
  - `src/lib/` - Utility functions
  - `src/hooks/` - Shared React hooks
  - `src/components/ui/` - Base UI components
  - `src/app/components/` - Feature components

### Avoid Duplication Checklist
Before creating a new function, hook, or component:
1. Search the codebase for similar functionality using grep/glob
2. Check if an existing utility can be extended rather than duplicated
3. If similar code exists in 2+ places, refactor into a shared location

### KISS (Keep It Simple)
- Prefer straightforward solutions over clever ones
- Avoid premature abstraction - wait until patterns emerge
- Three similar lines of code is often better than a premature abstraction

### YAGNI (You Aren't Gonna Need It)
- Only implement what's currently needed
- Don't add "just in case" features or configuration
- Delete unused code rather than commenting it out

## File Creation Rules

### NEVER create without asking:
- README.md files in subdirectories
- New documentation files (*.md)
- New folders or directories
- Configuration files

### Generated artifacts (gitignored, OK to create):
- `test-results/` - Playwright test output
- `playwright-report/` - Playwright HTML reports
- `dist/` - Build output

### Temporary/Debug files
- Do NOT create log files, debug dumps, or temporary output files anywhere
- Terminal output is sufficient for debugging — no need to capture to files
- Test artifacts go to existing gitignored folders: `test-results/`, `playwright-report/`

### Where files go:
| Type | Location |
|------|----------|
| Technical docs | `docs/technical/` |
| Product docs (learnings, plans) | `docs/` |
| Feature planning | `features/` |
| BMAD workflow outputs | `docs/bmad/` |
| BMAD sprint artifacts (tech-specs) | `bmad/artifacts/` |
| Source code | `src/app/` |
| Unit tests | `src/tests/` or colocated |
| E2E tests | `e2e/` |
| UI components | `src/components/ui/` |

### Documentation Folder Structure
```
docs/
├── technical/          # How things work (auth, db, testing, e2e)
├── bmad/               # BMAD workflow status files
├── plan.md             # Product planning
├── learnings.md        # Project learnings
└── product-requirements.md

bmad/
└── artifacts/          # Tech-specs and sprint artifacts

features/               # Feature planning docs (p{N}_{name}.md)
└── done/               # Completed features
```

### When unsure:
Ask the user before creating any new file or folder.
