---
status: in-progress
type: bug
rank: 1000822
severity: high
workstream: live
date_reported: '2026-04-27'
created_date: '2026-04-27'
tags: [live, partner-badge, positions, realtime, p792-regression]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_files:
    - src/tests/p825-free-mode-badge-identity.test.tsx
  test_pattern_notes: "Layer A canary uses it.todo (P818 pattern) — verified failing locally before mark. /fix flips to `it`. Layer B canary is structural: src/tests/p637-drift-detection-completeness.test.ts already lists livePositionsCreator/Joiner in KNOWN_UNCOVERED with a TODO. /fix removes those two entries to surface the failing assertion, then extends drift detection in clarity-live-page.tsx to make it pass."
  root_cause: "Two confirmed defects. (A) free-mode-view.tsx:226 invokes <LiveStoryCardExpanded> without badgePersonName props — when viewer is story author, badge falls back to story.authorName. P792 fix scope was live-mode-view.tsx only; free mode was never wired. (B) clarity-live-page.tsx:1445 drift-poll fallback compares deprecated livePositions field instead of livePositionsCreator/livePositionsJoiner — when Realtime WebSocket drops on mobile, partner position writes are silently never detected as drift."
  confidence: high
  surfaces_in_scope: [free-mode-view-badge, drift-detection-livePositions]
  surfaces_deferred: [round-summary-screen-badge, letter-flow-content-badge]
  reproduced_at: 2026-04-27
---

# P825: /live shows viewer's own name above point + partner position taps don't propagate

## Summary

In a /live picker session on prod (2026-04-26), the row above each point showed the viewer's own full name ("Vyacheslav Ladischenski") instead of the partner's first name ("Su"), AND the partner's position taps during the session did not propagate to the viewer's screen. P792 was meant to fix the badge identity (shipped 2026-04-23, in main) but the symptom returned. The position-not-updating part is not covered by P792 — P792 only preloads positions on join, not Realtime updates during the session.

## Root Cause

**Confirmed via code-level disproofs (no live repro needed). Session was free mode (user-confirmed).**

### Layer A — Free-mode badge identity falls back to story author

`free-mode-view.tsx:226` invokes `<LiveStoryCardExpanded>` with only `story`, `isOwnStory`, `isGuest`, `className`, `defaultExpanded` — **no badge props.** P792's fix threaded `badgePersonName` / `badgePersonEarsCount` / avatar props through all 13 invocation sites in `live-mode-view.tsx`, but its scope was explicitly that file only. Free mode is a separate file with its own caller (`<FreeModeView>` at `live-mode-view.tsx:874`) that doesn't even receive `userId` or `partnerEarsCount` — the data isn't threaded down.

Result: in `live-story-card-expanded.tsx:288, 295`, when `badgePersonName` is `undefined`, the row falls back to `story.authorName`. When the viewer is the story author (the common case in /live), the row above the point displays the viewer's own full legal name — exactly matching the screenshot.

**Why H2 of the original hypothesis (`isAuthorOfSelected` gate) was wrong:** that gate is in `live-mode-view.tsx` (guided mode). User confirmed the session was free mode, so guided-mode logic never ran.

### Layer B — Drift-poll fallback uses deprecated position field shape

`clarity-live-page.tsx:1445`:
```ts
const livePositionsDrift = JSON.stringify(serverState.livePositions ?? {}) !== JSON.stringify(localState.livePositions ?? {});
```

Position writes go to `livePositionsCreator` / `livePositionsJoiner` (P562, see `clarity-live-page.tsx:1901-1902, 1955, 2916-2917`). The `livePositions` field is marked `@deprecated` in `src/app/types/index.ts:750`. Both `serverState.livePositions` and `localState.livePositions` are always `undefined` after P562 — the JSON.stringify comparison always returns `false`, drift never fires.

Realtime WebSocket DOES propagate position changes via wholesale `setLiveState` at `clarity-live-page.tsx:1272`. But when the WS drops (common on mobile per the comment at line 1444 — "P490: livePositions missing from drift check caused guest positions to never sync when Realtime WebSocket dropped"), the drift-poll fallback is the only way deltas arrive. With the wrong field shape, partner position writes are silently lost forever.

