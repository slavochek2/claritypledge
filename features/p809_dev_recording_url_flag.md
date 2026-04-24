---
status: week
type: task
rank: 1000798.0
workstream: C1
created_date: '2026-04-24'
tags: [debug, recording, ml-training, dev-ergonomics]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

Opt-in URL querystring flag `?dev-recording=1` on `/live` page. When present AND `import.meta.env.PROD === false`, the gate falls through and recording starts. Upload path is rewritten at chunk-assembly time to `sessions/_dev/<code>/<filename>` instead of `sessions/<code>/<filename>`, so test chunks never mix with prod training data.

Prod path (`import.meta.env.PROD === true`) is completely untouched — the flag has no effect there. This is enforced by structure (the flag check is guarded by the env check), not by discipline.

Console must log `[P28.1] DEV RECORDING ACTIVE — uploading to sessions/_dev/` on gate bypass, so the developer always knows they're on the dev path.

## Risks / Non-Goals

### Risks
- **Dev chunks leak into training bucket root** — Mitigation: path rewrite happens at a single chokepoint in the upload call site, with a test asserting all three branches (prod, dev-no-flag, dev-with-flag) land in the expected prefix.
- **Signed URL signer doesn't know about `_dev/` prefix** — the Cloud Function `gcs-signed-url` signs for whatever object name it's asked to sign. If the client requests `sessions/_dev/X/foo.webm`, the signer signs that exact path. No server change needed. Will verify in implementation.
- **Developer forgets flag is on** — Mitigation: flag is querystring (lost on every nav), not localStorage; console log is loud.

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
Single commit reverts the entire change. Any `gs://claritypledge-ml-training/sessions/_dev/` objects can be cleaned with `gsutil rm -r gs://claritypledge-ml-training/sessions/_dev/`.

## Done-When

- [ ] On prod (`import.meta.env.PROD === true`): `?dev-recording=1` has **no effect**; existing prod behavior unchanged (chunks still land in `sessions/<code>/`)
- [ ] On localhost without flag: recording skipped (existing behavior preserved)
- [ ] On localhost with `?dev-recording=1` on `/live` URL: recording starts, chunks upload successfully to `sessions/_dev/<code>/`
- [ ] `gsutil ls gs://claritypledge-ml-training/sessions/_dev/` shows dev chunks after a test session
- [ ] `gsutil ls gs://claritypledge-ml-training/sessions/<code>/` for the same test code shows nothing (no leak)
- [ ] Console logs `[P28.1] DEV RECORDING ACTIVE — uploading to sessions/_dev/` when flag bypass fires
- [ ] Unit/canary test covers all three gate branches: `(prod, any flag) → record to sessions/`, `(dev, no flag) → skip`, `(dev, flag) → record to sessions/_dev/`
- [ ] After this ships, I can reproduce a signed-PUT failure on localhost with full DevTools access (verified by filing + reproducing the current GCS 400 matryoshka layer)
