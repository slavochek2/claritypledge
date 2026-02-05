# Architecture Patterns

Technical patterns and conventions used in this codebase. For product decisions (why we chose X over Y), see [decisions.md](../decisions.md).

## Service Layer Pattern

**Pattern:** Interface-based services with feature flag switching between mock and real implementations.

```
src/app/data/
├── {domain}-service.interface.ts  # Type definitions
├── {domain}-service-mock.ts       # Mock implementation (for tests)
├── {domain}-service-real.ts       # Real Supabase implementation
└── {domain}-service.ts            # Exports based on feature flag
```

**How it works:**

```typescript
// {domain}-service.ts
const USE_REAL_API = import.meta.env.VITE_USE_REAL_{DOMAIN}_API === 'true';
export const {domain}Service = USE_REAL_API ? realService : mockService;
```

**When to use which:**

| Context | Implementation | Why |
|---------|---------------|-----|
| Unit tests | Mock (import directly) | Fast, no DB dependency |
| Local dev | Real | Configured via `.env.local` |
| Production | Real | Always |

**Current services using this pattern:**
- `events-service` (`VITE_USE_REAL_EVENTS_API`)
- `stories-service` (`VITE_USE_REAL_STORIES_API`)
- `points-service` (`VITE_USE_REAL_POINTS_API`)
- `calibration-service` (`VITE_USE_REAL_CALIBRATION_API`)

**Reference:** [decisions.md § 2026-01-19](../decisions.md) for original decision context.

---

## Data Layer Architecture

Two data layers exist in parallel:

| Layer | Location | Used By |
|-------|----------|---------|
| Interface-based services | `src/app/data/{domain}-service*.ts` | Event pages, Stories, Points, Calibration |
| Legacy API | `src/app/data/api.ts` | sign-pledge-page, clarity-tax-section, profiles |

**Migration path:** New features should use the interface-based pattern. Legacy `api.ts` will be migrated incrementally.

---

## Component Hierarchy

### Avatar Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GravatarAvatar` | `src/components/ui/gravatar-avatar.tsx` | Base avatar with photo/initials/badge support |
| `PersonAvatar` | `src/components/ui/person-avatar.tsx` | Wrapper ensuring pledge badge via `PersonRef` type |
| `PersonRow` | `src/app/components/` | Compound component (avatar + name + subtitle) |

**Rule:** Use `PersonAvatar` for standalone person avatars. Use `PersonRow` for list items with additional metadata.

**Reference:** [P118 spec](../../features/p118_person_avatar_consolidation.md) for consolidation rationale.
