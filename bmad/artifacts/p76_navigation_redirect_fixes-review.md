# P76 Navigation & Post-Auth Redirect Fixes — Prep Review

**Spec:** features/p76_navigation_redirect_fixes.md
**Date:** 2026-01-19
**Reviewed by:** /prep-spec

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | 107 |
| Phases | 1 |
| Has UI | Yes (back buttons, navigation) |
| Has DB | No |
| Dependencies | None (uses existing hooks) |

---

## Agent Reviews

### UX Designer — Passed with clarifications needed

- [blocker] AC1 and AC2 don't specify what happens if the user is already logged in when clicking RSVP. Should the redirect still activate, or should they go directly to the event?
- [blocker] "RSVP auto-completed" is ambiguous — does the form submit automatically or pre-fill and wait for confirmation?
- [warning] AC3 tests login→signup param preservation but doesn't address signup→login direction
- [warning] No fallback defined if `/home` doesn't exist or redirect URL is invalid
- [warning] AC7 doesn't clarify back behavior for external link arrivals vs in-app navigation
- [suggestion] Document current broken behavior for QA verification
- [suggestion] Add loading states during redirect processing
- [suggestion] Handle error states for malformed redirect URLs
- [suggestion] Mobile OAuth may behave differently with URL params
- [suggestion] Add screen reader announcements for redirects

### Architect — Passed with clarifications needed

- [blocker] Google OAuth param forwarding needs verification — must confirm Supabase preserves custom params through the full OAuth round-trip
- [warning] Settings page spec says change `/me` to `/home`, but current code links to user's profile (`/p/${user?.slug}`). Clarify if this should change.
- [warning] Profile page has no back button currently — new navigation needs to be added, not modified
- [warning] Magic link emails may contain longer URLs with params — verify Supabase doesn't truncate
- [suggestion] Extract `ConditionalBackLink` component if pattern used 3+ times
- [suggestion] Use React Router `useNavigate()` instead of `window.location.href` for param preservation
- [suggestion] Add E2E test for RSVP redirect critical path
- [suggestion] Consider whether `/events` (list) is better back target than `/home` for EventDetail

### TEA — Skipped (use --include-tea to enable)

---

## Combined Findings

### Blockers (3)

| # | Finding | Source |
|---|---------|--------|
| 1 | AC1/AC2 ambiguous: "RSVP auto-completed" — does form submit automatically or pre-fill? | UX |
| 2 | AC1/AC2 missing case: what happens if already-logged-in user clicks RSVP? | UX |
| 3 | Google OAuth param forwarding unverified — Supabase may not preserve custom params through OAuth round-trip | Architect |

### Warnings (5)

| # | Finding | Source |
|---|---------|--------|
| 1 | Settings page spec inaccurate — current code links to profile, not `/me` | Architect |
| 2 | Profile page has no back button to modify — needs new navigation added | Architect |
| 3 | AC3 only tests login→signup direction, not signup→login | UX |
| 4 | No fallback defined for invalid redirect URLs | UX |
| 5 | Magic link email URLs may be truncated with long params | Architect |

### Suggestions (8)

| # | Finding | Source |
|---|---------|--------|
| 1 | Document current broken behavior for QA reference | UX |
| 2 | Add loading states during redirect processing | UX |
| 3 | Handle error states for malformed redirects | UX |
| 4 | Verify mobile OAuth param preservation | UX |
| 5 | Add screen reader announcements for redirects | UX |
| 6 | Extract `ConditionalBackLink` reusable component | Architect |
| 7 | Use React Router navigate vs window.location | Architect |
| 8 | Add E2E test for RSVP redirect path | Architect |

---

## Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | What does "RSVP auto-completed" mean? | A) Form submits automatically B) Form pre-fills, user confirms | **B** — Pre-fill is safer UX, gives user control |
| 2 | What happens for logged-in user clicking RSVP? | A) Same redirect flow B) Direct RSVP (no auth) | **B** — Auth not needed, direct action is simpler |
| 3 | Settings back button: where should it go? | A) Profile (`/p/slug`) B) Dashboard (`/home`) | **B per spec** — Dashboard is central hub |
| 4 | Should param preservation work both directions? | A) Login→signup only B) Bidirectional | **B** — Users may switch either direction |

---

## Execution Recommendation

**Recommendation:** `/loop`
**Reason:** Spec is 107 lines, single phase, 8 files with small focused changes. Blockers are clarification items that can be resolved in <5 min before starting.

**Next step:**
1. Resolve the 4 decisions above
2. Run `/loop` and describe the task from the spec

---

## Pre-Implementation Checklist

Before starting, verify these Architect concerns:

- [ ] **Google OAuth params**: Test that `redirectTo` URL with custom params survives Supabase OAuth round-trip
- [ ] **Settings back button**: Confirm changing from profile to dashboard is intended
- [ ] **Profile page**: Confirm adding new back button (not modifying existing)
