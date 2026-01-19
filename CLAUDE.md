# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

## Agent Behavior Rules — Transparency Contract

**Core principle:** Never silently work around problems. Report issues to the user, even if you can technically proceed.

### Always report these issues:

**Broken tooling**
- Scripts producing incorrect results (false positives/negatives)
- Linters or checks with bugs in their logic
- Misleading output that doesn't match reality

**Test and type issues**
- Tests that fail intermittently (flaky tests) — don't just retry until they pass
- Type errors you're tempted to suppress with `@ts-ignore`, `@ts-expect-error`, or `as any`
- Tests you want to modify to make them pass (fix the code, not the test)

**Partial failures**
- Multi-step operations where some steps failed (e.g., "8 of 10 files updated")
- Commands that "succeeded" but with warnings or errors in output
- Operations that work inconsistently across environments

**Build and dependency health**
- Deprecation warnings in build output
- `npm audit` security vulnerabilities
- Significant bundle size or build time increases
- Missing dependencies worked around with hacks

**Environment issues**
- "Works locally but might not work in CI/production" situations
- Missing configuration or environment variables
- Version mismatches between tools

### How to report:
1. State what you observed
2. Explain why it's concerning
3. Ask how to proceed (fix it now, defer, or ignore)

### When in doubt:
If something feels "off" but technically works — report it. False alarms are better than silent failures.

### Proactive improvement:
When you encounter friction, inefficiency, or repeated issues in workflows, skills, or processes:
1. **Identify the problem** — What went wrong or felt awkward?
2. **Propose a concrete fix** — Draft the actual change (not vague suggestions)
3. **Ask before applying** — Present options, let the user decide

Examples:
- Skill asks too many questions → draft a more decisive version, show diff
- Same manual step repeated → propose automation, explain trade-offs
- Confusing instructions → write clearer version, ask if it captures intent

The goal: surface improvements proactively with ready-to-apply solutions. The user decides what ships.

## Product Overview

A **Sensemaking Platform** that reveals calibration gaps in how well people understand each other — and motivates them to close those gaps.

**Core loop:**
1. **Events** — Organizers create events, seed Stories and Points
2. **Stories** — Personal experiences that can only be understood (not debated)
3. **Points** — Claims about reality that can be agreed/disagreed with
4. **Verification** — `/live` sessions where partners explain back each other's Stories
5. **Calibration** — Profile shows understanding gap (how well you think you communicated vs. how well you actually did)

**Two user journeys:**
- **Journey A:** Event attendee → verifier → maybe pledger (1%)
- **Journey B:** Organic visitor → pledger → maybe event host

**The Pledge** is a graduation feature — ~1% of engaged users publicly commit to clear communication, get a profile page and certificate.

**Growth model:** B2B2C — event organizers bring their people. Events are the growth engine.

**Philosophy:** See [v0_theory-of-change.md](docs/visions/v0_theory-of-change.md) and [v7_communicative_critical_rationalism.md](docs/visions/v7_communicative_critical_rationalism.md) for epistemological foundations.

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
```

## Deep Dive References

Load these docs when working on specific areas:

| Working on... | Read |
|---------------|------|
| Product overview, business model | [lean-canvas.md](docs/lean-canvas.md) |
| What we're testing, validation strategy | [hypotheses.md](docs/hypotheses.md) |
| Auth, login, magic link, sessions | [authentication.md](docs/technical/authentication.md) |
| Database, RLS, profiles, witnesses, types | [database.md](docs/technical/database.md) |
| Playwright, screenshots, browser MCP tools | [browser-tools.md](docs/technical/browser-tools.md) |
| E2E tests, Playwright test suite | [e2e-testing.md](docs/technical/e2e-testing.md) |
| /live session testing, two-party simulation | [live-session-testing.md](docs/technical/live-session-testing.md) |
| Analytics, Mixpanel, Sentry | [analytics.md](docs/technical/analytics.md) |
| Git worktrees, parallel development | [worktree-setup.md](docs/technical/worktree-setup.md) |
| Cloud agent, /c commands | [cloud-agent.md](docs/technical/cloud-agent.md) |
| Past decisions, why we chose X over Y | [decisions.md](docs/decisions.md) |
| Philosophy, theory of change | [v0_theory-of-change.md](docs/visions/v0_theory-of-change.md) |
| Build sequence, roadmap | [roadmap.md](docs/roadmap.md) |

## Knowledge-Driven Development

- `/kdd` - Record decisions (run after features with interesting trade-offs)
- [decisions.md](docs/decisions.md) - Why we chose things (append-only, newest at top)

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
│   ├── *_acceptance_tests.md # UAT files for ralph-loop
│   └── *.md                  # Active features (p{N}_{name}.md)
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
- **features/** - What we're building (planning docs: `p{N}_{name}.md`, UAT files: `{name}_acceptance_tests.md`)
- **src/app/** - All application code lives here
- **src/app/content/** - All app content (articles, copy)

## Architecture

For detailed architecture docs, see the [Deep Dive References](#deep-dive-references) section above.

**Key patterns:**
- **Auth:** Reader-Writer pattern separates `useAuth` (read-only) from `AuthCallbackPage` (writes). Import from `@/auth`.
- **Data layer:** All Supabase calls go through `src/app/data/api.ts`. Fetch profiles and witnesses separately.
- **Components:** UI primitives in `src/components/ui/` (shadcn/ui), feature components in `src/app/components/`.

### Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/sign-pledge` | Pledge signup form |
| `/auth/callback` | **Critical auth handler** - do not modify without reading [authentication.md](docs/technical/authentication.md) |
| `/p/:id` | Public profile (`:id` is slug, not UUID) |
| `/pledgers` | Directory of verified signatories |
| `/about` | About page with contact form |
| `/settings` | User settings (authenticated) |

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

## Observability

Both Mixpanel (analytics) and Sentry (errors) are production-only.

```tsx
import { analytics } from '@/lib/mixpanel';
analytics.track('feature_used', { feature: 'live_meeting' });
```

For full event catalog and patterns, see [docs/technical/analytics.md](docs/technical/analytics.md).

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
| Feature planning (specs) | `features/p{N}_{name}.md` |
| UAT files (ralph-loop) | `features/{name}_acceptance_tests.md` |
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
├── visions/            # Philosophy docs (v0, v7)
├── bmad/               # BMAD workflow status files
├── archive/            # Archived docs (superseded)
├── hypotheses.md       # What we're testing
├── plan.md             # Product planning
└── learnings.md        # Project learnings

bmad/
└── artifacts/          # Tech-specs and sprint artifacts

features/               # Feature planning docs
├── p{N}_{name}.md      # Tech specs
├── {name}_acceptance_tests.md  # UAT files for ralph-loop
└── done/               # Completed features
```

### When unsure:
Ask the user before creating any new file or folder.
