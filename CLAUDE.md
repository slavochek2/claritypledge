# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

**For agent philosophy:** See [.claude/commands/slava/PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — principles scale, rules don't.

## Agent Behavior — Transparency Principle

> **Principle:** Never silently work around problems. Report issues to the user, even if you can technically proceed.

This isn't a list of rules to memorize — it's about transparency. When something feels off, say so. The examples below illustrate the principle:

### Examples of What to Report

These aren't exhaustive rules — they're illustrations of the transparency principle:

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

## Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask when there are genuine trade-offs or user preference matters.

**Bad:** "Here are options 1, 2, 3. Which do you want?" (when one is obviously right)
**Good:** "X is the right fix. Doing it."

Asking unnecessary questions wastes time and shifts decision-making burden to the user. If you've done the analysis and know the answer, act on it.

**When to ask:** Genuine ambiguity, user preference matters, or irreversible actions.
**When to act:** The right path is clear from context, principles, or analysis.

## Skills — Local Only

**All skills live in `.claude/commands/`** (no global `~/.claude/skills/`).

Benefits: One folder to navigate, visible in IDE, version controlled with project.

| Folder | Purpose |
|--------|---------|
| `slava/build/` | Development skills (dev, ux, design-audit, prep-spec, simplify) |
| `slava/content/` | Writing & publishing (blog, sifter, story) |
| `slava/think/` | Strategy & ideation (lean, innovate, route) |
| `slava/maintain/` | Hygiene & knowledge (cleanup, weekly, kdd) |
| `slava/util/` | Utilities (c, find-skill, shorten-url) |
| `awesome/` | Community skills |
| `bmad/` | BMAD framework |
| Others | Domain-specific (deep-research, scientific, etc.) |

**Approval required** before:
- Creating new skills
- Deleting or modifying existing skills
- Installing plugins or MCP servers

**Always ask first:** "I'd like to create [X] for [reason]. OK?"

## AI-Era Task Duration

> **Principle:** Time estimates should reflect AI speed, not pre-AI human estimates.

Tasks that took humans days now take minutes with AI assistance:
- **Research tasks:** Minutes, not days (web search + synthesis)
- **Documentation updates:** Hours, not weeks
- **Code exploration:** Minutes, not hours

When estimating task duration, account for AI capabilities. Don't give estimates that assume manual human work when AI can accelerate.

## Working Style — Founder Pattern

> **Pattern to watch:** When facing uncertainty, the founder tends to expand scope (add features, explore adjacent ideas, ask more "what about X?" questions) as a way to create false certainty.

**If you notice:**
- Lots of "what about X?" questions instead of validating the core hypothesis
- Adding features/ideas before current hypothesis is validated
- Exploring adjacent markets before current one is proven
- Wanting to "solve" trust/retention/scale before proving basic demand

**Then flag it directly:** "This looks like scope expansion under uncertainty. The lean path is to validate [current hypothesis] first. Should we stay focused?"

This isn't criticism — it's a known pattern that delays validation. The fastest path to certainty is testing, not thinking.

## Plan Mode — No Writing, Just Planning

> **Rule:** In plan mode, do NOT write spec content into the plan file. Plan mode is for exploration and decision-making only.

**What plan mode is for:**
- Exploring the codebase (Read, Grep, Glob)
- Asking clarifying questions (AskUserQuestion)
- Making architectural decisions with the user
- Outlining an approach (brief bullet points in the plan file are OK)

**What plan mode is NOT for:**
- Writing full specs, feature files, or documentation
- Creating code or detailed implementation plans
- Working around the "can't create files" restriction by stuffing content into the plan file

**If the user asks you to write a spec or create a file while in plan mode:**
1. Tell them: "I'm in plan mode — I can't create files. Say 'approve' on the ExitPlanMode prompt so I can write the spec as a proper feature file."
2. Call `ExitPlanMode` immediately
3. Do NOT write the spec into the plan file as a workaround

**If you're stuck in plan mode:** Keep calling `ExitPlanMode`. Explain to the user: "I need to exit plan mode to create files. Please approve the exit."

**The user exits plan mode by:** Approving the `ExitPlanMode` tool call. There is no separate user command.

## Risky Operations — Worktree Protection

> **Principle:** Risky or experimental changes should be isolated. Suggest a worktree before proceeding.

**Before these operations, ask:** "This is risky/experimental. Want to switch to another worktree first?"

- Installing new global tools that modify repo files (like `backlog init`)
- Major refactors touching 10+ files
- Trying new frameworks, build systems, or architectures
- Database migrations or schema changes
- Anything labeled "experimental" or "let's try this"

**Why:** Easy rollback. If experiment fails, the main worktree stays clean.

## Process Management — Safe Port Cleanup

> **Principle:** When killing processes, use `lsof -ti:PORT | xargs kill`, never `pkill -f "PORT"`.

Pattern matching (`pkill -f`) can kill unintended processes like Docker Desktop. See [kanban.md](docs/technical/kanban.md#process-management) for details.

## Commit Discipline — Checkpoint Prompts

> **Pattern to watch:** The founder tends to accumulate changes, then commit everything at once. This makes rollback hard and history unclear.

**Agent behavior:**
- After completing a logical unit of work (feature, fix, refactor), prompt: "This is a good commit checkpoint. Want to commit now?"
- If 30+ minutes pass with uncommitted changes, remind: "You have uncommitted work. Commit before continuing?"
- Before starting something new (new feature, experiment, tool install), check for uncommitted changes first

**Signs to watch for:**
- Multiple unrelated changes in `git status`
- Mix of "done" work and "in progress" work
- About to context-switch to something different

**Goal:** Small, atomic commits. Each commit = one logical change.

## Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

**Agent behavior:**
- When starting non-trivial work (multi-file changes, features, bug fixes), suggest: "Want me to create a tracking task?"
- Never auto-create tasks. Always get user approval.
- If user declines, don't ask again that session.
- If the work looks like it delivers user value, reflect: "This could be a user story — As a [user], I want [goal], so that [benefit]. Want me to formulate it that way?"
- When done, update task to `status: done` and fill Outcome section.

**Type classification:**

| Type | Frontmatter | When |
|------|-------------|------|
| `type: story` | User story | Delivers user value, has "As a..., I want..." format |
| `type: task` | Task | Technical, operational, ad-hoc |
| `type: bug` | Bug | Fix for broken behavior |

**Number assignment:** Scan ALL `features/` subdirectories for highest `p{N}`. Next = highest + 1.

## Tool Preferences

### Library Documentation (Context7)

**Before web-searching for library/framework docs, use Context7 first.**

Context7 MCP (`mcp__plugin_context7_context7__*`) provides up-to-date documentation and code examples for thousands of libraries — React, Supabase, Playwright, Tailwind, Ghost, Vite, Radix, and more.

**Workflow:**
1. `resolve-library-id` — find the library ID (e.g., "react", "ghost", "supabase")
2. `query-docs` — ask a specific question (e.g., "how to use useOptimistic in React 19")

**When to use:** Any time you need API docs, code examples, or correct usage patterns for a library. Context7 is faster and more accurate than web search for library documentation.

### Browser Automation

Three tools, different lanes — pick based on the task:

| Need | Tool | Why |
|------|------|-----|
| Automated test suite, CI, `/live` two-party | **Playwright** (`npm run test:e2e`) | Repeatable, headless, parallel |
| Debugging, perf profiling, network inspection | **Chrome DevTools MCP** (`mcp__chrome-devtools__*`) | Headless, no user browser needed |
| Visual QA, authenticated pages, ad-hoc checks | **Claude in Chrome** (`mcp__claude-in-chrome__*`) | Real browser, cookies, vision |

No priority order. Each has a unique strength. For full details: [browser-tools.md](docs/technical/browser-tools.md)

## Product Overview

**Clarity Pledge** — A practice system for calibrated communication. Use /live to verify understanding and reveal the gap between "I think I understood" and reality.

**Core insight (2026-01-28):** The tool reveals a blindspot people don't know they have. The person who's blind won't pay — but the person who SEES the blindspot (coaches, managers) will pay. Coaches are the first customer hypothesis.

**Core loop:** Verify understanding via /live → See calibration gap → Improve over time

**Current focus:** Validate coach hypothesis — will executive/leadership/communication coaches pay $50-100/month for a diagnostic tool that proves their clients' listening miscalibration?

For full concepts: [definitions.md](docs/definitions.md)
For business model: [lean-canvas.md](docs/lean-canvas.md)
For current hypotheses: [hypotheses.md](docs/hypotheses.md)

**Domain:** `claritypledge.com` | **Tech Stack:** React 19 + TypeScript + Vite + Supabase + Tailwind CSS + Radix UI

## Documentation Architecture

**Source of truth docs** (concepts live here, one place only):
- `definitions.md` — Product concepts (Stories, Points, Verification)
- `lean-canvas.md` — Business model (Problem, Solution, Customers)
- `hypotheses.md` — What we're testing
- `decisions.md` — Trade-offs, build sequence, why X over Y
- `philosophy.md` — WHY this works (epistemology)
- `theory-of-change.md` — HOW change spreads (cascade, √N)
- `visions/*` — Historical explorations

**Consumer docs** (link only, never duplicate):
- `README.md` — Setup for humans
- `CLAUDE.md` — Instructions for AI

**Rule:** If explaining a concept, add to source doc and link. Never duplicate.

### Where to Write New Knowledge

When capturing new knowledge, put it in the right place:

| Knowledge Type | Location |
|----------------|----------|
| Product decisions (why X over Y) | `decisions.md` |
| Technical patterns (how something works) | `docs/technical/architecture.md` |
| What we're testing + evidence | `hypotheses.md` |
| Product concepts | `definitions.md` |
| Domain-specific technical details | `docs/technical/{domain}.md` |

**Before writing:** Search for existing content. Extend, don't duplicate.

## Development Commands

### Dev Server Ports

Each worktree has a dedicated port to allow parallel development:

| Location | Port |
|----------|------|
| Main repo | 5001 |
| Worktree w1 | 5100 |
| Worktree w2 | 5200 |
| Worktree w3 | 5300 |
| Worktree w4-w7 | 5400-5700 |

**Port logic:** `5000 + (worktreeNum * 100)`. Configured in `vite.config.ts`.

**For agents:** Never start dev servers on arbitrary ports. Use `npm run dev` which auto-detects the correct port based on the worktree.

```bash
# Development
npm run dev              # Start dev server (port auto-detected per worktree)
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

# Kanban (feature prioritization)
npm run kanban           # Opens http://localhost:9050
```

## Deep Dive References

Load these docs when working on specific areas:

| Working on... | Read |
|---------------|------|
| Core concepts (Stories, Points, Calibration) | [definitions.md](docs/definitions.md) |
| Product overview, business model | [lean-canvas.md](docs/lean-canvas.md) |
| What we're testing, validation strategy | [hypotheses.md](docs/hypotheses.md) |
| Build sequence, past decisions | [decisions.md](docs/decisions.md) |
| Feature prioritization, kanban workflow | [kanban.md](docs/technical/kanban.md) |
| Creating feature specs (naming, frontmatter) | [feature-specs.md](docs/technical/feature-specs.md) |
| Data layer, service patterns, components | [architecture.md](docs/technical/architecture.md) |
| Auth, login, magic link, sessions | [authentication.md](docs/technical/authentication.md) |
| Database, RLS, profiles, witnesses, types | [database.md](docs/technical/database.md) |
| Browser automation (Chrome DevTools, screenshots) | [browser-tools.md](docs/technical/browser-tools.md) |
| All MCP servers (Notion, Maps, LinkedIn, etc.) | [mcp-servers.md](docs/technical/mcp-servers.md) |
| E2E tests, Playwright test suite | [e2e-testing.md](docs/technical/e2e-testing.md) |
| /live session testing, two-party simulation | [live-session-testing.md](docs/technical/live-session-testing.md) |
| Analytics, Mixpanel, Sentry | [analytics.md](docs/technical/analytics.md) |
| Git worktrees, parallel development | [worktree-setup.md](docs/technical/worktree-setup.md) |
| Cloud agent, /c commands | [cloud-agent.md](docs/technical/cloud-agent.md) |
| Ghost blog, newsletter, Mailgun | [ghost-blog.md](docs/technical/ghost-blog.md) |
| Past decisions, why we chose X over Y | [decisions.md](docs/decisions.md) |
| Epistemology (WHY this works) | [philosophy.md](docs/philosophy.md) |
| Cascade, √N, network effects | [theory-of-change.md](docs/theory-of-change.md) |

## Worktree Branch Naming

**Worktree identity** comes from the directory name: `claritypledge-N` = wN. Don't ask — just map the number.

**Branch names** always reflect the **feature**, not the worktree number. The branch is the only thing that tells you what work lives in a worktree.

**Rules:**
1. **Branch = feature name:** e.g., `p117-stories-points-backend`, `p62-dashboard`
2. **Keep branch name through syncs:** When merging main, don't rename the branch — the feature hasn't changed
3. **Rename branch when switching features:** If a worktree moves to new work, rename the branch to the new feature

**Example workflow:**
```bash
# User: "bring w1 up to date with main"
# (w1 = claritypledge-1, currently on branch p62-dashboard)
cd ~/Documents/claritypledge-1
git fetch origin main
git merge origin/main
# Branch stays p62-dashboard — feature hasn't changed

# Later, switching w1 to new feature p80:
git branch -m p80-new-feature
```

## Knowledge-Driven Development

`/kdd` — Run after finishing features to capture knowledge and keep docs current.

**What it manages:**

| Category | Docs |
|----------|------|
| Strategic (the "why") | `decisions.md`, `hypotheses.md`, `lean-canvas.md` |
| Technical (the "how") | `database.md`, `authentication.md`, `definitions.md`, etc. |
| GTM & Sales | `features/p105_sales_playbook.md` (per-segment playbooks) |

**Where things go:**

| Knowledge type | Location |
|----------------|----------|
| Business model, value prop | `lean-canvas.md` |
| What we're testing + evidence | `hypotheses.md` |
| Open questions (unresolved) | `hypotheses.md` "Open Questions" section |
| Trade-offs, "why X over Y" | `decisions.md` |
| GTM, sales tactics, pitches | `features/p{N}_sales_playbook.md` |
| Pivot options | `lean-canvas.md` "Alternative Approaches" section |

**When to run:**
- After features with interesting trade-offs
- When hypothesis validated/invalidated
- When priorities shift
- When confusion about past decisions signals one should have been recorded

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

## Database Access Policy

**Agents have TEST database access only. No production database access.**

| Environment | MCP Access | Purpose |
|-------------|------------|---------|
| Test (`gfjctyxqlwexxwsmkakq`) | ✅ Full access | Development, testing, experimentation |
| Production | ❌ No access | Protected from agent modifications |

**Workflow for production changes:**
1. Develop and test changes on test database
2. Capture changes as SQL migrations in `supabase/migrations/`
3. Human reviews migration files
4. Human applies to production via `supabase db push` or Supabase dashboard

**Why this policy:**
- Agents can experiment freely on test without risk
- Production data is protected from accidental modifications
- Changes are auditable through migration files
- Human approval required before production deployment

**MCP Configuration:**
- `.mcp.json` contains test Supabase credentials only (gitignored)
- Works consistently across all worktrees
- Never add production credentials to any config file

## Project Structure

```
/
├── docs/                     # Documentation (not deployed)
│   ├── technical/            # Technical guides (auth, db, testing, e2e)
│   ├── learnings/            # Project learnings and retrospectives
│   └── visions/              # Historical explorations and proposals
│
├── features/                 # Feature planning
│   ├── done/                 # Completed feature docs
│   ├── archive/              # Archived/deprioritized features
│   ├── drafts/               # Early-stage drafts and ideas
│   ├── uat/                  # UAT files for ralph-loop (uat/p{N}.md)
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
- **features/** - What we're building (planning docs: `p{N}_{name}.md`, UAT files: `uat/p{N}.md`)
- **src/app/** - All application code lives here
- **src/app/content/** - All app content (articles, copy)

## Architecture

For detailed patterns, see [architecture.md](docs/technical/architecture.md).

**Quick reference:**
- **Auth:** Reader-Writer pattern — `useAuth` (read), `AuthCallbackPage` (write). Import from `@/auth`.
- **Data layer:** Interface-based services (`*-service.ts`) for new features. Legacy `api.ts` for profiles.
- **Components:** UI primitives in `src/components/ui/`, feature components in `src/app/components/`.

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
| `/s/:code` | Short link redirects (see `src/app/data/short-links.ts`) |

## Common Gotchas

1. **Profile lookup**: Routes use `slug` (e.g., `/p/john-doe`), not UUID. Use `getProfileBySlug()` for routes, `getProfile(id)` when you have UUID.

2. **Auth race conditions**: The app previously had issues with "Profile Not Found" errors during auth. This was fixed by isolating profile creation in `AuthCallbackPage.tsx` (in `src/auth/`). Don't create profiles elsewhere.

3. **Witness fetching**: Always fetch witnesses separately from profiles. Nested `select()` queries don't work reliably with Supabase.

4. **Email verification**: Users aren't "verified" until they click the magic link. Profile creation happens on callback, not during signup.

5. **Navigation state**: The app uses `SimpleNavigation` component to avoid auth state flicker. Check [simple-navigation.tsx](src/app/components/layout/simple-navigation.tsx) for current implementation.

## Testing

**Unit Tests** (Vitest + React Testing Library + jsdom):
- Setup: [src/tests/setup.tsx](src/tests/setup.tsx)
- Location: `src/tests/` or colocated with components
- Critical tests: [critical-auth-flow.test.tsx](src/tests/critical-auth-flow.test.tsx)

**E2E Tests** (Playwright):
- Location: `e2e/*.spec.ts`
- Helpers: [e2e/helpers/test-user.ts](e2e/helpers/test-user.ts)
- Config: [playwright.config.ts](playwright.config.ts)
- Requires: `.env.test.local` with `SUPABASE_SERVICE_ROLE_KEY`
- Full guide: [docs/technical/e2e-testing.md](docs/technical/e2e-testing.md)

### Test Integrity Principle

> **Principle:** Tests are executable specifications. Modifying tests to pass means changing the spec.

If tests fail, the code is wrong (not the test). If you believe a test is genuinely incorrect, explain why and ask before changing it.

**Why this matters:**
- Tests define correct behavior — they're the specification
- Modifying a test to match broken code means accepting the bug
- Skipped tests exist for documented reasons (flakiness, known limitations)

**Examples of test manipulation to avoid:**
- Enabling skipped tests without understanding why they're skipped
- Using `.only()` (breaks CI — other tests won't run)
- Deleting failing tests to make the suite green
- Changing assertions to match buggy output

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

## Pre-Commit Checks

Before creating any commit, run:
```bash
./scripts/pre-commit-checks.sh
```

This catches issues before they reach the commit. Run it explicitly rather than relying on git hooks.

### Git Safety (Firewall)

These are hard rules, not principles to reason about. Leaking secrets to git history is catastrophic and irreversible — there's no "it depends."

**Never use these commands:**
- `git add .` — can stage secrets and ignored files
- `git add -A` — same problem
- `git add -f <file>` — forces adding ignored files

**ALWAYS use explicit file names:**
```bash
git add src/app/pages/MyPage.tsx src/components/Button.tsx
```

**Files that MUST NEVER be committed:**
- `.mcp.json` — contains API tokens
- `.env.local` — contains secrets
- Any file with `token`, `secret`, `key`, `password` in content

**If you accidentally stage a secret:**
```bash
git reset HEAD <file>        # Unstage
git rm --cached <file>       # Untrack (if already tracked)
```

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

### Open Source Safety (PII Protection)

This repo is public. Before creating or updating files — especially in `content/`, `docs/stories/` — check for:

- Personal addresses, phone numbers, private contacts
- Information that could enable identity theft or harassment
- Private business details (revenue, contracts, bank info)
- Location patterns that reveal daily routines

**When in doubt, ask:** "Is this safe to publish openly?"

**High-risk file types:**
- `content/events/` — may contain local community details
- `content/stories/` — personal narratives may reveal too much
- `content/blog/` — blog posts may reference personal details before editing

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

## Cloud Infrastructure

| Provider | Credit | Source | Expires |
|----------|--------|--------|---------|
| **Google Cloud** | $25K | GFS 2024 Ecosystem Partner | TBD (check account) |

**Existing infrastructure:**
- **GCS Bucket:** `[TBD - add bucket name]` — used for voice recordings, event banners
- **Project ID:** `[TBD - add project ID]`

**When to use GCS over alternatives:**
- File uploads (images, audio, documents) → GCS bucket
- Prefer GCS over Supabase Storage — we have credits and it's already set up

**Future uses to consider:**
- Background jobs (Cloud Run)
- AI/ML workloads (Vertex AI)
- CDN for static assets

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

- **Never put dates in documentation** — Claude often hallucinates the year. Use relative terms ("current", "recent") or omit dates entirely. Status fields and git history provide temporal context.
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
- **For skills and agents**, also check:
  - `.claude/commands/slava/` - **Slava's custom skills and agents (check here FIRST)**
  - `.claude/commands/awesome/` - Community skills
  - `.claude/commands/bmad/**/agents/` - BMAD agents

### Avoid Duplication Checklist
Before creating a new function, hook, component, **skill, or agent**:
1. Search the codebase for similar functionality using grep/glob
2. Check if an existing file can be extended rather than duplicated
3. If similar concept exists, add to the source of truth (don't create parallel definitions)
4. **For agent personas**: check if `/build/prep-spec/agents/` or `/bmad/**/agents/` already has it

### KISS (Keep It Simple)
- Prefer straightforward solutions over clever ones
- Avoid premature abstraction - wait until patterns emerge
- Three similar lines of code is often better than a premature abstraction

### YAGNI (You Aren't Gonna Need It)
- Only implement what's currently needed
- Don't add "just in case" features or configuration
- Delete unused code rather than commenting it out

## Single Source of Truth Principle

> **Principle:** Every concept has one canonical home. Extend it, don't duplicate it.

Duplication creates drift — two versions of the truth that eventually contradict each other. Before creating any new file OR adding content to an existing file, ask: "Is this the semantic home for this concept?"

### How to Apply

1. **Search first** — grep for the concept in `.claude/commands/`, `docs/`, and `src/`
2. **Understand purpose** — Don't pattern-match on keywords. Ask "What is this file FOR?" before adding content.
3. **Extend, don't duplicate** — If similar exists, add to it rather than creating parallel
4. **Link, don't copy** — Reference the source of truth; don't repeat content

### When to Ask

For these file types, **ask before creating:**
- Skills and agents (`.claude/commands/**/*.md`)
- Documentation (`docs/**/*.md`)
- New directories

### Examples of Violations

These aren't exhaustive rules — they illustrate the principle:

| Pattern | Why it's a problem |
|---------|-------------------|
| Creating agent inline in a skill | Duplicates agent definition |
| Same concept in multiple docs | Which version is correct? |
| New utility when similar exists | Maintenance burden |
| New skill when existing could have a flag | Unnecessary fragmentation |

### Before Writing Content

> **Principle:** Search before writing. Link before duplicating.

When documenting any concept (decisions, learnings, hypotheses):

1. **Extract key phrases** from what you're about to write
2. **Search the codebase** for those phrases
3. **If found elsewhere:**
   - Same concept, same doc type → update the existing entry
   - Same concept, different purpose → link to source, add minimal context
   - Related but distinct → proceed, note the relationship
4. **If not found** → add to the appropriate source of truth doc

**The test:** If you're writing more than one sentence explaining a concept that exists elsewhere, you're probably duplicating. Link instead.

---

## File Locations

### Where files go:
| Type | Location |
|------|----------|
| Technical docs | `docs/technical/` |
| Product learnings | `docs/learnings/` |
| Founder stories / raw interview material | `content/stories/` |
| Blog posts (lifecycle-tracked) | `content/blog/` |
| Founder voice guide | `content/voice.md` |
| Content strategy | `content/strategy.md` |
| Discussion group topics | `content/events/` |
| Historical explorations | `docs/visions/` |
| Feature planning (active) | `features/p{N}_{name}.md` |
| Feature drafts (early ideas) | `features/drafts/` |
| Completed features | `features/done/` |
| Archived features | `features/archive/` |
| Research results | `features/research/` |
| UAT files (ralph-loop) | `features/uat/p{N}.md` |
| BMAD workflow outputs | `docs/bmad/` |
| BMAD sprint artifacts (tech-specs) | `bmad/artifacts/` |
| **Slava's custom skills** | `.claude/commands/slava/` |
| Source code | `src/app/` |
| Unit tests | `src/tests/` or colocated |
| E2E tests | `e2e/` |
| UI components | `src/components/ui/` |

### Folder Structure Reference

```
content/
├── blog/               # Blog posts with lifecycle frontmatter (draft → preparing → review → published)
├── events/             # Discussion group topics (reading + questions + discussion)
├── stories/            # Raw founder stories, interview material (input to blog pipeline)
├── voice.md            # Founder voice guide (traits, patterns, vocabulary)
└── strategy.md         # Content strategy (philosophy, categories, audience)

docs/
├── technical/          # How things work (auth, db, testing, e2e)
├── learnings/          # Project learnings and retrospectives
├── visions/            # Historical explorations and proposals
├── bmad/               # BMAD workflow status files
├── archive/            # Archived docs (superseded)
├── hypotheses.md       # What we're testing
├── plan.md             # Product planning
└── learnings.md        # Project learnings (legacy, use learnings/ for new)

bmad/
└── artifacts/          # Tech-specs and sprint artifacts

features/               # Feature planning docs
├── p{N}_{name}.md      # Active specs (root = current work)
├── uat/                # UAT files for ralph-loop
│   └── p{N}.md         # e.g., uat/p112.md
├── done/               # Completed features
├── archive/            # Archived/deprioritized features
├── drafts/             # Early-stage drafts and ideas
└── research/           # Research results (permanent reference)
```

### Feature File Format

All feature files (`features/p{N}_{name}.md`) **must have frontmatter**:

```yaml
---
status: backlog | week | today | in-progress | blocked | done
type: bug | task | story        # optional
priority: p0 | p1 | p2 | p3     # strategic bucket — none = out of scope (see kanban.md)
tags: [tag1, tag2]              # optional
---

# P{N}: Feature Title

...content...
```

**Required:** `status` — determines kanban column placement

**Kanban workflow:** Backlog → Week → Today → In Progress → Done

**Feature number conflicts across worktrees:**

When multiple worktrees create features simultaneously, `p{N}` numbers can collide. Handle at merge (KISS):
- If merging a branch that has a `p{N}` conflicting with main, rename the incoming feature file and update all references
- Don't try to prevent conflicts at creation time — the added complexity isn't worth it for a rare edge case
- The person merging resolves it in 30 seconds

### Feature Spec Lifecycle

When completing a feature spec:

1. **Update frontmatter** in the spec file:
   ```yaml
   ---
   status: done
   completed_at: '2026-02-04'  # Add completion date
   # Keep existing fields (prepped_date, reviews, decisions, etc.)
   ---
   ```

2. **Move to done/** folder:
   ```bash
   git mv features/p{N}_{name}.md features/done/
   ```

3. **Commit together** — frontmatter update and file move in same commit.

**Kanban status values:** `backlog` → `week` → `today` → `in-progress` → `blocked` → `done` (or move to `archive/` if deprioritized)

**Spec readiness:** Tracked separately via `prepped_date` (null = draft, set = prepped). Agents set `prepped_date`, not `status`.

### Generated artifacts (OK to create)

These are gitignored and expected:
- `test-results/`, `playwright-report/` — Test output
- `dist/` — Build output

### When unsure

Ask the user. It's better to ask than to create a file in the wrong place or duplicate an existing concept.

