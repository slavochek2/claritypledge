---
status: done
sort_order: 1000003
completed_at: '2026-02-04'
---
# P97: Integrate Prototype UI into Production

**Status:** On Hold (deprioritized 2026-01-27 — see roadmap)

## Overview

Wire working prototype components directly into production routes. No rebuild — the prototype works, just use it.

**Source:** `src/app/prototypes/linkedin-like/`
**Approach:** Integrate first, refactor incrementally during backend phase

## What We're Integrating

| Area | Production Route | Prototype Source | Backend needed? |
|------|------------------|------------------|-----------------|
| **Profile** | `/p/:slug` | `Profile.tsx` | Yes (Stories/Points API) |
| **Story detail** | `/story/:id` | `StoryDetail.tsx` | Yes |
| **Point detail** | `/point/:id` | `PointDetail.tsx` | Yes |
| **Navigation (logged-in)** | Header + bottom nav | `PrototypeHeader.tsx`, `BottomNav.tsx` | No |
| **My Events visual** | `/home` | `MyEvents.tsx` (pattern only) | No — backend works |

## What We're NOT Integrating

| Excluded | Location | Reason |
|----------|----------|--------|
| Sifter | `/sift`, `Sift.tsx` | Future feature — no "Create" in nav |
| Verification flow | `/live` mock, `Live.tsx` | Future feature — production `/live` stays |
| Ideas/Feed | Various | Legacy, not in scope |

## Empty States (No Mock Data)

Users see the new design. Sections without data show empty states:
- "No stories yet"
- "No points yet"

**Demo profile:** `/p/slava` has manually-entered real data for showcasing.

## Navigation Changes

| User State | Desktop | Mobile |
|------------|---------|--------|
| **Logged out** | Unchanged (Events, Pledgers, Manifesto, About) | Unchanged |
| **Logged in** | Icon nav: My Events, My Profile + avatar dropdown | Header avatar + bottom tab bar |

**Removed from nav:** "Create" button (no Sifter yet)

## My Events Changes (Visual Only)

Same backend, same data. Visual tweaks:
- Button placement adjustments
- Add "Co-create" link
- Match prototype styling

## Integration Steps

1. **Routes** — Wire prototype components into `App.tsx`
2. **Auth** — Gate `/home` for logged-in users; `/p/:slug` stays public
3. **Profile adapter** — Connect slug lookup to prototype Profile component
4. **Navigation** — Conditional render: logged-in gets new nav, logged-out unchanged
5. **Empty states** — Add "No stories/points yet" messaging

## Success Criteria

- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] `/p/:slug` shows new profile design
- [ ] `/story/:id` and `/point/:id` routes work
- [ ] Logged-in user sees new navigation
- [ ] Non-logged-in user sees unchanged navigation
- [ ] My Events page shows visual updates

## What Comes Next

Backend phase (separate spec):
- Stories/Points database schema
- API layer
- Connect UI to real data

## Learnings (Why This Approach)

Previous attempts failed:
1. **TDD rebuild** — 42 iterations, stuck on navigation (routes mismatch)
2. **Simplified rebuild** — Visual fidelity lost in translation

**Key insight:** Rebuild doesn't work for UI. The prototype works — just use it.

See: [docs/learnings/p97-ralph-attempt-1.md](../docs/learnings/p97-ralph-attempt-1.md)

## Files Reference

### Prototype (source)
- `src/app/prototypes/linkedin-like/components/Profile.tsx`
- `src/app/prototypes/linkedin-like/components/StoryDetail.tsx`
- `src/app/prototypes/linkedin-like/components/PointDetail.tsx`
- `src/app/prototypes/linkedin-like/components/PrototypeHeader.tsx`
- `src/app/prototypes/linkedin-like/components/BottomNav.tsx`
- `src/app/prototypes/linkedin-like/components/MyEvents.tsx`

### Production (targets)
- `src/App.tsx` — Routes
- `src/app/pages/profile-page.tsx` — Replace with prototype Profile
- `src/app/components/layout/` — Navigation components
