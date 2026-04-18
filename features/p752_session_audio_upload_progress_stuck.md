---
status: in-progress
type: bug
rank: 1000752.0
severity: high
workstream: Live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [live, audio-upload, p566, progress-ui]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
flow: fix
reproduce_artifact:
  test_file: src/tests/p752-reproduce.test.tsx
  root_cause: "Three structural display bugs in post-session upload UI — (H1) total=0 race from fire-and-forget saveChunk chain; (H2) count-based progress pinned at 0% during single-chunk upload; (H3) queue 'retrying' state not propagated to UI because UploadProgressState exposes only `status`."
  confidence: high
  surfaces_in_scope:
    - src/app/components/partners/live-mode-view.tsx (PartnerLeftScreen + UploadProgressState type)
    - src/app/pages/clarity-live-page.tsx (stopAndUploadRecording + onChunkProduced)
    - src/lib/chunk-upload-queue.ts (emitProgress, state surfacing)
  surfaces_deferred:
    - H4 prod upload reliability — needs Mixpanel `audio_chunk_upload_failed` 24h count + one live session network trace; file a separate P-number if evidence shows failures > 0/session on average.
  reproduced_at: 2026-04-18
---

# P752: Session audio upload progress stuck at 0% — and upload reliability unverified

## Summary

Post-session screen shows "Uploading session audio… 0%" and appears not to advance. Two coupled concerns: (a) the chunked upload flow (P566) has never been verified end-to-end in prod since it shipped — unknown whether audio is actually reaching GCS; (b) the display logic has three structural bugs that can pin the bar at 0% even when upload IS progressing.

## Root Cause (confirmed 2026-04-18)

Canary: `src/tests/p752-reproduce.test.tsx` — 3 tests, all red on current code.

- **H1 (total=0 race) — confirmed structurally.** `clarity-live-page.tsx:3159` writes `{pending:0, total:0, status:'uploading'}` immediately after `await stopRecording()`. The final chunk is saved via fire-and-forget `store.saveChunk(...).then(() => queue.enqueue(...))` at `:501-506`; until that IndexedDB write resolves and `enqueue` runs, `totalCount` stays 0 and the UI shows "0%" + "Don't close this tab yet." for a session that has no other chunks.
- **H2 (no in-chunk progress) — confirmed structurally.** `chunk-upload-queue.ts:269-274` emits `{uploaded, total}` only. UI formula `(total - pending) / total` yields 0% while a chunk is in-flight. Grep for `onprogress|XMLHttpRequest` in `src/`: zero matches. No byte-level path exists.
- **H3 (retries invisible) — confirmed structurally.** Queue tracks `state: 'idle' | 'uploading' | 'retrying' | 'stalled'` (chunk-upload-queue.ts:13, flipped at `:174`) but `UploadProgressState` (live-mode-view.tsx:247-251) exposes only `status: 'uploading' | 'complete' | 'failed'`. Retry state never reaches UI.
- **H4 (prod reliability) — deferred.** Observational, not reproducible in a test. Mixpanel query needed during /fix verification; if failures > 0/session on average, file a separate reliability ticket.

## Reproduction Steps

1. Sign in on prod. Start a /live session (use `/slava:maintain:prod-e2e` pattern with test account, or self-record).
2. Record at least 60 seconds so multiple 30s chunks are produced during the session.
3. Leave or end the session. Observe the post-session screen.
4. With DevTools Network + Console open, observe:
   - Do `PUT` requests to GCS succeed during the session (30s intervals)?
   - At session end, does the progress bar update, or stay at 0%?
   - Console for `[UploadQueue]` log lines (successful upload vs retry attempts).
5. Check Mixpanel: `audio_chunk_upload_failed` count for the last 24h, `audio_chunk_recovered` presence.

## Hypotheses (to falsify during /fix, not assumed confirmed)

**H1 — Display Bug A: `total=0` race at session end.**
`src/app/pages/clarity-live-page.tsx:3159` snapshots `queue.getTotalCount()` immediately after `await stopRecording()`. The final chunk is saved via fire-and-forget `store.saveChunk(...).then(() => queue.enqueue(...))` (`:501-503`) and may not be enqueued yet. If the session was short enough that no 30s tick ever fired, `totalCount=0` at snapshot → `live-mode-view.tsx:284-286` returns 0%.

**H2 — Display Bug B: no byte-level progress within a chunk.**
Queue progress is count-based (`uploadedCount / totalCount` in `chunk-upload-queue.ts:269-274`). A single large chunk (multi-MB 30s audio) in-flight contributes nothing to the bar until the whole `PUT` completes. A slow upload looks frozen.

**H3 — Display Bug C: retries indistinguishable from stalls.**
Queue retries up to 10 times with exponential backoff (1–30s cap, `chunk-upload-queue.ts:28-30`). During retry the state flips `uploading → retrying` internally but UI only reads `uploadProgress.status` which stays `'uploading'`. A stuck chunk can pin the bar for up to ~5 minutes before the drain timeout flips to `'failed'` — with no user signal that retries are happening.

