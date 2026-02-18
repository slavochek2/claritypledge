---
status: today
type: bug
rank: 5.0
workstream: C1
tags:
  - profile
  - points
  - positions
  - live
severity: high
date_reported: 2026-02-18
created_date: 2026-02-18
---

# P279: Profile Subject's Position on Points Never Shown to Visitors

## Bug Description

When User B visits User A's profile, User A's position on their own points is invisible. User B only sees their own position (if they have one). If they haven't taken a position, the buttons render with nothing highlighted — as if the point has no context at all.

This affects both the **Points tab** (standalone points) and the **Stories tab** (linked points expanded within story cards).

Viewing your own profile works correctly because viewer = profile subject — positions happen to be the same person.

The LinkedIn prototype works correctly because mock data has the author's position pre-populated. Production never loads it.

---

## Conceptual Model

Points have no owner. Anyone can take a position. When a point appears on someone's profile, it's there **because that person took a position on it** — taking a position is what causes a point to appear on a profile, removing it is what causes it to disappear.

So when you view a point on someone's profile, their position is always guaranteed to exist. It should be shown as context: "this is their profile, this is where they stand." The viewer's own position (if any) is shown separately via the interactive position buttons.

The current variable names `authorPosition` and `profileOwnerPosition` are conceptually wrong per this model and should be renamed to `profileSubjectPosition` as part of this fix.

---

## Root Cause

The service layer only ever loads **one user's position** per point — the viewer's. The `positions` map built in `profile-page-v2.tsx` is only populated with `currentUser.id`:

```typescript
// profile-page-v2.tsx ~line 270 — only viewer, never profile subject
if (point.userPosition && currentUser?.id) {
  positions[currentUser.id] = { ... };
}
```

Display code already correctly reads `point.positions[profile.id]` for the profile subject's position — it's wired right, just starved of data.

**Second problem (live mode):** `live-mode-view.tsx` calls the deprecated `getPointsByValidator` which loads zero position data and no counts. This must be updated to `getPointsForProfileDisplay` with the current user ID passed through.

---

## Affected Locations

| File | Issue |
|------|-------|
| `src/app/data/points-service.interface.ts` | Extend signature to support loading profile subject's positions |
| `src/app/data/points-service-real.ts` | Load profile subject positions alongside viewer positions |
| `src/app/data/points-service-mock.ts` | Update mock implementation to match |
| `src/app/data/stories-service-real.ts` | Load story author positions in `getStoriesByAuthorWithPoints` |
| `src/app/pages/profile-page-v2.tsx` | Populate `positions` map with profile subject's position; rename `profileOwnerPosition` → `profileSubjectPosition` |
| `src/app/components/social/story-card-with-links.tsx` | Rename `authorPosition` → `profileSubjectPosition` |
| `src/app/components/partners/live-mode-view.tsx` | Replace deprecated `getPointsByValidator` with `getPointsForProfileDisplay(userId, currentUser?.id)` |

---

## Acceptance Criteria

- [ ] When User B visits User A's profile (Points tab), User A's position on each point is visible — the button reflecting their stance is highlighted
- [ ] When User B visits User A's profile (Stories tab, expanded linked points), User A's position on each linked point is visible
- [ ] Viewing your own profile still works correctly (no regression)
- [ ] User B's own position (if they have one) is also shown — the viewer's interactive buttons are unaffected
- [ ] `live-mode-view.tsx` no longer calls `getPointsByValidator` — replaced with `getPointsForProfileDisplay` including currentUser ID
- [ ] Variable names `authorPosition` / `profileOwnerPosition` renamed to `profileSubjectPosition` throughout
- [ ] All existing E2E tests for profile pass (no regression)

---

## Dependencies

None. This bug is a prerequisite for P272 (live story point verification), which explicitly requires showing the other person's position on linked points in `/live`.
