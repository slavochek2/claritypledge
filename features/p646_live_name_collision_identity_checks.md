---
status: rejected
type: bug
rank: 1
severity: high
date_reported: '2026-04-04'
created_date: 2026-04-04T00:00:00.000Z
tags:
  - live
  - p617
  - p643
superseded_by: p643
---

# P646: /live uses name strings for identity — breaks when both users share a name

## Summary

Multiple places in the /live session compare `liveState.*` fields against `currentUserName` to determine "is this me or my partner?" When both participants share the same display name, the listener misidentifies partner actions as their own. Mode switcher stays enabled, story card stays visible, and negotiation flows break.

## Root Cause

Identity fields in `live_state` store raw user names (`ratingInitiatedBy: "Slava"`, `skippedBy: "Slava"`, `negotiation.requestedBy: "Slava"`) and listeners compare them with `!== currentUserName`. When both users have the same name, these comparisons always return `false` — the listener thinks "I did that" for every action the partner takes.

The `checkerIsCreator: boolean` pattern was introduced to fix this exact problem for `checkerName`. It uses session role (creator vs joiner) instead of name strings. But the pattern was only applied to `checkerName` — not to the other 3 identity fields.

**Proven by diagnostic logs (P643 session 7):**
- Drift polling detects and applies `ratingInitiatedBy=Vyacheslav Ladischenski` to listener state ✓
- But `isListenerDuringLocalRating = ratingInitiatedBy !== currentUserName` → `false` (same name)
- Story card stays visible, mode switcher stays enabled
- Meanwhile, the submit flow uses `checkerIsCreator !== isCreator` → works correctly regardless of names

## Reproduction Steps

1. Open two browsers to `localhost:5100/live` (or any /live session URL)
2. Create a session in browser A with any name (e.g., "Slava")
3. Join the session in browser B **with the same name** ("Slava")
4. In browser A, select a story, then click **Speak**
5. Observe browser B: mode switcher stays enabled, story card stays visible

**Reproduction rate:** 100% when names match. Also affects any production users who share a display name.

## Expected Behavior

When the speaker clicks Speak:
- Listener's mode switcher disables (gray + tooltip "Mode locked — your partner is rating")
- Listener's story card hides (P617: story card only appears after speaker submits)
- These behaviors work regardless of whether users share the same display name

## Actual Behavior

- Listener's mode switcher stays **enabled** (no visual feedback that partner is rating)
- Listener's story card stays **visible** (should hide until speaker submits)
- Skip and negotiation flows also misidentify the acting party

## Affected Files

All in `src/app/components/partners/live-mode-view.tsx`:

| Line | Field | Comparison | Impact |
|------|-------|-----------|--------|
| 1204-1205 | `ratingInitiatedBy` | `!== currentUserName` | Story card + mode switcher broken |
| 676 | `skippedBy` | `!== currentUserName` | Skip dialog shown to wrong user |
| 2563 | `negotiation.requestedBy` | `=== currentUserName` | Negotiation waiting state wrong |
| 3483 | `negotiation.requestedBy` | `!== currentUserName` | Negotiation button visibility wrong |

Writers in `src/app/pages/clarity-live-page.tsx`:

| Line | Write | Problem |
|------|-------|---------|
| 1402 | `updateLiveState({ ratingInitiatedBy: name })` | Stores name, not role |
| 1429 | `updateLiveState({ ratingInitiatedBy: name })` | Stores name, not role |

## Severity

**High** — the core /live paraphrase exchange is broken for any pair with matching names. The founder tests with their own name in both browsers, making development feedback impossible. In production, two users with common names (e.g., "Alex") would hit this silently.

## Fix Approach

Apply the `checkerIsCreator` pattern to all identity fields:

1. **`ratingInitiatedBy`** → add `ratingInitiatedByIsCreator: boolean` to `live_state`. Write it in `handleStartCheck` and `handleStartProve`. Compare with `isCreator` instead of name.

2. **`skippedBy`** → add `skippedByIsCreator: boolean`. Write in skip handler. Compare with `isCreator`.

3. **`negotiation.requestedBy`** → add `negotiation.requestedByIsCreator: boolean`. Write in negotiation handler. Compare with `isCreator`.

Each fix follows the proven pattern:
```typescript
// Before (broken with same name):
const isListener = ratingInitiatedBy !== currentUserName;

// After (works regardless of name):
const isListener = ratingInitiatedByIsCreator !== undefined
  && ratingInitiatedByIsCreator !== isCreator;
```

**Verification approach:** Write a unit test where both users share the same name. The test must fail before the fix and pass after. This is the regression gate — if name collision breaks again, this test catches it.

## Acceptance Criteria

- [ ] Speaker clicks Speak → listener's mode switcher shows DISABLED even when both users share the same name
- [ ] Speaker clicks Speak → listener's story card hides even when both users share the same name
- [ ] Skip dialog appears only for the non-skipping user, same-name or not
- [ ] Unit test with same-name users passes for all identity comparisons
- [ ] Existing `checkerIsCreator` behavior unchanged (backward compat)
- [ ] All 3 P643 acceptance criteria pass in real two-browser UAT with same-name users
