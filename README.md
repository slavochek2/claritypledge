# ClarityPledge

> Every person, including you, has a need to be understood. And almost no one gets enough of it — especially from the people who disagree with them.
>
> We crave honesty in relationships that matter to us. But when people share honestly and are rarely understood the way they mean it, they stop sharing. Not because they lose courage. Because honesty without verification of understanding collapses from the inside.
>
> What's left is a quiet anxiety you can't name — two contradictory beliefs with no way to check which one is true. The gap between what you meant and what others understood is often invisible to both sides. No one discovers it. No one sees a reason to measure understanding.
>
> But how do you verify whether you truly understood — in the way they mean it? How do you prove it to them? And how do you empower those you care about — and those you depend on — to understand you, even when you have strong disagreements?

ClarityPledge is an open-source practice system that measures whether understanding actually happened — not whether people think it did. It's a practice, not a SaaS product — like NVC or meditation, with a community and a tool around it.

**Progress & traction evidence — how to evaluate this project** — [Progress](docs/progress.md)
**Business strategy** — [Lean Canvas](docs/lean-canvas.md)
**The epistemological foundations** — [Philosophy](docs/philosophy.md)
**How change spreads** — [Theory of Change](docs/theory-of-change.md)
**What we're testing** — [Hypotheses](docs/hypotheses.md)
**Core concepts** — [Definitions](docs/definitions.md)
**How we judge our own progress** — [Research Programme](docs/research-programme.md)

## As a Research Programme

This is a **research programme with a commercial delivery arm**.

In practice that means the project runs on a [Lakatosian](docs/research-programme.md) structure, in public:

- A **hard core** of seven commitments (K1–K7) that refutations are deliberately routed *away* from — written down, each carrying the observation that *would* count as a hit on it. An unstated core is one that immunizes itself silently.
- A **protective belt** of falsifiable bets that absorb those refutations and get re-cut when they fail — [hypotheses.md](docs/hypotheses.md), every entry carrying a falsifier.
- A **progressivity ledger**: the project's progress metric is not "hypotheses killed per month" (that measures activity — a degenerating programme kills them just as fast) but **corroborated novel predictions** — what a new framing predicted that the one it replaced didn't, written down *before* the test.
- A **rivals registry** tracking the programmes that might explain our evidence better than we do, scored on our own data. The strongest rival currently on the board is the one saying we are not needed.
- A **stopping rule** that fires when the programme stops moving, and a monthly health check that returns one verdict: progressive, stagnating, or degenerating.

The ledger reads thin — one corroborated novel prediction, at n=1. The honest conflict of interest — the same person owns the core, routes the refutations, and judges the rivals — is [recorded in the doc itself](docs/research-programme.md#known-conflict-of-interest) rather than argued away.

Commercially the bet is ordinary: the practice has to be worth paying for. Epistemically it is not — **revenue is treated as proof of impact, not as the goal**, and a failed hypothesis means the delivery method changes, not the mission.

## What's in This Repo

Two things worth exploring, depending on what brought you here:

**The product** — a TypeScript web app for practicing calibrated communication. Stories, points, real-time verification sessions (`/live`), calibration profiles. Built on React 19 + Supabase.

**The software delivery process** — an agent-native pipeline built on Claude Code with 30+ AI skills, spec-driven development, and quality gates that tell you what's safe to skip. If you're interested in how a solo founder builds with AI agents, start with [Software Delivery Process](docs/software-delivery-process.md).

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Supabase account (for backend)

### Setup

```bash
git clone https://github.com/slavochek2/claritypledge.git
cd claritypledge
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### Database

```bash
./scripts/migrate.sh
```

Pushes all migrations in `supabase/migrations/` to your Supabase project.

### Run

```bash
npm run dev
```

App runs at `http://localhost:5001`.

## Tech Stack

React 19 + TypeScript + Vite, Tailwind CSS + Radix UI, Supabase (PostgreSQL + Auth), React Router, React Hook Form + Zod.

## Development

```bash
npm run dev          # Dev server (localhost:5001)
npm run build        # Production build
npm test             # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run lint         # ESLint
```

Full architecture guide: [docs/technical/architecture.md](docs/technical/architecture.md)

## Project Structure

```
src/app/           Application code (components, pages, data layer)
docs/              Product vision, business model, epistemology
docs/technical/    Architecture, auth, database, testing guides
features/          Feature specs and UATs
e2e/               Playwright E2E tests
supabase/          Database migrations and schema
.claude/           AI agent skills, rules, and commands
```

## Talk to This Repo

This project is built with Claude Code. Clone it, open Claude Code, and ask:

- **"What is ClarityPledge?"** — assembles a picture from the docs
- **"Explain your delivery process"** — reads the skill files and walks you through the pipeline
- **"Which of your skills would work for my project?"** — recommends what's portable
- **"How did your dev process evolve?"** — reads decision history and git log

More: [Software Delivery Process](docs/software-delivery-process.md)

## License

AGPL-3.0 — See [LICENSE](./LICENSE) for details.

The code is open. The moat is the network, the data, and the practice.
