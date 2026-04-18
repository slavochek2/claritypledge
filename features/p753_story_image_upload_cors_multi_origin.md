---
status: qa
type: bug
rank: 1000751.0
severity: medium
workstream: story
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [cors, edge-function, dev-experience, story-editor]
delivery_stage: ship
pipeline_ran: [create-bug, fix, fix.2, ship]
---

# P753: Story image upload fails with CORS error from any dev worktree except w3

## Summary

`generate-story-image-url` edge function has `ALLOWED_ORIGIN` hardcoded to `http://localhost:5300` (w3 port), causing CORS failures on w0 (5001), w1 (5100), w2 (5200), and all other worktrees.

## Root Cause

The `ALLOWED_ORIGIN` Supabase secret on the test project (`gfjctyxqlwexxwsmkakq`) is set to `http://localhost:5300`. The edge function builds a static `corsHeaders` object from this env var at module load (`supabase/functions/generate-story-image-url/index.ts:29–35`). Any `Origin` that isn't exactly `http://localhost:5300` gets a mismatched `Access-Control-Allow-Origin` header → browser rejects the preflight → upload toast "Failed to upload image."

Prior decision to defer this (`docs/decisions.md:3510–3516`, 2026-03-28, during P591) classified it as a manual config step. It now blocks all multi-worktree story-editor development.

## Reproduction Steps

1. Open any dev worktree that is **not** w3 — e.g. w0 (`http://localhost:5001`) or w1 (`http://localhost:5100`)
2. Navigate to `/story/<any-story-id>` in the story editor
3. Click **Add image**, select any file
4. Observe the "Failed to upload image" toast

**Reproduction rate:** 100% on w0/w1/w2; 0% on w3

## Expected Behavior

Image upload succeeds from any ClarityPledge dev worktree. The OPTIONS preflight returns `Access-Control-Allow-Origin` matching the request's `Origin`. The PUT to GCS completes. The image renders in the editor.

## Actual Behavior

Console: `Access-Control-Allow-Origin header has a value http://localhost:5300 that is not equal to the supplied origin http://localhost:5100`
Network: `story-image-service.ts:45 POST … net::ERR_FAILED`
Toast: "Failed to upload image."

## Affected Files

- `supabase/functions/generate-story-image-url/index.ts` — lines 29–35: static `corsHeaders` built from `Deno.env.get('ALLOWED_ORIGIN')` at module load; needs per-request dynamic allowlist
- `src/app/data/story-image-service.ts:45` — client call site (no change needed)
- `vite.config.ts:27` — dev port allocation that defines the regex needed (w0=5001, w1..w7=5100..5700, named=5800..5899)

## Severity

**Medium** — major feature (story image upload) fully broken for any worktree except w3; workaround exists (develop from w3), but blocks normal multi-worktree development.

## Fix Approach

Replace the static `corsHeaders` object with a per-request `buildCorsHeaders(req)` that reflects the request `Origin` back when it matches an allowlist (exact prod origin, localhost dev-port regex, Vercel preview pattern). Add `Vary: Origin` to prevent CDN cache cross-contamination. No Supabase secret changes needed — the existing `ALLOWED_ORIGIN=http://localhost:5300` becomes the fallback for unrecognized origins (correct: blocks `evil.example`). Deploy only `generate-story-image-url` to test.

The other 12 edge functions with the same pattern are out of scope — track as a separate "shared CORS helper" spec.

## Acceptance Criteria

- [x] Image upload succeeds from w0 (`http://localhost:5001`) — OPTIONS preflight returns `Access-Control-Allow-Origin: http://localhost:5001`, `Vary: Origin` present; POST returns 200 with `signedUrl`
- [x] Image upload succeeds from w1 (`http://localhost:5100`) — same headers
- [x] An unrecognized origin (`https://evil.example`) gets no ACAO header — browser CORS rejects it
- [x] "Failed to upload image" toast does **not** appear on w0 or w1 after the fix
- [x] Image renders in the story editor after upload on w0 and w1
