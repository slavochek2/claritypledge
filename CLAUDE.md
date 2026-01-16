# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

## Project Overview

The Clarity Pledge is a web application where professionals publicly commit to clear communication. Users sign a pledge via magic link authentication, receive a public profile page with a shareable certificate, and can collect endorsements from colleagues.

**Domain:** `claritypledge.com` (old domain `understandingpledge.com` redirects via Vercel)

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgreSQL + Auth) + Tailwind CSS + Radix UI

**Observability:** Mixpanel (analytics) + Sentry (error tracking) - both production-only

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

# Pre-commit Checks (REQUIRED before committing)
./scripts/pre-commit-checks.sh

# Visual Inspection (Playwright MCP)
# Use Playwright MCP tools to take screenshots and verify UI
# Requires dev server running: npm run dev
```

## MCP Servers Available

**Supabase MCP** - Direct database access and management:
- Execute SQL queries against the database
- List tables and view schemas
- Inspect database functions and triggers
- View RLS policies
- Useful for debugging data issues and exploring schema

**Playwright MCP** (`--isolated` mode) - For visual UI inspection during development:
- Navigate to pages and take screenshots
- Check mobile (375px) and desktop views
- Verify console for errors
- Use for `/loop` visual checks when UI is involved
- Runs in isolated mode: fresh browser profile each session, enables parallel agents

**Chrome DevTools MCP** (`--isolated` mode) - For deep browser debugging:
- Network inspection (headers, timing, failures)
- Performance traces and profiling
- Memory leak investigation
- Runs in isolated mode: fresh browser profile each session, enables parallel agents

**Chrome Integration** (beta, `claude --chrome`) - Browser automation via Chrome extension:
- Uses your actual logged-in browser sessions (Gmail, Google Docs, OAuth flows)
- Real-world testing with authenticated state
- Requires: Chrome + Claude extension (v1.0.36+) + visible browser window
- Enable with `claude --chrome` or `/chrome` command
- **This is the only way to test OAuth flows or access authenticated state**

## Browser Tools Decision Guide

**Choose the right tool based on what you need:**

| Need | Tool | Mode | Parallel-Safe |
|------|------|------|---------------|
| Quick screenshot / visual check | Playwright MCP | isolated, headless | ✅ |
| Run test suite / CI | `npm run test:e2e` | headless | ✅ |
| Debug network/perf/memory | Chrome DevTools MCP | isolated, headless | ✅ |
| OAuth / logged-in sessions | Chrome Integration | headed, persistent | ❌ |

### When to Use Each (Agent Decision Guide)

**Default choice: Playwright MCP**
- Fast, headless, parallel-safe
- Use for: screenshots, visual verification, UI testing
- Limitation: No access to logged-in state (isolated profile)

**Playwright E2E** (`npm run test:e2e`)
- Use for: Actual tests with assertions, `/loop` validation
- Different from Playwright MCP - this runs the test suite, not ad-hoc browser actions

**Chrome DevTools MCP**
- Use when: Need network requests, headers, timing, performance traces
- Same limitations as Playwright MCP (isolated profile)

**Chrome Integration (`claude --chrome`)**
- Use when: Testing OAuth flows, Google login, or any authenticated state
- Requires user to start Claude with `--chrome` flag
- If you need auth and don't have Chrome Integration, **ask the user** to restart with `claude --chrome`

### Isolation Mode Explained

Both Playwright MCP and Chrome DevTools MCP run with `--isolated`:
- **Why:** Enables multiple Claude sessions to run in parallel without browser conflicts
- **Trade-off:** Each session starts with a fresh browser (no cookies, no login state)
- **If you need persistent state:** Ask user to use Chrome Integration (`claude --chrome`)

### Headless by Default

All MCP browser tools run headless (no visible window). This is intentional:
- Faster execution
- Doesn't interrupt user's workflow
- Works on cloud VMs without displays

Chrome Integration is the exception - it requires a visible browser by design.

## Cloud Agent (Run Tasks While AFK)

Run AI coding tasks on a Google Cloud VM. Supports **parallel execution** via worktrees (0-3).

```bash
/c claude Add feature X              # Auto-picks available worktree
/c claude -w 2 Fix auth bug          # Explicitly use worktree 2
/c status                            # Check ALL running agents
/c --list                            # See worktree states
/c pull 0                            # Get work from worktree 0
/c reset all                         # Reset idle worktrees to main
```

| Feature | Claude (`/c claude`) | Gemini (`/c`) |
|---------|---------------------|---------------|
| `/loop` workflow | ✅ | ❌ |
| BMAD agents | ✅ | ❌ |
| Playwright MCP | ✅ | ❌ |
| Chrome DevTools MCP | ✅ | ❌ |
| Chrome Integration | ❌ (needs visible browser) | ❌ |

**First-time setup:**
1. Run `/c setup-mcp` to install Playwright and Chrome DevTools MCP on the VM
2. Run `/c setup-worktrees` to create worktrees 1-3 for parallel execution

See [docs/technical/cloud-agent.md](docs/technical/cloud-agent.md) for full documentation.

## Git Worktree Setup (Parallel Development)

This project uses git worktrees for parallel AI agent development. **If you're working in a worktree, check which one:**

```bash
git worktree list
```

**Worktree ports:**
- Main repo: `localhost:5001`
- Tree 1-7: `localhost:5100` through `localhost:5700`

Each worktree has a unique port configured in `vite.config.ts` (committed to its branch). See [docs/technical/worktree-setup.md](docs/technical/worktree-setup.md) for full details on resetting, merging, and managing worktrees.

### Worktree Naming Convention (MUST FOLLOW)

**Directory names:** Always use `claritypledge-N` (e.g., `claritypledge-1`, `claritypledge-2`)
- Local: `/Users/slavochek/Documents/claritypledge-N`
- Cloud: `~/claritypledge-N`

**Branch names:** Use descriptive names that include the worktree number:
- Format: `{feature}-wt{N}` or `worktree-{N}` for generic
- Examples: `p38-variant-a-wt3`, `dark-mode-wt1`, `worktree-cloud-2`

**Why this matters:**
- Auto-detect scripts look for `claritypledge-N` directories
- Port auto-detection uses directory name to assign ports
- `/c claude` parallel execution depends on this naming

**Creating a new worktree:**
```bash
# From main repo
git worktree add ../claritypledge-N -b feature-name-wtN

