---
status: week
type: bug
rank: 1000934
severity: high
workstream: live
date_reported: '2026-06-12'
created_date: '2026-06-12'
tags: [live, positions, realtime, drift-detection, receiver-side, p825-followup]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P934: /live partner position change does not propagate to the receiving participant (no toast, stale badge)

## Summary

In a live /live session, the joiner changed his position on a point; the creator's screen never updated and showed no position-change toast — yet the joiner's positions were stored correctly in the DB. This is a **receiver-side transient delivery failure**, not a write loss. Follow-up to P825 (which fixed the known drift-poll cause and is deployed).

## Root Cause

**Confirmed (this layer): receiver-side. Sender-side write-loss is killed by prod evidence.**

Observed in prod session `SPM3HF` (mode=live, 2026-06-12 07:11–07:40 CEST):
- creator profile `a99042ef-e740-446a-8734-389c8589cc17` (the repo owner / host)
- joiner profile `9f1c712c-2d97-49ef-b14b-0cbd6c51a52a` (`joiner_name` did not persist — separate minor anomaly, see Non-Goals)

Stored `live_state` at session end:
```
livePositionsJoiner (joiner)  = { e600d5cf-…: "agree",            f8629cdd-…: "agree" }
livePositionsCreator (creator) = { e600d5cf-…: "strongly_disagree", f8629cdd-…: "strongly_agree" }
```

The joiner's positions **reached the DB** → the joiner's writes succeeded. The creator's client never applied a value the server already had.

The receiver sync path on `main` was read directly and is **correct**:
- Drift poll detects `livePositionsCreator`/`livePositionsJoiner` drift and is wired into `serverHasUpdate` — `clarity-live-page.tsx:1468-1477` (the P825 fix, still intact).
- Apply path is correct in both branches — `clarity-live-page.tsx:1506-1525`: wholesale `setLiveState` when no local write is in-flight; `mergeInFlight` (`live-state-merge.ts:29-51`) overlays the partner position key from `incoming`/server **last**, so the partner's fresh value wins even during an in-flight local write.
- The toast itself is correct — `live-mode-view.tsx:621-661` (id `live-position`, fires on a partner-position diff).

Because the code path is correct, the failure is a **runtime transient**: a dead drift-poll tick, or a dropped Supabase Realtime subscription (`CLOSED` / `CHANNEL_ERROR` / `TIMED_OUT`) that did not self-heal for the session's duration. The 1s drift poll should have caught the change within ~1s regardless of WebSocket state — so whatever failed, failed silently and persistently on the creator's client.

**Confidence:** medium-high that this is receiver-side and not a logic bug; **low** on the exact transient mechanism (poll vs subscription) — that is the open question this spec exists to make diagnosable.

## Reproduction Steps

1. Two participants in a live picker session (`mode=live`), creator + joiner, both with positions on the same points.
2. Joiner changes his position on a point during the session.
3. Observe the **creator's** screen.
4. Bug: creator sees no `live-position` toast and the joiner's badge on that point stays at its previous value, while the DB `live_state.livePositionsJoiner` holds the new value.

**Reproduction rate:** intermittent / rare — observed once in prod (SPM3HF). **Not reproducible statically** (see Non-Goals).

## Expected Behavior

When the joiner changes a position, the creator's client applies it within ~1s (Realtime, or drift-poll fallback), the point badge updates, and a `live-position` toast fires.

## Actual Behavior

Creator's screen stayed on the stale value for the rest of the session; no toast. Server `live_state` was correct the whole time — the two participants saw divergent states.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `:1311-1538` drift-poll + Realtime subscription effect; `:1483-1527` the apply block. **Suspected** transient origin (no logic defect found — needs instrumentation).
- `src/app/lib/live-state-merge.ts` — `mergeInFlight` (verified correct; listed for context).
- `src/app/components/partners/live-mode-view.tsx` — `:621-661` partner-position toast; `:575-615` badge display (both verified correct; downstream of `liveState`).
- `src/app/data/api.ts` — `subscribeToClaritySession` (`~:1286`) Realtime channel — **suspected** drop without recovery.

## Severity

**High** — silent state divergence between participants on the core /live surface directly undermines the calibration premise (both sides must see the same positions). No user-facing data loss (server state is correct), which is why it is not critical.

## Fix Approach

**Telemetry first — a behavioral fix is not yet possible.** The code path is correct, so a two-party E2E with working Realtime + drift poll passes by construction (the false-green canary trap `.claude/rules/live.md` warns about). No failing canary can be written until the transient is captured in the wild.

1. **Instrument the receiver's delivery layer** in `clarity-live-page.tsx`:
   - Emit a Supabase Realtime channel-status event on `SUBSCRIBED` / `CLOSED` / `CHANNEL_ERROR` / `TIMED_OUT` (today the subscription status callback is not reported to analytics).
   - Emit a drift-poll heartbeat (or a poll-tick-error event) so a dead/throwing poll loop is visible — today the poll only emits `live_state_drift_detected` when it *detects* drift, nothing when it dies.
2. Ship telemetry, wait for recurrence with captured channel-status / heartbeat data.
3. **Then** write the targeted fix (e.g., auto-resubscribe on `CHANNEL_ERROR`, or poll-loop self-restart) + a canary that exercises the captured failure condition.

**Optional corroboration (does not change fix direction):** pull Mixpanel `live_state_drift_detected` events for `sessionCode=SPM3HF` (creator side). Present → poll detected+applied (points to display/perception); absent → poll was dead. Requires Mixpanel MCP (`ce`/`cf` alias) — unavailable in the filing session.

## Non-Goals

- **`joiner_name` not persisting** (was `None` on `SPM3HF` despite a valid `joiner_profile_id`) is a separate anomaly — file independently if it recurs; it does not affect the creator's reading of `livePositionsJoiner`.
- Re-fixing the P825 drift-detection coverage — it is intact and correct on `main`.

## Acceptance Criteria

- [ ] Receiver-side Realtime channel-status transitions (`SUBSCRIBED`/`CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT`) are emitted to analytics with `sessionCode`, so a dropped subscription is visible after the fact.
- [ ] A drift-poll heartbeat (or poll-tick-error) event is emitted, so a dead/throwing poll loop is distinguishable from a healthy one in telemetry.
- [ ] The instrumentation is verified to FIRE (not just compile): a simulated channel error / forced poll throw produces the event locally (exercise the failure path, per `.claude/rules/epistemic.md` gate 7).
- [ ] No regression: a normal two-party session still syncs partner positions within ~1s and fires the `live-position` toast (existing behavior preserved).
- [ ] No console errors during the affected flow.
- [ ] Follow-up captured: once the transient recurs with telemetry, a targeted fix + canary is filed (this AC is the handoff marker, checked when the telemetry-only layer ships).
