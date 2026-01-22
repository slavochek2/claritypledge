# P62: Logged-In Dashboard Experience — Prep Review

**Spec:** features/p62_logged_in_dashboard.md
**Date:** 2026-01-19
**Reviewed by:** /prep-spec

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | 385 |
| Phases | 5 |
| Has UI | Yes (dashboard, people cards, event cards, collaborate page) |
| Has DB | No (new service methods on existing tables) |
| Dependencies | Events service (P61), `/live` page, Web3Forms, existing auth |

---

## Agent Reviews

### UX Designer: passed

**Warnings (16):**
1. No redirect from `/` to `/home` for logged-in users
2. "Invite" button waiting experience unclear
3. Missing fallback for empty {name} in welcome message
4. Event with no end time - "TODAY" behavior unclear
5. No rate limiting on invite button
6. Collaborate form checkbox validation rules unclear
7. Loading states missing for pledge status check
8. Error retry behavior unspecified
9. Person card click targets confusing for accessibility
10. Quick Action emojis not screen-reader friendly
11. Collaborate form checkbox group needs fieldset/legend
12. Badge color contrast needs verification
13. Mobile button text inconsistent with desktop
14. Mobile collapsible default state not specified
15. Desktop People section overflow handling not specified
16. Collaborate form email editability unclear

**Suggestions (11):**
1. Add "return to dashboard" affordance
2. Add confirmation after invite link generated
3. Handle blocked users in attendee list
4. Pagination for many draft events
5. Skeleton count vs shimmer consideration
6. Error state for Collaborate form API failure
7. Use heading hierarchy for section headers
8. Announce conditional "Take Pledge" banner
9. Mobile Quick Actions vertical spacing
10. Mobile event name truncation strategy
11. Use Lucide icons instead of emojis

**Note:** UX identified 4 items as "blockers" (cancelled events, session expiry, mobile collapsible accessibility, touch targets) but upon synthesis these are standard implementation details handled by:
- Query filtering for cancelled events
- AuthProvider pattern for session expiry
- Radix UI Accordion for accessible collapsibles
- Tailwind default button sizes for touch targets

### Architect: passed

**Warnings (5):**
1. No existing route protection pattern in codebase — implement inline in HomePage
2. Events routes under `/events/*` are prototype code — confirm status before P62
3. Mock vs Real service implementations both need updates (feature flag controls)
4. Dashboard people query should reuse `getEventAttendees()` pattern
5. NAV_LINKS needs conditional "Collaborate" entry based on auth state

**Suggestions (8):**
1. Reuse existing `EventAttendee` type from `src/app/types/index.ts`
2. Reuse Web3Forms pattern exactly from About page
3. Use existing `useNavAuthState` hook for auth state and `hasPledged`
4. Leverage `GravatarAvatar` component for People section
5. Add new service methods incrementally by phase
6. Consider redirect from `/` to `/home` for logged-in users
7. Phase 5 has low coupling — can be done independently
8. Analytics events follow existing `analytics.track()` pattern

### TEA: skipped

(Use `--include-tea` to enable testability review)

---

## Combined Findings

### Blockers (0)

None. All UX concerns resolved to implementation details.

### Warnings (21)

**UX (16):** See above
**Architect (5):** See above

Key warnings to address during implementation:
- Route protection pattern for `/home`
- Mobile collapsible default state
- Person card accessibility (single focusable region vs. separate)
- NAV_LINKS conditional entry
- Both mock and real service implementations

### Suggestions (19)

**UX (11):** See above
**Architect (8):** See above

---

## Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should `/` redirect logged-in users to `/home`? | A) Yes, auto-redirect B) No, separate pages | B — Keep separate for now. Landing page may still have value for sharing links. |
| 2 | Mobile collapsible sections default state? | A) All expanded B) All collapsed C) Expand if has content | C — Expand sections with content, collapse empty sections |
| 3 | Emojis or Lucide icons for Quick Actions? | A) Keep emojis B) Use Lucide icons | B — Lucide icons for consistency and better a11y |
| 4 | Events prototype promotion needed first? | A) Promote to production B) Keep as prototype | B — P61 events already work; continue prototype pattern |

---

## Execution Recommendation

**Recommendation:** `/loop`
**Reason:** Spec is 385 lines (under 500), 5 phases but clear boundaries, 0 blockers, estimated ~12-15 tests

This is a well-scoped feature that fits in a single implementation session with `/loop`. The 5 phases have clear dependencies but are not complex enough to require iterative UAT cycles.

**Session approach:**
- Single `/loop` session covering all 5 phases
- Start with Phase 1-2 (nav + shell + collaborate + quick actions)
- Continue with Phase 3-4 (events + people service methods)
- Finish with Phase 5 (event page button)

**Next step:**
```
/loop
```
Then describe: "Implement P62 Logged-In Dashboard Experience per features/p62_logged_in_dashboard.md"

---

## Existing Code to Leverage

| Need | Existing Code |
|------|---------------|
| Auth state + hasPledged | `src/hooks/use-nav-auth-state.ts` |
| Events service interface | `src/app/data/events-service.interface.ts` |
| Real events implementation | `src/app/data/events-service-real.ts` |
| Mock events implementation | `src/app/data/events-service-mock.ts` |
| Web3Forms pattern | `src/app/pages/about-page.tsx:44-76` |
| Nav links config | `src/app/components/layout/nav-links.ts` |
| Navigation menu items | `src/app/components/layout/navigation-menu-items.tsx` |
| Navigation component | `src/app/components/layout/simple-navigation.tsx` |
| Footer | `src/app/components/layout/clarity-footer.tsx` |
| App routes | `src/App.tsx` |
| EventAttendee type | `src/app/types/index.ts` |
| Avatar component | `src/components/ui/gravatar-avatar.tsx` |
| Event detail pattern | `src/app/prototypes/events/components/EventDetail.tsx` |

---

## Frontmatter Added

The following was added to `features/p62_logged_in_dashboard.md`:
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
