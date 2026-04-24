---
status: in-progress
type: task
rank: 1000798.0
workstream: C1
created_date: '2026-04-24'
tags: [debug, recording, ml-training, dev-ergonomics]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P809: Dev-recording URL flag for local reproduction of GCS upload bugs

## Problem

**Situation:** `clarity-live-page.tsx:859` has a hard prod-only gate: `if (!import.meta.env.PROD) return;` — refuses to record audio/events on localhost or any non-prod environment. This was deliberate (P28.2: don't pollute training data with dev sessions).

**Complication:** Prod audio uploads were silently broken for 33 days (P802 → P805 → P807 matryoshka). Each layer surfaced only after the previous one shipped, and each debug cycle required a live prod session because the gate blocked local reproduction. Today's screenshots show a fourth layer now visible — GCS returning 400 Bad Request on the actual PUT — with no way to inspect the full request/response body without hot-debugging prod.

**Question:** How do we keep training-data hygiene while giving developers a path to reproduce upload bugs locally?

## Appetite

Low blast radius — modifies one gate in one file; prod behavior unchanged when the flag is absent.
High reversibility — git revert removes the flag; any `sessions/_dev/` objects are deletable with a single `gsutil rm -r`.
Low decision density — shape already discussed (URL flag, separate bucket path, no DB change).

## Solution

Opt-in URL querystring flag `?dev-recording=1` on `/live` page. When present AND `import.meta.env.PROD === false`, the gate falls through and recording starts. At chunk-assembly time, filenames are prefixed with `_dev_` (e.g. `_dev_alice_chunk_000.webm`, `_dev_alice_events_000.json`) so test chunks never mix with prod training data.

**Why filename prefix instead of path separation (`sessions/_dev/<code>/`):** The final GCS object path is constructed by an external GCP Cloud Function (`gcs-signed-url`) that we don't control from this repo. Modifying the signer to accept a `devPath` flag is heavyweight and requires GCP access. Smuggling slashes through the `fileName` parameter works only if the Cloud Function permits slashes in fileName (unverified and fragile). Filename prefix achieves the same goal (training data hygiene via trivial filter) with a one-string client-side change and zero dependency on external infra. Cleanup: `gsutil rm 'gs://claritypledge-ml-training/sessions/**/_dev_*'`.

Prod path (`import.meta.env.PROD === true`) is completely untouched — the flag has no effect there. This is enforced by structure (the flag check is guarded by the env check), not by discipline.

Console must log `[P28.1] DEV RECORDING ACTIVE — uploading with _dev_ prefix` on gate bypass, so the developer always knows they're on the dev path.

## Risks / Non-Goals

### Risks
- **Dev chunks leak into training bucket untagged** — Mitigation: filename prefix applied at a single chokepoint (chunk filename construction in `api.ts`), with a test asserting all three branches (prod, dev-no-flag, dev-with-flag) produce the expected filename shape.
- **Training pipeline ingests `_dev_*` files as real data** — Mitigation: training jobs must filter out filenames starting with `_dev_`. Follow-up doc note required in training pipeline spec (when one exists). Until then, manual cleanup with `gsutil rm 'gs://...**/_dev_*'` before any training run.
- **Developer forgets flag is on** — Mitigation: flag is querystring (lost on every nav), not localStorage; console log is loud.
- **CORS origin list on the bucket may not include the active dev port** — The `claritypledge-ml-training` bucket's CORS currently allows localhost ports 5173 and 5200 only (see P807 fix). Worktree ports (w6 = 5600) are not in that list, so preflight will fail from that port. Mitigation: either run the dev server on :5200, or extend the bucket CORS origin list (separate follow-up, requires `gsutil cors set` approval).

### Non-Goals
- Do NOT change prod behavior in any way — the flag must be a no-op when `import.meta.env.PROD === true`
- Do NOT add a UI indicator (badge, banner) — console log only. Keeps the diff tiny and prod surface untouched.
- Do NOT add a DB column (`dev_recording: true` on `ml_training_sessions`) — bucket path prefix is the only separator
- Do NOT support localStorage or cookie-based flag persistence — sticky flag = forgotten flag
- Do NOT touch private-session handling (existing Gate C logic stays as-is)
- Do NOT add rate limiting, authentication, or any gating beyond the env + querystring check

### Alternatives Considered
- **Separate test bucket (`claritypledge-ml-training-test`)** — Requires new CORS config, new signer permissions, new env var for bucket name. Overkill for a debug tool. Rejected.
- **DB column `dev_recording`** — Requires migration + RLS update + filtering in training jobs. Too much surface for a throwaway debug path. Rejected.
- **Always record on localhost, filter by filename convention** — Violates P28.2 intent (don't pollute). Rejected.
- **Env var `VITE_DEV_RECORDING=1`** — Requires restart to toggle; not granular per-session. Rejected in favor of querystring.

### Rollback Strategy
Single commit reverts the entire change. Any `_dev_*` objects in the bucket can be cleaned with `gsutil rm 'gs://claritypledge-ml-training/sessions/**/_dev_*'`.

## Done-When

- [ ] On prod (`import.meta.env.PROD === true`): `?dev-recording=1` has **no effect**; existing prod behavior unchanged (chunks still land with un-prefixed filenames)
- [ ] On localhost without flag: recording skipped (existing behavior preserved)
- [ ] On localhost with `?dev-recording=1` on `/live` URL: recording starts, chunks upload with filenames prefixed `_dev_` (e.g. `_dev_alice_chunk_000.webm`)
- [ ] `gsutil ls 'gs://claritypledge-ml-training/sessions/<code>/_dev_*'` shows dev chunks after a test session
- [ ] Same test session has zero non-`_dev_`-prefixed files from the dev run (no leak)
- [ ] Console logs `[P28.1] DEV RECORDING ACTIVE — uploading with _dev_ prefix` when flag bypass fires
- [ ] Unit/canary test covers all three gate branches: `(prod, any flag) → record with un-prefixed filenames`, `(dev, no flag) → skip`, `(dev, flag) → record with _dev_ prefix`
- [ ] After this ships, I can reproduce a signed-PUT failure on localhost with full DevTools access (verified by filing + reproducing the current GCS 400 matryoshka layer)
