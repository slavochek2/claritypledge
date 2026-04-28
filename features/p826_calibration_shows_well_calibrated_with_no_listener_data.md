---
status: week
type: bug
rank: 1000760.0
severity: medium
workstream: live
date_reported: '2026-04-28'
created_date: '2026-04-28'
tags: [calibration, profile, listener, sessions]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P826: Calibration shows "Well calibrated" when user has no listener session data

## Summary

A user with ≥5 total sessions (mostly as speaker, zero or few as listener) bypasses the insufficient-data gate and sees "Well calibrated" — a label computed from a null gap defaulting to zero, not from real listener data.

## Root Cause

`verification_session_count` on `profiles` is incremented for **both** the speaker and the listener on every `story_verifications` insert (trigger `trg_profile_ears_count`, `supabase/migrations/20260204_stories_points_calibration.sql` lines 264–284). The calibration service uses this count as the threshold gate:

```ts
// calibration-service-real.ts:136
if (sessionsCompleted < SESSIONS_THRESHOLD) { return { status: 'insufficient', ... }; }
```

A user with 5 speaker sessions passes this gate. The subsequent listener-data query (`story_verifications WHERE listener_id = userId`) returns zero rows, so `calibrationGap` stays `null`. `toUserCalibration` defaults null gap to `0`:

```ts
// profile-page-v2.tsx:142
const listenerGap = calibrationGap != null ? -calibrationGap : 0;
```

Gap of `0` → `getCalibrationLabel(0)` → `'Well calibrated'`. The tooltip also mis-reports `sessionCount` — it is `sessionsCompleted` (total), not listener-only count.

## Reproduction Steps

1. Have a test account with ≥5 completed `story_verifications` rows where `speaker_id = userId` but `listener_id ≠ userId` (i.e. acted as speaker only)
2. Navigate to `/p/{slug}` for that account
3. Observe the Listening calibration section

**Reproduction rate:** 100% for accounts that match the above data shape.

## Expected Behavior

When a user has fewer than 5 sessions **as a listener**, the segmented progress bar shows ("N more sessions in a listener role to unlock your calibration score"), not the full calibration bar.

## Actual Behavior

The full calibration bar renders with the dot centered and the label "Well calibrated" — despite zero listener verification data. Tooltip reads "Based on N sessions with you as a listener" where N is the total (speaker+listener) session count.

## Affected Files

- `src/app/data/calibration-service-real.ts` — line 134: `sessionsCompleted = profile.verification_session_count` counts both roles; line 136: threshold check uses total count
- `src/app/pages/profile-page-v2.tsx` — line 142: `listenerGap` defaults to `0` when `calibrationGap` is null
- `supabase/migrations/20260204_stories_points_calibration.sql` — lines 264–284: trigger increments count for both speaker and listener

## Severity

**Medium** — incorrect calibration data shown to users with a specific session history shape; no data loss or broken flow, but misleads on calibration readiness.

## Fix Approach

Two options:

**A) Fix in the service** (recommended): count listener-only sessions explicitly. After the threshold check passes, query `story_verifications WHERE listener_id = userId` and gate on `listenerRows.length >= SESSIONS_THRESHOLD` instead of relying on `verification_session_count`. If listener count < 5, return `status: 'insufficient'` with the listener-specific count.

**B) Fix in `toUserCalibration`**: return `null` when `calibrationGap === null` (no listener data), regardless of session count. Simpler, but `sessionsCompleted` passed to the progress bar would still reflect total sessions — the bar would show wrong progress dots.

Option A is correct end-to-end: threshold, progress bar, and tooltip all reflect listener-only sessions.

## Acceptance Criteria

- [ ] A user with ≥5 total sessions but <5 listener sessions sees the segmented progress bar, not the calibration bar
- [ ] The progress bar dot count reflects sessions-as-listener specifically
- [ ] The tooltip "Based on N sessions with you as a listener" shows the listener-only count
- [ ] A user with ≥5 listener sessions still sees their calibration bar correctly
- [ ] No regression on profiles with sufficient listener data
