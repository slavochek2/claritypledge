---
status: qa
type: bug
rank: 71
severity: medium
workstream: infra
date_reported: 2026-10-26
created_date: 2026-10-26
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [gemini, cost, edge-functions, test-accounts]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
---

# P1565: Banner edge functions spend real Gemini image calls for test accounts

## Summary

Creating a story or event as a test account on the cloud TEST project triggers a paid Gemini image generation, because `generate-banner` has no test-account or non-prod guard.

> "in prod, creating banners for test users or for users makes sense, but on test users in local database, that makes no sense, does it?" (founder)

## Root Cause

Hypothesis, not yet confirmed by a failing test:

- Story creation calls `generate-banner` fire-and-forget (`src/app/data/stories-service-real.ts:251`), and event creation calls it too (`src/app/data/events-service-real.ts:707`).
- `generate-banner` calls Gemini whenever `GEMINI_API_KEY` is set (`supabase/functions/generate-banner/index.ts:301`, `:415`, `:423`). Grepping it and `_shared/artist-banner-run.ts` for `is_test` or `test_account` finds nothing.
- The cloud TEST project (`VITE_SUPABASE_URL` in `.env.local`) is what e2e and manual testing hit. It is assumed to have `GEMINI_API_KEY` set (UNVERIFIED).
- The local Supabase stack does **not** spend: it has no `supabase/functions/.env` and no `[edge_runtime.secrets]` in `config.toml`, so the function returns at the env check.

Ruled out as spend sources: `src/tests/integration/p1453-banner-functions.test.ts` generates images only with `P1453_LIVE_GEN=1`; `scripts/edge-function-smoke.mjs` is credential-free and gets refused before any handler runs; `src/tests/p1534-portrait-real-cost.test.ts` is pure arithmetic.

UNVERIFIED: how much of the actual Gemini bill comes from TEST.

## Reproduction Steps

1. Sign in on the TEST project as a test account (`profiles.is_test_account = true`).
2. Create a story (or an event with no Unsplash banner).
3. Observe: `generate-banner` runs Gemini image generation and stores a new banner image.

**Reproduction rate:** expected 100% while the TEST key is set.

## Expected Behavior

Test accounts, and any non-prod environment, get a fixed placeholder banner with no Gemini call. The rest of the flow (the row update, the storage path) still runs, so tests keep covering it. Real prod users are unchanged.

## Actual Behavior

Every story or event a test account creates on TEST costs one or more paid Gemini image calls.

## Affected Files

- `supabase/functions/generate-banner/index.ts`: no guard before the Gemini call
- `supabase/functions/generate-event-banner/`: sibling, to be audited
- `supabase/functions/mirror-portrait/index.ts`: sibling, gated only by `MIRROR_AI_ENABLED` + key
- `supabase/functions/generate-agent-banner/`: operator-only, to be audited
- `src/app/data/stories-service-real.ts:251`, `src/app/data/events-service-real.ts:707`: auto-triggers

## Severity

**Medium**: a cost leak with no user-facing breakage. It grows with every test run.

## Fix Approach

**Key on the environment, not the test-account flag.** Measured 2026-10-26 on TEST (`ai_rate_limits`): 196 `generate-banner` requests since February, only 5 from profiles flagged `is_test_account`. A flag guard would miss 97% of the waste. Billing confirms it: the shared non-prod key's image spend is many times prod's (figures in `.private/`).

One shared helper in `supabase/functions/_shared/` decides `isProdProject()` from `SUPABASE_URL` (prod ref `besjtuodziykmjidubzw`). It fails closed: anything unrecognized counts as non-prod, and needs no new secret. Every image-spend path calls it before any Gemini request (`generate-banner`, `generate-event-banner`, `mirror-portrait`, `generate-agent-banner` / `_shared/artist-banner-run.ts`). On non-prod they store or return a deterministic placeholder image through the same persistence path, so tests still exercise row updates. Keep the existing `reserveGeneration` rate limiting (decisions.md, P1453 entry). An explicit opt-in env (e.g. `ALLOW_NONPROD_IMAGE_GEN=1`) lets the deliberate `P1453_LIVE_GEN` integration run still generate.

