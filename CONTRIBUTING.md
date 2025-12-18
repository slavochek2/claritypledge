# Contributing to Understanding Pledge

Welcome! This guide will help you get up and running quickly.

## Licensing & Contributor License Agreement (CLA)

This project uses a **Dual Licensing** model to ensure long-term sustainability while remaining true to open-source values.

### 1. The Project License (AGPL v3)
The code in this repository is licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE)**.
- **For Users:** This ensures that if anyone builds a public service (SaaS) using this code, they must open-source their improvements. This prevents companies from taking our work, closing it off, and competing with us using our own code.
- **For You (The Contributor):** You can use this code freely under the terms of the AGPL, **including for commercial purposes** (just like anyone else).

### 2. The Contributor License Agreement (CLA)
To contribute, you must agree to our [CLA](./CLA.md).
- **You Retain Copyright:** You still own the code you write. You can use your own contributions in other projects or sell them elsewhere.
- **What You Grant Us:** You give the project owner the right to use your contribution and, importantly, the right to **relicense** it.
- **Why?** This allows the project owner to offer a "Commercial License" to companies who want to use the software without the strict open-source requirements of the AGPL. Revenue from these commercial licenses supports the project's maintenance and development.

**In Short:**
- **AGPL** keeps the code free and open for the community.
- **CLA** allows the project to generate revenue from enterprises to pay for that freedom.

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd polymet-clarity-pledge-app
npm install
```

### 2. Environment Setup

Copy the example env file:

```bash
cp .env.example .env.local
```

Then fill in your Supabase credentials:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Need credentials?** Ask the project owner for:
- Access to the Supabase project (recommended), OR
- A set of credentials for the shared dev environment

### 3. Run Development Server

```bash
npm run dev
```

App runs at `http://localhost:5173`

## Understanding the Codebase

### Key Files to Read First

1. **[CLAUDE.md](./CLAUDE.md)** — Comprehensive architecture documentation. Read the "Architecture" section to understand the auth flow and data layer.

2. **[README.md](./README.md)** — Project overview and setup details.

### Critical Architecture Decision

The authentication system uses a **Reader-Writer pattern**. Profile creation happens ONLY in `src/auth/AuthCallbackPage.tsx` after email verification.

**Do not** create profiles in hooks, context, or other locations. This separation prevents race conditions. See CLAUDE.md for full explanation.

### Where Things Live

| What you're looking for | Where to find it |
|------------------------|------------------|
| Application code | `src/app/` |
| Auth module | `src/auth/` |
| API layer | `src/app/data/api.ts` |
| UI components (base) | `src/components/ui/` |
| Feature components | `src/app/components/` |
| Database schema | `supabase/schema.sql` |
| Technical docs | `docs/technical/` |
| Feature planning | `features/` |

## Development Workflow

### Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run ESLint
npm test             # Run unit tests
npm run test:e2e     # Run E2E tests (requires setup)
```

### Testing Magic Links Locally

Magic links redirect to `localhost:5173` in development. To test:

1. Sign up with a real email you can access
2. Check your inbox for the magic link
3. Click it — you'll be redirected to your local dev server

### E2E Tests

E2E tests require additional setup:

1. Create `.env.test.local` with `SUPABASE_SERVICE_ROLE_KEY`
2. See [docs/technical/e2e-testing.md](./docs/technical/e2e-testing.md) for full guide

## Code Style

- TypeScript strict mode
- React 19 patterns
- Tailwind CSS for styling
- Follow existing patterns in the codebase

## Making Changes

### Before You Code

1. Check `features/` for existing feature docs
2. Read relevant sections of CLAUDE.md
3. Search codebase for similar implementations (avoid duplication)

### Branching

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Submitting Changes

1. Ensure `npm run lint` passes
2. Ensure `npm test` passes
3. Test your changes manually
4. Push and open a pull request

## AI-Assisted Development (Optional)

This project uses **BMAD** workflows for AI-assisted development. If you use Claude Code or similar tools:

- BMAD configuration lives in `.bmad/`
- Slash commands are available (e.g., `/bmad:bmm:agents:dev`)
- Sprint artifacts go to `bmad/artifacts/`
- Workflow outputs go to `docs/bmad/`

**If you don't use AI tools:** You can completely ignore the `.bmad/` folder. The codebase works without it.

### About CLAUDE.md

`CLAUDE.md` is project instructions for Claude Code. It contains:
- Architecture documentation (useful for all developers)
- Code style conventions
- Common gotchas

Even if you don't use Claude Code, the architecture docs in CLAUDE.md are worth reading.

## Common Gotchas

1. **Routes use `slug`, not UUID** — Profile pages are `/p/john-doe`, not `/p/uuid`. Use `getProfileBySlug()` for route lookups.

2. **Witnesses fetched separately** — Don't try to join witnesses in profile queries. Fetch them separately.

3. **RLS allows open witnessing** — Any authenticated user can add witnesses to any profile. This is intentional (endorsement feature).

4. **No database trigger for profiles** — Profile creation happens in code, not via Supabase trigger.

## Getting Help

- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Use the `/debug` page for diagnostics
- Ask the project owner

---

Happy coding!