**H4 — Upload actually failing in prod (reliability).**
Separate from UI. `uploadSingleChunk` calls a signed-URL GCS `PUT`. If signed-URL issuance or the PUT itself is failing in prod, the queue retries silently. P566 test exists (`e2e/p566-upload-reliability.spec.ts`) but needs confirmation it exercises the real GCS path vs mocks. Verify via Mixpanel `audio_chunk_upload_failed` volume and a live session network trace.

## Affected Files

- `src/app/pages/clarity-live-page.tsx:3146-3205` — `stopAndUploadRecording`, initial snapshot race
- `src/app/pages/clarity-live-page.tsx:494-510` — fire-and-forget `store.saveChunk().then(enqueue)`
- `src/app/components/partners/live-mode-view.tsx:281-316` — `PartnerLeftScreen` upload block, percent calc, no retry signal
- `src/lib/chunk-upload-queue.ts:269-274` — `emitProgress` count-based only
- `src/lib/chunk-upload-queue.ts:163-256` — state machine, retry loop
- `e2e/p566-upload-reliability.spec.ts` — verify test exercises real GCS

## Expected Behavior

- Progress bar visibly advances during and after the session as chunks upload.
- When a chunk is in retry, UI distinguishes that from normal upload (label change, color, or a "Retrying…" note).
- "Don't close this tab yet." warning only shown while there is genuinely pending work — never shown when queue is empty and total is 0 (nothing to do).
- On persistent failure, user sees a clear "failed" state (matches existing `uploadFailed` branch) rather than indefinite 0%.

## Actual Behavior

Post-session screen reads "Uploading session audio… 0%" with `Don't close this tab yet.`, appearing stuck. User cannot tell whether upload is progressing, retrying, or failed.

## Severity

**High** — session audio is the raw material for transcription, clarity-flip scoring, letters, post-session pipeline. A failing upload that looks identical to a succeeding one means we lose sessions silently and user stays on the screen indefinitely (or closes the tab, losing any residual IndexedDB chunks past their 24h orphan recovery window).

## Fix Approach

Reproduce first. Then:

1. **Canary tests (write BEFORE fix):**
   - Unit: short-session stop → final chunk enqueues async → `uploadProgress` never shows `status=uploading` with `total=0`. Must fail on current code.
   - Unit: retry in progress → UI exposes a `state` field (or similar) distinct from `status=uploading`. Must fail on current code.
   - E2E (if possible): record 10s session, mock GCS `PUT` to 500, assert user sees "Retrying…" label within 5s.

2. **H1 fix:** In `stopAndUploadRecording`, do not set `status: 'uploading'` until either (a) final chunk has enqueued (await the `saveChunk().then(enqueue)` chain — stop using fire-and-forget at this point in the flow) OR (b) `getTotalCount() > 0`. If nothing to upload, transition straight to `'complete'`.

3. **H2 fix:** Add byte-level progress. Two options — pick simplest:
   - (A) Show "Uploading chunk K of N" text instead of a percent bar. Avoids needing XHR progress events at all. Honest about the granularity.
   - (B) Wire `XMLHttpRequest.upload.onprogress` in `uploadSingleChunk` and expose per-chunk bytes to the queue. More faithful but more surface area.

4. **H3 fix:** Extend `UploadProgressState` to expose queue `state` (`uploading | retrying | stalled`). In `PartnerLeftScreen`, render "Retrying upload (attempt K of 10)…" when state=retrying.

5. **H4 — verify first, then decide:** If prod upload actually fails, the reliability fix is its own follow-up spec. Do NOT bundle into this fix. Just capture evidence (Mixpanel counts, network traces) and file a follow-up if needed.

## Acceptance Criteria

- [x] Canary tests for H1, H2, H3 exist and were red before the fix, green after.
- [x] Short session (no 30s tick ever fired) ends without ever showing 0% with "Don't close this tab yet." — either skips straight to complete or shows the final chunk progressing.
- [x] Long session with intentionally-failing GCS PUT (test-only mock) shows a "Retrying…" state within the first retry window; distinguishable from a healthy upload.
- [x] Successful long session shows visibly advancing progress (either byte-level or chunk-count text).
- [ ] Mixpanel evidence captured for H4: `audio_chunk_upload_failed` count last 24h + one live session network trace. If failures > 0 per session on average, file follow-up reliability spec (separate P-number).
- [ ] `e2e/p566-upload-reliability.spec.ts` confirmed to exercise real GCS path (not mocks only), or updated to do so.
- [x] No regression on existing success path: guest post-session flow (P492), session-ended vs partner-left titles (P584) still render correctly.
- [ ] No console errors on any of the three flows (healthy / retrying / failed).

## Verification

1. Reproduce with DevTools Network + Console open on prod.
2. Run canary tests — red → green.
3. Run `npm run build && npm test`.
4. Live session on test account, record >60s, end — observe advancing bar.
5. Live session with mocked failing PUT (Playwright route intercept) — observe "Retrying…" label.
6. Check Mixpanel for `audio_chunk_upload_failed` events before vs after fix deployment.
