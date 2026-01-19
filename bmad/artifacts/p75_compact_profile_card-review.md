# P75: Compact Profile Card — Prep Review

**Spec:** features/p75_compact_profile_card.md
**Date:** 2026-01-19
**Reviewed by:** /prep-spec

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | 108 |
| Phases | 0 (implementation steps only) |
| Has UI | Yes |
| Has DB | No |
| Dependencies | None |

---

## Agent Reviews

### UX Designer: PASSED (0 blockers after clarification)

**Initial blockers (clarified):**
- ~~Unverified email owner state~~ → Keep existing full-page verification prompt unchanged
- ~~User without slug (/live users)~~ → /me page verification flow unchanged; only verified profile views get compact card
- ~~Focus management~~ → Existing focus behavior maintained; enhance with aria-labels

**Warnings (6):**
- [warning] Missing transition: What happens after "Take the Pledge" click? (Opens /sign-pledge page - existing behavior)
- [warning] Missing loading skeleton for compact card - should match dimensions to prevent layout shift
- [warning] Blue ring for pledgers has no screen reader equivalent - add `aria-label` or visually hidden text
- [warning] "View their pledge" link text not descriptive - include person's name for screen readers
- [warning] Touch target size: Share button must be at least 44x44px
- [warning] Responsive behavior at narrow screens (<360px) not specified - consider vertical stacking

**Suggestions (7):**
- Specify share button behavior (copy URL to clipboard + toast feedback)
- Define truncation rules for long names/roles (CSS ellipsis)
- Add `aria-label="Share profile"` to share button
- Verify blue ring color contrast (3:1 for graphical elements)
- Remove fixed 150px height constraint or make responsive
- Add analytics tracking for `share_button_clicked`
- Consider button styling consistency between owner/visitor views

### Architect: PASSED (0 blockers after clarification)

**Initial blocker (clarified):**
- ~~Share button already exists~~ → Use simple clipboard copy pattern, not full ShareDropdown component

**Warnings (4):**
- [warning] Spec says `/me` but it's a redirect page - compact card only applies to `/p/:slug` verified views
- [warning] Profile page has 5 distinct states - spec only addresses 4. Unverified owner flow stays unchanged.
- [warning] Existing tests (`profile-page.test.tsx`, 414 lines) need updates for new layout
- [warning] 150px height max may be tight with all elements - verify in implementation

**Suggestions (4):**
- Reuse existing utilities: `getInitials()`, `getAvatarColor()`, `copyToClipboard()`
- Extract `compact-profile-card.tsx` as reusable component for future use
- Keep full-page verification prompt unchanged (critical auth flow)
- Use mobile-first flex layout that works down to 320px

**Dependencies:** None (no DB migrations, no new packages)
**Context pressure:** Single session feasible (~2-3 hours)

### TEA: SKIPPED (use --include-tea to enable)

---

## Combined Findings

### Blockers (0)
None - all initial blockers resolved through clarification.

### Warnings (8 unique)
1. Loading skeleton dimensions should prevent layout shift
2. Blue ring needs screen reader equivalent (`aria-label` or visually hidden text)
3. "View their pledge" link needs descriptive text for accessibility
4. Share button touch target must be >= 44x44px
5. Responsive stacking behavior needed for narrow screens
6. Existing tests (`profile-page.test.tsx`) need updates
7. 150px height constraint may be too tight
8. Unverified owner flow must remain unchanged

### Suggestions (8 unique)
1. Use simple clipboard copy + toast for share (not full ShareDropdown)
2. Define CSS ellipsis truncation for long names/roles
3. Add `aria-label="Share profile"` to share button
4. Extract as `compact-profile-card.tsx` for reuse
5. Track `share_button_clicked` analytics event
6. Verify blue ring meets 3:1 contrast ratio
7. Use mobile-first flex layout
8. Consider consistent button styling between owner/visitor views

---

## Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Metrics row? | A) No metrics B) Witness count only C) Placeholder | **A) No metrics** — simplest, per spec "Out of Scope" |
| 2 | Pledge CTA location? | A) Below card B) Inside card right C) Separate section | **A) Below card** — matches spec design, easiest to implement |
| 3 | Extract component? | A) Inline in profile-page B) New compact-profile-card.tsx | **B) New component** — enables reuse in pledgers list, future feeds |

---

## Execution Recommendation

**Recommendation:** `/loop` (single session)
**Reason:**
- Spec is 108 lines (< 500 threshold)
- 0 formal phases (< 3 threshold)
- ~8 tests estimated (< 15 threshold)
- No blockers
- Architect estimates 2-3 hours

**Next step:**
```
/loop
```
Then describe: "Implement P75 compact profile card per features/p75_compact_profile_card.md"

---

## Implementation Notes

**Key files to modify:**
- `src/app/pages/profile-page.tsx` — Main profile page (change card layout for verified views)
- `src/app/pages/profile-page.test.tsx` — Update tests for new layout

**New file:**
- `src/app/components/profile/compact-profile-card.tsx` — Reusable component

**Existing code to reuse:**
- `@/lib/utils`: `getInitials()`, `getAvatarColor()`, `copyToClipboard()`
- `@/components/ui/button`: Button component
- `lucide-react`: Share2 icon

**What NOT to change:**
- Unverified owner verification prompt (lines 151-234 in profile-page.tsx)
- `/me` page verification flow
- Loading and "not found" states (just update styling)

---

## Frontmatter to Add

Add this to `features/p75_compact_profile_card.md`:

```yaml
---
status: prepped
prepped_date: 2026-01-19
prepped_by: /prep-spec
reviews:
  ux: passed
  architect: passed
  tea: skipped
execution: /loop
---
```