**Confirmed by existing test:** `src/tests/p637-drift-detection-completeness.test.ts:116-117` already documents `livePositionsCreator` / `livePositionsJoiner` as `KNOWN_UNCOVERED` with a TODO to file a follow-up. P825 is that follow-up.

## Invariants

(From P792 — preserved)
- The row directly above a POINT reflects the **other person's** identity + stance. Never the viewer's.
- `livePositionsCreator` and `livePositionsJoiner` must be written in a single `updateLiveState({...})` call — never two separate calls (P643 race-prevention).

(New, this bug)
- Partner position changes during a session must propagate to the viewer's screen within one Realtime tick — initial-load-only is insufficient.
- The badge identity gate must not fall back to story author when the gate evaluates false. Either show partner unconditionally for /live picker sessions, or render no badge at all.

## Reproduction Steps

1. Two accounts (A = story author, B = partner). B saves positions on ≥2 points of A's story.
2. A opens /live on mobile, selects a story from the picker (not letter-sourced). B joins from B's account.
3. A advances to post-rate / explain-back phase.
4. **Observe on A's screen:** row above each point shows A's own full name + author avatar, not B's first name.
5. B taps a different position on a point.
6. **Observe on A's screen:** B's position change is NOT reflected.

**Reproduction rate:** TBD via /reproduce — both symptoms seen in single prod session 2026-04-26.

## Expected Behavior

- Row above each point shows partner's first name + partner's avatar + partner's ear count + partner's position badge — across all 13 in-session phases.
- Partner's position taps during the session propagate to the viewer's screen within one Realtime tick.

## Actual Behavior

- Row above each point shows viewer's own full legal name + author avatar (fallback path triggered).
- Partner's position taps during the session do not propagate — viewer sees stale position state for the entire session.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — `isAuthorOfSelected` computation (~line 678), `badgePersonName` derivation (~680)
- `src/app/components/partners/live-story-card-expanded.tsx` — fallback to `authorName` (lines 288, 295)
- `src/app/pages/clarity-live-page.tsx` — `partnerProfile` fetch effect (~line 477), `livePositionsJoiner` preload effect (P792 addition), missing Realtime subscription for ongoing partner position updates
- Suspected: a Realtime channel handler in `clarity-live-page.tsx` or a service file that subscribes to `live_sessions.live_state` row changes

## Severity

**High** — two visually broken behaviors in the primary picker-sourced /live flow on prod. Witnessed in real partner session, not synthetic. Erodes trust in the calibrated communication mechanic.

## Fix Approach

**Phase A (badge identity):** Add instrumentation to a fresh repro to confirm whether `isAuthorOfSelected` is false (and why), or whether `badgePersonName` is undefined despite the gate being true. Once root cause confirmed, harden the gate or remove the `authorName` fallback for /live picker sessions.

**Phase B (Realtime position sync):** Find the existing Realtime subscription for `live_sessions` row changes. Confirm whether incoming `livePositionsCreator` / `livePositionsJoiner` deltas are merged into local `liveState` or dropped. Add merge handler if missing, or fix the subscription if broken.

Likely one root: if `partnerProfileId` resolves but the picker bootstrap path doesn't fire properly, both initial badge identity AND ongoing position sync are starved. /reproduce will tell us.

## Acceptance Criteria

- [ ] Picker-sourced /live: row above each point shows partner's first name + avatar across all in-session phases (post-rate, explain-back, hear-what's-missing, celebrate)
- [ ] Picker-sourced /live: partner's position tap on point P shows up on viewer's screen within 2 seconds
- [ ] Letter-sourced /live: no regression — both symptoms remain absent
- [ ] Canary test passes: `e2e/p825-reproduce.spec.ts` (covers both symptoms in two-context Playwright setup)
- [ ] No console errors during the affected /live phase transitions
- [ ] `./scripts/pre-commit-checks.sh` passes clean