## Cost Budget

Scope: non-prod projects only. Prod's calls and costs are unchanged by construction: the guard admits exactly the prod host.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (Gemini) | 0 on non-prod (was 1 image call x 1–3 fidelity attempts, plus 1 vision check per attempt, per banner or portrait) | 0 x generations/hour = 0 | 0 x banners generated per run = 0 |
| Requests (Supabase storage + row update) | unchanged: 1 upload + 1 small copy + 1 row update per generation, same as before | same as before | same as before |
| Egress (bytes) | 107 B placeholder + small copy per generation (was ~0.3–0.9 MB per real banner: a TEST banner measured 878,428 B) | lower than before | lower than before |
| Log lines | +1 `console.warn` per blocked generation (1 x generations) | 1 x generations/hour | 1 x generations per run |
| Service unit x registry price | Gemini: 0 tokens x registry price = $0 on non-prod. Measured October baseline before the fix: non-prod image SKUs on the shared key = EUR 37.04 (billing export, `aikey-cp-batch-81413`) | | |

1. **Fits the plan limit today?** Fits. Gemini registry row: price with no cap. Projected non-prod monthly cost = generations per month x $0 = $0, against the measured EUR 37/month before the fix. Supabase Free plan: storage and egress per generation fall (107 B vs ~0.9 MB), so usage x runs per month only decreases.
2. **Failure modes:** if `SUPABASE_URL` is unset or unrecognized, the guard fails closed: no spend, placeholder, warn line. A deliberate live run uses the function secret `ALLOW_NONPROD_IMAGE_GEN=1`, which must be unset afterwards (noted in `p1453-banner-functions.test.ts`).
3. **Guard:** `supabase/functions/_shared/nonprod-image-guard.ts`; runtime-tested in `supabase/functions/_shared/p1565-nonprod-guard-runtime.test.ts`; spend watched by `ai-keys --sku-spikes` in /day.

## Acceptance Criteria

- [x] On a non-prod project, any account creating a story or event gets a placeholder banner, and no Gemini request is made
- [x] `mirror-portrait` and `generate-agent-banner` make no Gemini image call on non-prod unless `ALLOW_NONPROD_IMAGE_GEN=1`
- [x] A real (non-test) prod user still gets a generated banner
- [x] The same guard covers `generate-event-banner` and `mirror-portrait`, or each is deferred with its own ticket
- [x] Regression test: `src/tests/p1565-*.test.ts`

## Evidence (2026-10-26)

- **Red→green:** `src/tests/p1565-nonprod-image-guard.test.ts` passes 12/12. Control: with HEAD's unguarded `artist-banner-run.ts` swapped in, the 2 guard-order tests fail, so the test bites. Related suites: 26 files / 324 tests pass. `tsc --noEmit` is clean, and `deno check` passes on the four functions.
- **Live on TEST, after deploying the four functions:** a throwaway user's `generate-banner` returned 200 in 1.6s and stored **107 bytes**, which is the placeholder PNG. No Gemini call. The user was deleted afterwards. The P1453 live suite (`P1453_LIVE_GEN=1`) passes 8/8.
- **Prod unchanged:** the guard admits only host `besjtuodziykmjidubzw.supabase.co`. Recent prod `events.banner_url` values are built from the runtime `SUPABASE_URL` and use exactly that host. Confirm with one real prod generation after `/ship`.
- **Review:** Gemini `gemini-4-argon` returned no findings. Its caller list was lost to a shell glob error, so every direct Gemini call site was enumerated by hand (`grep generativelanguage|responseModalities`). All image paths are guarded; the text-only `mirror-reply` and `transcribe-slice` are out of scope.
- **Deploy-manifest stamp skipped** for the TEST deploy: stamping from main would record a SHA without this fix. `/ship` stamps it.
