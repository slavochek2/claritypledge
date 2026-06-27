---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Source Code Rules

## Design System

- Blue for actions/CTAs
- Green for SUCCESS states ONLY
- NEVER: green action buttons, amber, orange, yellow, or purple in UI
- Full spec: [docs/design-system.md](docs/design-system.md)

## Point Display

Always use dedicated hooks and service methods — never raw service calls.
Wrong patterns cause N+1 queries and missing user positions.
See [architecture.md](docs/technical/architecture.md#point-display-patterns).

## Data Fetching

Always fetch profiles and witnesses separately — never nested selects:

```typescript
// Good
const profile = await getProfileBySlug(slug);
const witnesses = await getWitnesses(profile.id);

// Bad — unreliable with Supabase PostgREST
const { data } = await supabase.from('profiles').select('*, witnesses(*)');
```

## Avatar Usage (GravatarAvatar)

`GravatarAvatar` requires two props — always pass both:

```tsx
// Correct
<GravatarAvatar
  name={person.name}
  photoUrl={person.avatarUrl ?? undefined}   // show Google photo when available
  avatarColor={person.avatarColor}
  isPledger={person.hasPledged ?? false}     // shows blue ring for pledgers
/>

// Wrong — missing photoUrl (shows initials instead of Google photo)
<GravatarAvatar name={person.name} isPledger={false} />

// Wrong — isPledger omitted (TypeScript error, pledge ring never shown)
<GravatarAvatar name={person.name} photoUrl={person.avatarUrl} />
```

**Rules:**
- `photoUrl` — pass from data when available (`string | null | undefined` → coerce with `?? undefined`)
- `isPledger` — **required**, never omit. Use `?? false` when source field is `boolean | undefined`
- Prefer the `PersonAvatar` wrapper (takes `PersonRef`) when the data matches — it handles both correctly

## No Agent-Authored Hashtags

When agent-authored code or data creates tags on stories/points (Sifter, `/dev`, direct DB), the allowed system tags are `st1`–`st9`, `understanding`, `misunderstanding`, `v1`, `v2`. Any new tag value requires explicit founder approval before introduction — even a single use. User-created content can use any hashtag; this rule applies to agent-authored content only. `extractHashtags()` auto-extraction must not silently introduce new system-tag values.

## Code Style

- React 19 patterns — hooks declared at top of component
- Tailwind CSS for styling, shadcn/ui for UI components
- Never put dates in comments or documentation — use relative terms ("current", "recent")
- Routes use `slug` (e.g., `/p/john-doe`), not UUID — use `getProfileBySlug()` for route params

## DRY Trigger — Module-Level Helpers

Before defining a helper function inside a component, check if the same (or near-identical) function already exists elsewhere in the same file.

**If you are about to write the same helper in 2 or more components within the same file:** STOP. Propose moving it to module-level (above all components) instead.

This overrides plan literalism — even if the spec says "add X to component A" and "add X to component B," define it once at module scope and reference it from both. State the change before applying: "Promoting `helperName` to module-level — appears in both ComponentA and ComponentB."

## Replacing or Removing Exported Functions

Before replacing or removing any exported function: **grep all callers first**, then write the replacement.

```bash
grep -r "functionName" src/ --include="*.ts" --include="*.tsx"
```

Correct sequence: search → understand full impact → implement → update all call sites in the same commit. Writing the replacement before grepping silently breaks callers you didn't know existed.

## User-Controlled URL Sinks

Any new `<a href>`, `window.open()`, or `location.assign()` / `location.href =` that receives a user- or DB-derived string must pass through `safeLinkHref` before use:

```typescript
import { safeLinkHref } from '@/app/prototypes/events/location-utils';

// Good
<a href={safeLinkHref(locationInfo.href)} ...>

// Bad — user-controlled string reaches href unchecked
<a href={locationInfo.href} ...>
```

`safeLinkHref` returns `string | undefined` — only `http:` and `https:` schemes pass; `javascript:`, `data:`, `blob:`, and bare strings are blocked. React omits the attribute when `undefined`, which is a safe no-op.

**"Equivalent" means:** a wrapper that tests `new URL(href).protocol` against `['http:', 'https:']`. Ad-hoc `startsWith('http')` does not qualify — it passes `javascript:http...` bypass attempts.

## Navigation Pattern — Browse vs Focus Pages

New pages must declare their type:

- **Browse page** (/, /events, /sessions, /p/:slug, /me): BottomNav shows automatically. No back button.
- **Focus page** (/story/:id, /point/:id, /agreements/:id, /chat): Use `<FocusHeader onBack={...} />` at top of page content. BottomNav hides automatically via route list in `bottom-nav.tsx`.

**Adding a new focus page:** Also add its route prefix to the `focusRoutes` array in `bottom-nav.tsx`.

**Never define inline BackButton components** — use `FocusHeader` from `@/app/components/layout/focus-header`.

Full pattern: [docs/ux-patterns.md](../../docs/ux-patterns.md) — "Navigation Architecture".

## Prototype Routes

Experimental/demo routes use ONE prefix `/tree/*`, **dev-gated by default**. Never invent another (`/_proto`, `/_preview` retired). The gate is single-line per route — the same-line form is load-bearing: `pre-commit-checks.sh` warns on a `/tree` route in `App.tsx` lacking `import.meta.env.DEV` on the same line.

```tsx
{import.meta.env.DEV && <Route path="/tree/my-demo" element={<LazyRoute><MyDemo /></LazyRoute>} />}
```

**Gating controls REACHABILITY, not bundling.** In prod the route is never registered (unreachable — it 404s) and its path string leaves the always-loaded index chunk, but the component still ships. Two cases:

- **Persistent gallery** (`/tree` hub + demos kept for ongoing dev): lazy-import + single-line gate. The lazy chunk still deploys as dead, never-fetched code — `lazy(() => import())` is not tree-shaken. Accepted: unreachable, mock-free, no secrets.
- **Ephemeral `/view` demos**: static import + gate + **mandatory explicit removal** at `/dev` step 9.6. Gating never strips a static import (decisions.md: "DEV guard only prevents rendering"); lazy is also non-stripping — explicit removal is the only reliable strip.

A deliberately prod-reachable route here stays ungated and carries `// PROD-REACHABLE: <reason>` on its route line. Demo *components* may live in `components/_proto/` — a folder, not a route prefix.

### P955 Gate Fixtures (`/tree/_gate/*`)

Fixtures under `/tree/_gate/*` are **machine-owned permanent render substrate** for the P955 deterministic UI gate — NOT throwaway prototypes. Rules:
- **Never prune them.** The gate re-renders these states on every render-path change; deleting one re-introduces the ~5-min state-reach problem. (Contrast: `/tree/` root explorations ARE throwaway.)
- **Mock data must use OBVIOUSLY-FAKE values** (`test@example.com`, `user-id-1234`), never realistic production shapes — fixtures live in the public repo. (P955 Security Review.)
- Import the REAL routed component; switch state via a `?phase=` URL param. Reference pattern: `src/app/tree/_gate/example/GateFixture.tsx`.

## Inline vs. Skill Threshold

Inline src edits (without `/dev` or `/fix`) are only appropriate for:
- A single constant, string, color value, or typo — one line, no logic change

Anything beyond that — multi-line edits, logic changes, new components, refactors — must go through `/dev` (feature work) or `/fix` (bug fix). When in doubt, use the skill.

**Why:** Inline bypasses test generation, spec tracking, and the QA gate. The skill does the same work with none of the gaps.

## Branch Check Before Any Inline Edit

Skip this check for non-feature work (infra, hotfixes, copy-only changes with no P-number context).

Before making any inline `src/` edit for a feature, run:

```bash
git branch --show-current
```

Then check:
- **If on `main`**: stop. Inline edits must not land on main. Create a feature branch first, or use `/dev`.
- **If the branch name doesn't match the feature you're implementing** (e.g., you're on `feature/p451-...` but working on P457): stop and pick:
  - **(A) Create a new branch off main** — clean `/ship` path (recommended)
  - **(B) Stay here and cherry-pick** — implement here, move the commit to the right branch after
  - **(C) Proceed** — only if you're certain both changes belong to the same logical unit

Same logic as `/dev` step 0. The check takes 2 seconds; a wrong-branch commit takes 20 minutes to untangle.
