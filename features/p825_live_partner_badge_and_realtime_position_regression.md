---
status: week
type: bug
rank: 1000822
severity: high
workstream: live
date_reported: '2026-04-27'
created_date: '2026-04-27'
tags: [live, partner-badge, positions, realtime, p792-regression]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P825: /live shows viewer's own name above point + partner position taps don't propagate

## Summary

In a /live picker session on prod (2026-04-26), the row above each point showed the viewer's own full name ("Vyacheslav Ladischenski") instead of the partner's first name ("Su"), AND the partner's position taps during the session did not propagate to the viewer's screen. P792 was meant to fix the badge identity (shipped 2026-04-23, in main) but the symptom returned. The position-not-updating part is not covered by P792 — P792 only preloads positions on join, not Realtime updates during the session.

## Root Cause

**Under investigation.** Two suspected layers:

### Layer A — Badge identity falls back to story author

`live-mode-view.tsx:678-685` computes:
```
isAuthorOfSelected = userId !== undefined && selectedStory?.authorId === userId
badgePersonName = isAuthorOfSelected ? getFirstName(partnerName) : undefined
```

When the gate evaluates false (any of: `userId` not yet loaded, `selectedStory` snapshot stale, `partnerName` null), `badgePersonName` is `undefined`. `live-story-card-expanded.tsx:288, 295` falls back to `story.authorName` (full legal name) — exactly matching the screenshot.

The screenshot shows the slider asking "How well do you believe Su understands your intention?" — confirming that `displayPartnerName = getFirstName(partnerName) = "Su"` resolved correctly in the slider, while `badgePersonName` did NOT. Two locations in the same render derived from the same `partnerName` source diverged. This points to the `isAuthorOfSelected` gate, not the `partnerName` source itself.

Hypothesis (most likely): `selectedStory.authorId !== userId` at render time — either the picker-sourced flow stored a story snapshot without `authorId`, or the IDs are of different shapes (UUID string vs object). H1 disproof: log `userId`, `selectedStory.authorId`, and `isAuthorOfSelected` on render in a repro.

### Layer B — Partner positions don't update during session

P792's fix in `clarity-live-page.tsx` adds a `useEffect` keyed on `[joinerProfileId, selectedStoryId]` that fetches partner positions ONCE when the joiner joins. There is no Realtime subscription for ongoing position writes — when Su taps a different position mid-session, her write to `livePositionsJoiner` (or `livePositionsCreator`) is not pushed to Slava's view.

Hypothesis: missing Realtime channel handler that merges incoming `livePositionsCreator` / `livePositionsJoiner` deltas into local `liveState`. H2 disproof: in repro, watch network tab for Realtime websocket frames containing the partner's position write — if the frame arrives but UI doesn't update, the merge is missing; if no frame arrives, the channel/subscription is broken.

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
