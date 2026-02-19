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

## Code Style

- React 19 patterns — hooks declared at top of component
- Tailwind CSS for styling, shadcn/ui for UI components
- Never put dates in comments or documentation — use relative terms ("current", "recent")
- Routes use `slug` (e.g., `/p/john-doe`), not UUID — use `getProfileBySlug()` for route params
