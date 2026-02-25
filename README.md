# Clarity Pledge

**See the gap between how well you think you communicate and how well you actually do — then close it.**

A sensemaking platform that reveals calibration gaps in understanding and motivates people to close them.

## What Is This?

**Learn more:**
- [Problem & Solution](docs/lean-canvas.md) — Why this matters
- [Core Concepts](docs/definitions.md) — Stories, Points, Verification

## Go Deeper

- [Lean Canvas](docs/lean-canvas.md) — Business model and value proposition
- [Milestones](docs/milestones/) — What we're building, testing, and when we stop
- [Decisions](docs/decisions.md) — Build sequence, trade-offs, why X over Y
- [Philosophy](docs/philosophy.md) — Epistemological foundations (optional deep-dive)
- [Theory of Change](docs/theory-of-change.md) — How change spreads (cascade, √N)

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS + Radix UI components
- **Backend:** Supabase (PostgreSQL + Auth)
- **Routing:** React Router
- **Forms:** React Hook Form + Zod validation

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for backend)

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/your-username/understanding-pledge.git
cd understanding-pledge
npm install
```

### 2. Configure Supabase

**Get your Supabase credentials:**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project settings → API
3. Copy the **Project URL** and **anon public key**

**Update the Supabase client:**

Edit `src/lib/supabase.ts`:

```typescript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_ANON_KEY'; // Should start with "eyJ..."
```

⚠️ **Important:** The anon key must be a JWT token (~200 chars), not a `sb_publishable_...` format.

### 3. Setup Database

Apply the schema and all migrations to your Supabase project:

```bash
./scripts/migrate.sh
```

This pushes all migrations in `supabase/migrations/` via `supabase db push`, creating the tables, RLS policies, and any incremental schema changes. Profile creation happens in application code (not via database trigger). See [CLAUDE.md](./CLAUDE.md) for architecture details.

### 4. Run Development Server

```bash
npm run dev
```

App will be available at `http://localhost:5001`

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and AI agent instructions.

```
├── src/app/           # Application code (components, pages, data layer)
├── docs/              # Documentation (technical guides, vision docs)
├── features/          # Feature planning (specs, UATs)
├── e2e/               # Playwright E2E tests
└── supabase/          # Database schema
```

## Development Commands

```bash
npm run dev          # Start dev server (localhost:5001)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

See `.env.example` for optional configuration (feature flags, Sentry).

## Documentation

| Topic | Document |
|-------|----------|
| Architecture & conventions | [CLAUDE.md](./CLAUDE.md) |
| Database schema | [docs/technical/database.md](./docs/technical/database.md) |
| Authentication | [docs/technical/authentication.md](./docs/technical/authentication.md) |
| E2E testing | [docs/technical/e2e-testing-guide.md](./docs/technical/e2e-testing-guide.md) |

## License

AGPL-3.0 - See [LICENSE](./LICENSE) for details.
