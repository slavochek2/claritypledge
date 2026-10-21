---
status: qa
type: bug
rank: 54
severity: medium
workstream: clarity-chat
date_reported: 2026-10-21
created_date: 2026-10-21
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [mirror, cost, ai]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug, fix]
---

# P1534: Every mirror portrait is charged its worst case, so "No more new faces today" comes ~10x too early

## Summary

Each portrait was booked at its whole reservation (~$0.68: four image calls at the backup model's price plus checks, x1.25), because the image API reports no usage. Against the $6/day portrait cap that allowed about 8 portraits a day; the founder hit "No more new faces today" on the first day. Founder: "It cost 70 cents to generate one picture? How does it make sense?"

## Root Cause

`mirror-portrait` charged `reserved_usd` whenever the provider was called, because the image loop did not report which calls were billed or by which model.

## Reproduction Steps

1. On test with the mirror on, paint about 9 portraits in a day.
2. Observe: "No more new faces today", though real spend is well under $1.

**Reproduction rate:** 100%

## Expected Behavior

A portrait is charged what its calls cost at Google's list price: about $0.067 per image on the usual model at 1K, $0.134 on the backup model, plus about $0.002 per vision check, never more than the reservation. An unknown model is charged at the maximum.

## Actual Behavior

Every portrait was charged ~$0.68.

## Affected Files

- `supabase/functions/_shared/artist-banner-run.ts` — the image loop now reports each call that may have been billed, with its model (a refused call is not billed; a timeout counts, on the safe side)
- `supabase/functions/_shared/mirror-agent.ts` — per-model list prices, `portraitRunUsd`
- `supabase/functions/_shared/artist-banner-run.ts` — the vision check reports when it is actually sent (a check skipped for time costs nothing)
- `supabase/functions/mirror-portrait/index.ts` — settles through `portraitSettleUsd` at `min(reservation, list-price cost)`; nothing sent releases the reservation

## Severity

**Medium** — the mirror's face feature runs out ~10x too early for every user; no overspend risk.

## Fix Approach

Report billable calls per model from the image loop; charge them at list price. The €75 monthly hard cap on the mirror's key still bounds real spend.

## Cost Budget

This changes how Gemini spend is counted, not how many calls a portrait makes. Per portrait the calls are unchanged: the usual case is 1 image and 1 vision check, and the worst case is 4 image calls and 2 checks.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 1 portrait = 1 image + 1 vision call = 2 (worst 4 + 2 = 6) | bounded by the daily portrait cap: runs are admitted while the $0.68 reservation fits, then settle at $0.069: 77 portraits/day x 2 = 154 calls/day at most (worst-path runs cost more, so fewer fit) | the e2e new-user portrait test: 1 portrait = 2 calls |
| Egress (bytes) | 1 image response in + the same image sent out for the check, each about 1.5 MB decoded x 4/3 base64 = 2 MB: 2 + 2 = 4 MB (worst 4 x 2 + 2 x 2 = 12 MB) | 77 x 4 MB = 308 MB/day at most | 4 MB |
| Log lines | usual: 1 attempt + 1 painted = 2; worst painted path (two attempts, each with the primary returning no image and the fallback painting; first check fails, second errors): 2 image errors + 2 attempts + 1 check error + 1 painted = 6; a fully refused run: 1 error per model = 2 | painted runs are bounded by admission: at most 77 runs/day x at most 6 lines = 462 lines; refused runs keep their whole reservation, so $6 / reservation = 8 x 2 = 16 | 2 to 6 |
| Supabase Storage + delivery | each portrait uploads its decoded image, about 1.5 MB, and removes the previous one, so storage stays at 1 portrait per mirror = active mirrors x 1.5 MB; each uncached view of the portrait = 1.5 MB egress | uploads: 77 x 1.5 MB = 116 MB/day at most (churn, not growth); delivery: views/day x 1.5 MB, unchanged by this fix per view | 1 upload, 1.5 MB, deleted with the test user |
| Gemini image tokens x price | 1,120 tokens x $60/1M = $0.067, + $0.002 check = $0.069 | admitted while the reservation fits: 77 usual portraits/day | $0.069 |

1. **Fits the plan limit today?** Yes. Supabase: storage = active mirrors x 1.5 MB and delivery = portrait views per month x 1.5 MB, both checked against the Supabase registry row's storage and egress limits (read from "Where usage is read"). This fix allows up to about 10x more new portraits per day, but storage does not grow with them, because each one replaces the last; only the upload churn and first views rise, bounded by the daily cap at 77/day. Gemini: Gemini has no cap row in the registry, only a price, so the bound is the mirror's own key, which has a hard spend cap of 75 EUR/month. Worst monthly portrait spend = daily portrait cap x 30 days, and the key cap stops it first. Before this change real portrait spend was about a tenth of the daily cap, because each run was booked at the reservation. Now real spend can reach the daily cap. That is the accepted budget, and the key cap still bounds the month.
2. **Fits at 10x?** Yes. The daily portrait cap bounds total spend regardless of demand, so at 10x users people see "No more new faces today" sooner and no extra money is spent.
3. **If either answer is no:** n/a.

Per person the $2.10 daily portrait cap now admits about 21 usual portraits a day (before: 3).

## Acceptance Criteria

- [x] A usual portrait (one image on the usual model, one check) is charged about $0.069, so about 77 fit the $6 daily cap instead of 8 (each run must first reserve its worst case) (`src/tests/p1534-portrait-real-cost.test.ts`).
- [x] A call Google refused is not charged; an answered one is charged at its own model's price (`supabase/functions/_shared/p1453-artist-banner-run.test.ts`).
- [x] The charge never exceeds the reservation, and a model with no listed price is charged the maximum (same Vitest file).
- [x] A vision check skipped for time is not charged. A run releases its reservation only when it never started; a run whose calls were all refused keeps its whole reservation, as before, so refusals stay bounded by the global cap (Deno + Vitest above; Codex review findings).

Price source: Google's Gemini API pricing page, image output at $60 per 1M tokens, 1,120 tokens per 1K image.
