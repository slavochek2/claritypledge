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

## Code Style

- React 19 patterns — hooks declared at top of component
- Tailwind CSS for styling, shadcn/ui for UI components
- Never put dates in comments or documentation — use relative terms ("current", "recent")
- Routes use `slug` (e.g., `/p/john-doe`), not UUID — use `getProfileBySlug()` for route params