# Then symlink .env.local (critical!)
ln -sf $(pwd)/.env.local ../claritypledge-N/.env.local
```

## Checking Worktree Contents

Git branches are the source of truth for what code is where. To see what's on a worktree:

```bash
# Check branch and recent commits
cd ../claritypledge-N
git log --oneline -5
```

### Task Completion Output (REQUIRED)

**When finishing work on a worktree, agents MUST output:**

```
✅ Task complete!

🔗 Test link: http://localhost:51XX (where XX = worktree number)
📁 Worktree: claritypledge-N
🌿 Branch: feature-name-wtN

To test: Dev server should be running. If not, run `npm run dev` in the worktree.
```

This saves the user from asking "what's the link?" or "which worktree?"

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
│   │   │   ├── landing/      # Landing page sections
│   │   │   ├── layout/       # Navigation, footer
│   │   │   ├── legal/        # Legal content components
│   │   │   ├── partners/     # Partner-related components
│   │   │   ├── profile/      # Profile views and certificates
│   │   │   └── social/       # Social features (pledger cards, signature wall)
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
- `/pledgers` - Directory of verified signatories
  - Redirects: `/clarity-champions` → `/pledgers`, `/understanding-champions` → `/pledgers`
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

### Test Modification Rules (IMPORTANT)

**NEVER do these without explicit user approval:**
- Uncomment or enable skipped tests (`.skip`, `skip()`, commented-out tests)
- Use `.only` or `only()` to isolate tests (this breaks CI)
- Delete or disable failing tests to make the suite pass
- Modify test assertions to match broken behavior

**Skipped tests exist for a reason** - usually a known limitation, flaky behavior, or pending fix. If a skipped test is relevant to your work, ask the user before enabling it.

**If tests fail:** Fix the code, not the tests. If you believe a test is wrong, explain why and ask before modifying it.

## Known Issues

- Magic link auth requires correct redirect URLs in Supabase dashboard
- Profile creation must only happen in auth callback (not hooks)
- E2E tests: 6 skipped due to browser session detection limitation (see [e2e-testing.md](docs/technical/e2e-testing.md))

## Source of Truth Convention

When working with documentation and tests:

- **Tests** define correct behavior (what the code should do)
- **Feature docs** (`features/*.md`) explain decisions and rationale (why we chose this approach)
- **Code** implements what tests specify

**When conflicts arise:**
- Tests win for behavior (they're executable specifications)
- Feature docs win for intent (they explain the "why")

**Practical implications:**
1. Update tests FIRST when changing behavior (TDD)
2. Update feature docs when making architectural decisions
3. If docs and tests conflict, investigate which is correct before changing either
4. One feature doc per feature - avoid multiple overlapping docs

## Observability (Mixpanel + Sentry)

Both tools are production-only (disabled in dev to avoid polluting data).

### Mixpanel Analytics

Use for tracking user behavior and product metrics. Wrapper at [src/lib/mixpanel.ts](src/lib/mixpanel.ts).

```tsx
import { analytics } from '@/lib/mixpanel';

// Track events
analytics.track('feature_used', { feature: 'live_meeting', action: 'started' });

// Identify users (after auth)
analytics.identify(userId);

// Set user properties
analytics.setUserProperties({ plan: 'free', signupDate: '2024-01-15' });
```

**When adding new features:** Add Mixpanel events for key user actions. See [docs/technical/analytics.md](docs/technical/analytics.md) for the full event catalog and naming conventions.

### Sentry Error Tracking

Initialized in [src/main.tsx](src/main.tsx). Errors are auto-captured. For manual tracking:

```tsx
import * as Sentry from '@sentry/react';

// Capture exceptions
Sentry.captureException(error);

// Capture messages (for non-error events worth tracking)
Sentry.captureMessage('Unexpected state detected', 'warning');

// Add context to errors
Sentry.setContext('session', { code: sessionCode, phase: ratingPhase });
```

## Pre-Commit Checks (MUST RUN)

**Before creating any commit, Claude MUST run:**
```bash
./scripts/pre-commit-checks.sh
```

This script runs automatically if installed as a git hook, but Claude should run it explicitly before committing to catch issues early.

### What it checks:

| Check | Blocks commit? | Purpose |
|-------|---------------|---------|
| **Lint** | Yes | ESLint errors (includes accessibility via jsx-a11y) |
| **Build** | Yes | TypeScript errors, import issues |
| **Tests** | Yes | Regressions |
| **Secrets scan** | Yes | API keys, tokens, credentials (via gitleaks) |
| **Bundle size** | Warning | Alerts if dist/ exceeds 20MB |
| **console.log** | Warning | Debug logs left in code |
| **TODO/FIXME** | Warning | New tech debt being added |
| **@ts-ignore** | Warning | TypeScript escape hatches that bypass type safety |
| **debugger** | Yes | Leftover debug statements |
| **any types** | Warning | New `any` types in non-test code |

### ESLint includes accessibility checks (jsx-a11y):

The linter catches common accessibility issues:
- Missing alt text on images
- Empty anchor/button content
- Invalid ARIA roles
- Click handlers without keyboard support (warning)

### After checks pass, also review:

1. **Logic bugs and edge cases** - Does the code handle errors?
2. **Security issues** - XSS, injection, auth bypass?
3. **Accessibility** - Linter catches basics, but verify keyboard navigation works
4. **CLAUDE.md patterns** - Does it follow project conventions?

If issues are found, ask the user how to proceed before committing.

## Available Cloud Credits

| Provider | Credit | Source | Expires |
|----------|--------|--------|---------|
| **Google Cloud** | $25 | GFS 2024 Ecosystem Partner | TBD (check account) |

Consider using these for features requiring cloud infrastructure (compute, storage, background jobs).

## Technical Debt / Intentional Decisions

- **Web3Forms API key in source**: The contact form on `/about` uses Web3Forms with a hardcoded access key. This is intentional - Web3Forms access keys are designed to be public (like Stripe publishable keys). Moving to env var is nice-to-have.
- **Mixpanel token in index.html**: Similarly, Mixpanel tokens are client-side by design. Environment variable would be cleaner but not a security issue.
- **"Clarity" naming in code**: Component names use "Clarity" prefix (e.g., `ClarityPledgeApp`, `ClarityChampionsPage`) which matches the brand name "Clarity Pledge".
- **Pledge Version 1 shows "Clarity Pledge"**: In `pledge-text.tsx`, version 1 of the pledge intentionally keeps the original "Clarity Pledge" title for historical accuracy. Users who signed v1 see their original pledge text.

## Design System

**Specification:** [docs/design-system.md](docs/design-system.md)

**Before creating UI**: Read the spec above. It references shadcn/ui and Tailwind CSS - use those components and tokens.

**Quick rules (most common violations):**
- ✅ Blue for actions/CTAs, green for SUCCESS ONLY
- ❌ Never green action buttons, amber/orange/yellow, purple in UI

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
└── mvp_pledge.md            # Product requirements

bmad/
└── artifacts/          # Tech-specs and sprint artifacts

features/               # Feature planning docs (p{N}_{name}.md)
└── done/               # Completed features
```

### When unsure:
Ask the user before creating any new file or folder.
