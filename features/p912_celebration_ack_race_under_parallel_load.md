---
status: week
type: bug
rank: 1000794.0
severity: medium
workstream: C1
date_reported: '2026-06-07'
created_date: '2026-06-07'
tags: [live, race-condition, e2e, flaky, celebration]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P912: Celebration dual-ack race — simultaneous Continue clicks intermittently lose an ack under load

## Summary

`e2e/p525-celebration-race.spec.ts` ("both users clicking Continue on celebration") flaked twice during the P891 ship — `waitForBothAcknowledged` timed out at 30s — but only when run in parallel with the p562 suite; it passes isolated (3/3 runs) and on every retry. This may be a rare real race in the P525 dual-ack write path, not just test noise.

## Root Cause

Under investigation. The P525 design has each user write their own boolean key (`celebrationAcknowledgedByCreator` / `...Joiner`) via the patch path so JSONB merge cannot collide. Hypotheses for the load-dependent loss:

- **Hypothesis A (app race):** `handleCelebrationComplete`'s bothDone branch fires on one client (stale ref sees partner's ack) and resets the round — clearing BOTH booleans — before the other client's ack write lands; the late ack is then merged into an already-reset state, so the poll never sees both true simultaneously. Cheapest disproof: capture `live_state` history (poll at 100ms) during a reproduction run and check whether a reset (`ratingPhase: 'idle'`, booleans false) appears between the two ack writes.
- **Hypothesis B (test noise):** under parallel suite load the second ack write simply exceeds the 30s poll window (Supabase latency). Cheapest disproof: same capture — if both booleans eventually become true after the timeout, it's latency, not loss.

## Reproduction Steps

1. Branch with the P891 test rewrites (now on main).
2. Run both suites together: `npx playwright test e2e/p562-free-mode.spec.ts e2e/p525-celebration-race.spec.ts`
3. Repeat until the celebration-race test times out in `waitForBothAcknowledged`.

**Reproduction rate:** ~2 in 3 combined runs flaked once during P891 (2026-06-05 and 2026-06-07); 0 failures isolated or on retry.

## Expected Behavior

Both ack booleans persist in `live_state` within the poll window whenever both users click Continue, regardless of suite parallelism; the test never needs a retry.

## Actual Behavior

Intermittently under parallel load, `waitForBothAcknowledged` times out (30s); the retry of the same test passes.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleCelebrationComplete` (~2366) + P525 reactive safety-net useEffect (~2452)
- `e2e/p525-celebration-race.spec.ts` — the flaking canary (`waitForBothAcknowledged`)

## Severity

**Medium** — if Hypothesis A is real, two users clicking Continue near-simultaneously on slow connections can deadlock or lose a round transition in production; if B, it's test noise to be absorbed in the helper.

## Fix Approach

Run `/reproduce p912` with a 100ms `live_state` capture loop during the combined-suite run to discriminate Hypothesis A vs B. If A: make the bothDone reset conditional on reading both booleans from a fresh DB read (not the local ref), or move the reset server-side (RPC). If B: raise/poll-tune the test helper and close as noise with evidence.

## Acceptance Criteria

- [ ] Hypothesis A vs B discriminated with captured `live_state` evidence
- [ ] If A: fix lands and the combined run (`p562` + `p525`) passes 5/5 with zero retries, 5 consecutive runs
- [ ] If B: helper adjusted with the evidence documented in this spec, same 5-consecutive-runs bar
