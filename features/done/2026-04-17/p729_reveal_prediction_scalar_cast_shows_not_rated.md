---
type: bug
rank: 1000727.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, rpc, type-cast, prediction]
pipeline_ran: [create-bug, fix]
status: all-done
completed_at: 2026-04-17
---

# P729: Sender's revealed prediction always shows "Not yet rated" after receiver rates story

## Summary

`revealPrediction` in `letters-service.ts` casts the RPC scalar return value as `{ prediction: number }`, but `reveal_prediction` returns `RETURNS SMALLINT` (a plain number). At runtime `(4).prediction === undefined`, so the display falls back to null → "Not yet rated".

## Root Cause

`reveal_prediction` RPC returns `RETURNS SMALLINT` — a plain scalar number like `4`. The TS call casts `data as { prediction: number }`, so `data.prediction` is `undefined` at runtime. The display component interprets `null` / `undefined` as "Not yet rated".

Sister function `reveal_prediction_by_token` is correct because that RPC returns `RETURNS JSONB` with `jsonb_build_object('prediction', v_prediction)`, so `data` is already `{ prediction: N }`.

## Reproduction Steps

1. Open a letter as the receiver (authenticated)
2. Rate a story — submit a numeric prediction value
3. Switch to the sender's view (or wait for reveal phase)
4. Observe the story-revealed section — prediction field shows "Not yet rated"

**Reproduction rate:** 100%

## Expected Behavior

Sender sees the receiver's submitted numeric prediction (e.g. "4") in the revealed section.

## Actual Behavior

Sender sees "Not yet rated" regardless of what the receiver submitted. No console error.

## Affected Files

- `src/app/data/letters-service.ts` — `revealPrediction` function (~line 351): `return data as { prediction: number } | null;` — must be `return typeof data === 'number' ? { prediction: data } : null;`

## Severity

**High** — blocks the core feedback loop in letter results; sender never sees the receiver's prediction.

## Fix Approach

Replace the return statement in `revealPrediction`:
```ts
// BEFORE:
return data as { prediction: number } | null;

// AFTER:
return typeof data === 'number' ? { prediction: data } : null;
```

`typeof data === 'number'` is preferred over `data != null` to guard against unexpected RPC shapes and to correctly handle `prediction = 0` (valid low-confidence value).

## Acceptance Criteria

- [ ] Sender sees the numeric prediction value after receiver has rated — not "Not yet rated"
- [x] `prediction = 0` is shown correctly (not treated as falsy/null) — unit test passes
- [x] `revealPredictionByToken` behavior unchanged — code untouched, RPC still returns JSONB
- [x] Unit tests pass: `revealPrediction` returns `{ prediction: N }` for scalar N, `null` for null — `src/tests/p729-reveal-prediction-scalar.test.ts`
