# P47: Prototypes Subdomain

## Problem

We're building many experimental features in worktrees (3-7+) that need to be merged somewhere. Currently considering merging all to main with a `/tree` route, but this creates problems:

### Why `/tree` in main app doesn't scale

| Problem | Impact |
|---------|--------|
| **Bundle bloat** | Each prototype adds ~20KB+. 100 prototypes = 2MB+ added to every user's download |
| **Build time degradation** | More code = slower CI/CD, slower dev server |
| **Dependency conflicts** | Prototype A needs library X v1, Prototype B needs v2 |
| **Breaking main** | A buggy prototype can crash the whole app |
| **Code review burden** | Every prototype needs production-level review |
| **Cleanup debt** | "Temporary" prototypes become permanent baggage |

### Current pain

- Worktrees 3-7 have experiments that need a home
- Want to iterate fast without production risk
- Need shareable links for feedback
- Don't want to pollute main codebase

## Solution

Create `prototypes.claritypledge.com` as a **separate Vite app** dedicated to experiments.

```
claritypledge.com           → Production app (clean, stable)
prototypes.claritypledge.com → Experiment playground (move fast, break things)
```

## Architecture

### Option A: Monorepo with Turborepo (Recommended)

```
/
├── apps/
│   ├── web/                 # Current claritypledge.com (move src/ here)
│   └── prototypes/          # New prototypes app
├── packages/
│   └── ui/                  # Shared components (extract from web)
├── turbo.json
└── package.json
```

**Pros:**
- Shared components without duplication
- Single `npm install`, coordinated builds
- Easy to promote prototype to production

**Cons:**
- Migration effort (~2-4 hours)
- Learning Turborepo

### Option B: Separate Repo (Simpler)

```
polymet-clarity-pledge-app/     # Current repo, unchanged
polymet-clarity-prototypes/     # New repo for experiments
```

**Pros:**
- Zero changes to main app
- Complete isolation
- Can start in 10 minutes

**Cons:**
- No shared components (copy-paste)
- Two repos to manage

### Option C: Subdirectory Deploy (Middle Ground)

```
/
├── src/                     # Main app (unchanged)
├── prototypes/              # Separate Vite app
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── vercel.json              # Route prototypes.* to /prototypes
```

**Pros:**
- Single repo
- Separate builds
- Easy Vercel config

**Cons:**
- Slightly awkward structure
- Manual component sharing

## Recommendation: Option C (Subdirectory)

Best balance of simplicity and isolation. Can upgrade to monorepo later if needed.

## Implementation Plan

### Phase 1: Setup (30 min)

1. Create `/prototypes` directory with fresh Vite + React + Tailwind
2. Configure Vercel for subdomain routing
3. Add shared env vars

### Phase 2: Structure (30 min)

```
/prototypes
├── src/
│   ├── experiments/           # Each prototype gets a folder
│   │   ├── wt3-feature/
│   │   ├── wt4-feature/
│   │   └── ...
│   ├── components/            # Shared prototype components
│   │   └── ExperimentCard.tsx
│   ├── pages/
│   │   ├── index.tsx          # Gallery of all experiments
│   │   └── [slug].tsx         # Individual experiment view
│   └── main.tsx
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

### Phase 3: Gallery Page

Simple index at `prototypes.claritypledge.com`:

```tsx
const experiments = [
  {
    slug: 'live-meeting-v1',
    title: 'Live Meeting Flow',
    description: 'Real-time understanding verification',
    status: 'active', // active | archived | promoted
    worktree: 3,
    date: '2025-01-07',
  },
  // ...
];
```

Each card links to the experiment, shows status, has "View" and "Feedback" buttons.

### Phase 4: Workflow Integration

Update CLAUDE.md and cloud agent to:
- Deploy prototype branches to `prototypes.claritypledge.com/[slug]`
- Auto-add to gallery index

## Vercel Configuration

```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "prototypes.claritypledge.com" }],
      "destination": "/prototypes/:path*"
    }
  ]
}
```

Add DNS record:
```
CNAME  prototypes  cname.vercel-dns.com
```

## Prototype Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Worktree   │────▶│  Prototype  │────▶│ Production  │
│  (develop)  │     │  (test)     │     │ (ship)      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
   wt3-wt7           prototypes.*        claritypledge.com
   local dev          get feedback         users see it
```

**Status flow:**
1. `draft` - Work in progress in worktree
2. `active` - Deployed to prototypes, gathering feedback
3. `archived` - Decided not to pursue
4. `promoted` - Merged to main app

## Success Criteria

- [ ] prototypes.claritypledge.com loads
- [ ] Gallery shows all experiments with status
- [ ] Can deploy worktree to prototype in < 5 min
- [ ] Main app bundle unchanged
- [ ] Prototypes can break without affecting prod

## Open Questions

1. **Auth sharing?** Should prototypes use same Supabase auth or separate?
   - Recommendation: Same auth (simpler), but separate database tables if needed

2. **Component sharing?** Copy-paste vs npm package vs monorepo?
   - Recommendation: Start with copy-paste, extract to package if >5 prototypes share code

3. **How long to keep prototypes?** Auto-archive after 30 days?
   - Recommendation: Manual archive, review monthly

## Not Doing

- Complex monorepo setup (premature)
- Feature flags in main app (wrong tool for experiments)
- Separate Supabase project (unnecessary isolation)
- CI/CD pipeline for prototypes (overkill for experiments)

## References

- Vercel monorepo docs: https://vercel.com/docs/monorepos
- Turborepo: https://turbo.build/repo (if we upgrade later)
