# P70_2: Consent Flow — Prep Review (v2)

**Spec:** features/p70_2_consent_flow.md
**Date:** 2026-01-19
**Reviewed by:** /prep-spec --force

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | 247 |
| Phases | 0 explicit (implicit: consent flow → session start) |
| Has UI | Yes (consent dialog, confirmation toast, sparkle indicator) |
| Has DB | Yes (`ai_insights_enabled` column on `clarity_sessions`) |
| Dependencies | P70_1 (prerequisite, completed), P41 (future - coaching teaser) |

---

## Agent Reviews

### UX Designer: PASSED (with warnings)

**Blockers:** None (all 5 original blockers resolved)

**Warnings:**
- Race condition on simultaneous consent submission unaddressed in spec
- Loading/waiting state during consent sync not specified (creator waits for joiner)
- Button labels `[Enable AI Insights] [Skip]` reversed from convention (positive should be right)
- "Skip" label still ambiguous—sounds like deferral, but it's permanent decline
- Mobile touch target sizes unspecified (44px minimum recommended)
- Reconnection scenario incomplete (what if answer lost before persisted?)
- Consent order creates asymmetric experience (creator always first)

**Suggestions:**
- Add "your choice is private" reassurance to reduce social pressure
- Show "Waiting for partner..." indicator after creator answers
- Use Lucide Sparkles icon instead of emoji for consistency
- Confirmation dialog could auto-dismiss after X seconds
- Consider softer framing for 60s timeout prompt

### Architect: PASSED

**Blockers:** None (all 5 original blockers resolved)

**Warnings:**
- Recording start logic needs modification to check `ai_insights_enabled` first
- Consent state sync needs drift detection added to polling fallback
- "Partner joined" delay complicates existing joiner detection flow
- Migration file location not specified (should be `supabase/migrations/20260120_...`)
- Consent timeout UX not fully specified (what if creator clicks [Wait]?)

**Suggestions:**
- Reuse existing Dialog `hideCloseButton` prop
- Follow sealed-bid pattern from ratings (`checkerSubmitted`/`responderSubmitted`)
- Consider `consentPhase` enum for clearer state machine
- Add Mixpanel tracking for consent analytics
- Use `toast()` from sonner for neutral messages (already imported)
- Consider persisting `ai_insights_enabled` at session end, not consent time

### TEA: SKIPPED
Use `--include-tea` to enable testability review.

---

## Combined Findings

### Blockers (0)
All 5 original blockers resolved. Ready for implementation.

### Warnings (6 unique)

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Race condition on simultaneous consent | Use sealed-bid pattern from ratings; both answers stored separately, combined at read time |
| 2 | Recording start needs gating | Add condition check for `ai_insights_enabled` before starting recording |
| 3 | "Partner joined" delay | Restructure joiner detection to show consent before notification |
| 4 | Drift detection missing consent fields | Add new fields to polling fallback |
| 5 | No waiting indicator for creator | Address during implementation (add spinner/text) |
| 6 | Button order reversed | Fix to `[Skip] [Enable AI Insights]` per shadcn/ui convention |

### Suggestions (8 unique)

1. Use existing `hideCloseButton` prop on Dialog component
2. Follow sealed-bid pattern from ratings (`checkerSubmitted`/`responderSubmitted`)
3. Add Mixpanel tracking for consent analytics
4. Use `toast()` from sonner for neutral messages
5. Add "Waiting for partner..." indicator after creator answers
6. Use Lucide Sparkles icon instead of emoji
7. Add "your choice is private" reassurance
8. Consider `consentPhase` enum for clearer state machine

---

## Existing Code to Reuse

| Feature | Location | Notes |
|---------|----------|-------|
| Dialog with `hideCloseButton` | `src/components/ui/dialog.tsx:34` | Already supports hiding close button |
| Sealed-bid pattern | `src/app/types/index.ts:545-549` | `checkerSubmitted`/`responderSubmitted` pattern |
| `updateLiveState()` helper | `clarity-live-page.tsx:656-689` | Handles optimistic updates + rollback |
| `subscribeToClaritySession()` | `src/app/data/api.ts` | Realtime subscription helper |
| `confirmedLiveStateRef` | `clarity-live-page.tsx:234` | For race condition prevention |
| `toast()` from sonner | `clarity-live-page.tsx:54` | For neutral messages |
| `DEFAULT_LIVE_STATE` | `src/app/types/index.ts:593-610` | Add consent defaults here |

---

## Decisions Made (from spec)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Host = creator_name | Simplest; already in schema, no auth required |
| 2 | Joiner appears after consent answered | Prevents "Partner joined!" → decline awkwardness |
| 3 | 60s timeout with [Wait] [Start Now] | Gives agency without assuming decline |
| 4 | Neutral toast when AI Insights disabled | Provides closure without revealing who declined |
| 5 | Supabase Realtime (not WebRTC) | Matches existing codebase |

---

## Execution Recommendation

**Recommendation:** /loop (single session)

**Reason:**
- 247 lines (< 500 threshold)
- 0 blockers
- ~10 estimated tests (< 15 threshold)
- 4-6 hour estimate is realistic
- Well-defined spec with clear implementation order

**Next step:**
```
/loop
```
Then describe: "Implement P70_2 consent flow per spec"

---

## Implementation Components

1. Add consent fields to `LiveSessionState` interface (~10 lines)
2. Add `DEFAULT_LIVE_STATE` entries (~4 lines)
3. Create migration file `supabase/migrations/20260120_p70_2_ai_consent.sql` (~3 lines)
4. Create `ConsentPromptDialog` component (~80 lines)
5. Add consent flow logic to `clarity-live-page.tsx` (~100 lines)
6. Gate recording start on `ai_insights_enabled` (~5 lines)
7. Add drift detection fields (~5 lines)
8. Add Mixpanel events (~10 lines)

**Total estimate:** ~220 lines of new/modified code

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v2 | 2026-01-19 | Re-ran with --force after spec updates; all blockers resolved |
| v1 | 2026-01-19 | Initial review; 5 blockers identified |
