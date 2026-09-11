---
status: week
type: bug
rank: 95
severity: medium
workstream: transcribe
date_reported: 2026-09-11
created_date: 2026-09-11
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [transcribe, p1236-followup, adversarial-review]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1301: A room can end without telling anyone, and a seat can forget which session it belongs to

## Summary

Three defects found by adversarial review of the P1236 branch (2026-09-11) that were not
fixed there because each needs a design decision rather than a guard.

## Root Cause

Each is a different consequence of the same gap: **the room's lifecycle is server-owned but
only client-announced.** The server can end a room; nothing pushes that to the people in it.

## Invariants

- A participant who is being recorded must be able to find out that they are no longer being
  transcribed. Silence is the failure mode this whole feature was built to remove.
- A member's `session_id` must name the recording the seat is actually producing. If it names
  a different one, the end-of-room transcription job is attached to the wrong recording, and
  that is worse than no job at all.

## What Remains

### Layer 1 — a server-ended room is invisible to everyone still in it

The ingest ends a room when a slice arrives past `ROOM_MAX_DURATION_MINUTES`. Every other
member's browser keeps showing "Listening". Their slices then 410, which the stall counter
now surfaces after three consecutive failures — so they learn *something* is wrong, but not
that the room is over, and not that the recording they are still making will not be
transcribed.

**Reviewer's claim, NOT independently verified:** that no realtime subscription carries
`ended_at` to the other members. Verify before building.

### Layer 2 — `session_id` is pinned at first insert and never revisited

`enter_transcribe_room` and `join_transcribe_room` both upsert with
`ON CONFLICT ... DO UPDATE SET consent_given_at = COALESCE(...), display_name = EXCLUDED...`
— `session_id` is deliberately not in the update list. So re-entering a room (refresh, second
tab, rejoining after a drop) keeps the ORIGINAL session, while `createRoom`/`joinRoom` have
by then minted a NEW `clarity_sessions` row for the new arrival.

Two consequences, and the second is the expensive one:
- Every re-entry leaks one orphaned `clarity_sessions` row, which cannot be deleted (there is
  no DELETE policy — see the comment in `createRoom`) and blocks profile deletion.
- The end-of-room transcription job is created against the pinned session, which may not be
  the one the archival audio was uploaded under.

**Verified by reading the migrations** (`20260908170000` line 186, `20260910120000` line 131):
`session_id` is absent from both DO UPDATE lists. What is NOT verified is the downstream
consequence — trace which session the GCS upload path actually keys on before deciding.

**This is a real design question, not a bug with an obvious patch.** Updating `session_id` on
re-entry would orphan the first recording instead of the second. Neither answer is free, and
the right one probably makes a seat own many recordings rather than one.

### Layer 3 — nothing bounds the RATE of Gemini calls, only the total

`MAX_CONCURRENT_ROOMS_PER_USER` and `ROOM_MAX_DURATION_MINUTES` bound how many rooms and how
long. Within those bounds, the per-slice cadence is client-chosen: `SLICE_INTERVAL_MS` is a
client constant, and a client that sends every 500 ms instead of every 4 s multiplies the
Gemini spend by eight without exceeding any server-side ceiling.

The spend CAP (P1162) is the real backstop and it is enforcing — so the exposure is bounded in
money, and the failure mode is the cap tripping and taking live transcription down for
everyone rather than an unbounded bill. That is why this is filed rather than hot-fixed.

**Reviewer's claim, partially verified:** `validate.ts` bounds slice SIZE and DURATION; that
much was read. Whether any server-side rate limit exists for this surface was NOT re-checked
against `ai_rate_limits` — the P1236 pre-deploy checklist says it is not wired to /transcribe,
which is consistent, but confirm before building.

## Acceptance Criteria

- [ ] A member of a room the server ended sees that it ended, without having to guess from
      failed slices
- [ ] Re-entering a room does not leave an orphaned `clarity_sessions` row, OR the orphan is
      deliberate and the reason is recorded here
- [ ] The transcription job created at room end is attached to the session whose audio was
      actually uploaded — demonstrated with a re-entry in the reproduction, not argued
- [ ] A client that sends slices faster than `SLICE_INTERVAL_MS` is bounded server-side, OR
      the spend cap is recorded here as the accepted and sufficient control
- [ ] Each layer above has been re-verified against the code before being fixed — the claims
      marked "not independently verified" are the reviewer's, not findings

## Key Files

- `src/app/data/transcribe-service.ts` — `createRoom`, `joinRoom`, `endRoom`
- `supabase/migrations/20260908170000_p1236_transcribe_consent_and_limits.sql`
- `supabase/migrations/20260910120000_p1236_f_enter_shared_room.sql`
- `supabase/functions/transcribe-slice/handler.ts`, `validate.ts`

## Origin

Adversarial review of `feature/p1236-server-side-live-transcription`, 2026-09-11. Two
reviewers spawned, two reported. The findings that WERE fixed on that branch: the unbounded
audio-worklet load, the non-idempotent `endRoom`, and the unbound SQL/TypeScript duration
literals. These three were left because each needs a decision, not a guard.
