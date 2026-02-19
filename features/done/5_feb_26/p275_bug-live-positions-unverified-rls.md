---
status: all-done
delivery_stage: implementation
type: bug
rank: 1
workstream: C1
severity: high
tags:
  - live
  - points
  - unverified
  - rls
  - p272
created_date: 2026-02-18T00:00:00.000Z
---

# P275: /live point positions silently fail for unverified guests (RLS conflict)

## Problem

P272 requires that either participant can update their position on linked points during a `/live` session. But the listener is typically an unverified guest (`is_verified: false`), and `point_positions` has an RLS policy that blocks all writes from unverified users:

```sql
CREATE POLICY "Verified users can set own position"
  ON point_positions FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );
```

If P272 ships as-is and writes positions to `point_positions`, the unverified listener's position updates will silently fail. No error shown — the UI will appear to work but nothing is saved.

## Fix

Positions set during a `/live` session must be stored outside `point_positions`. Two options:

**Option A (recommended): Store in `clarity_live_turns`**
Live session positions are ephemeral game state — they capture where each participant stands before and after the verification round. `clarity_live_turns` already holds per-session state. Add a positions field (e.g. `point_positions JSONB`) to capture `{ pointId, position }` per participant per turn. This requires no RLS change.

**Option B: Relax RLS for live session context**
Allow unverified users to write to `point_positions` when inside an active session. More complex, higher risk of unintended access, not recommended.

**Persistent positions (profile page):** remain in `point_positions`, require `is_verified: true`. After a round, a verified user's live position MAY be written to `point_positions` as an optional persistent update — but this is separate and must not block round mechanics.

## Acceptance criteria

- [x] Unverified guest can update point positions in `/live` without error — positions write to `live_state.livePositions`, not `point_positions`
- [x] Position updates appear in real time on both screens — synced via existing `live_state` Realtime mechanism
- [x] Verified user's live position optionally persists to `point_positions` after round — `handlePositionSelectInLive` attempts best-effort `pointsService.setPosition`, silently ignores failure for unverified
- [x] No change to `point_positions` RLS policy

## Relationship to P272

P272 is the parent feature. This bug must be resolved before or during P272 implementation. If P272 implementation has already started writing to `point_positions`, this fix is a blocker.
