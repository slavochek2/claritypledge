---
status: week
type: bug
rank: 89
severity: low
date_reported: '2026-08-31'
created_date: '2026-08-31'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [logging, privacy, production, cleanup]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1200: Ungated debug console logging ships to the production console

## Summary

65 ungated `console.log('[TAG] …')` calls across `src/app/` run in production; two of them print a
live session code to the browser console.

## Root Cause

Debug logging added during investigation was never gated or removed. The codebase has a working
convention for this — `point-detail-page.tsx:452` wraps its log in `if (import.meta.env.DEV)` — but
it is applied inconsistently, and nothing enforces it. Filed as a Tier-1 surface finding while
fixing P1197, which removed one instance of exactly this class (`[AUTH-TRACE]` in
`letters-page.tsx`, a leftover from an earlier attempt at P1197 itself; P705 in `docs/decisions.md`
recorded that those logs "must be reverted when that branch merges" — they were not).

## Reproduction Steps

1. Open production `claritypledge.com` with the browser console visible.
2. Start or join a `/live` session.
3. Observe `[P28.1]`, `[B48]`, `[Join]`, `[Mic]`, `[P495]` lines in the console.
4. At upload, observe the session code printed in clear.

**Reproduction rate:** 100%

## Expected Behavior

Production console is quiet. Diagnostics that are worth keeping are gated on `import.meta.env.DEV`
or behind an opt-in flag; no identifier reaches the console unasked.

## Actual Behavior

65 log statements execute in prod. `clarity-live-page.tsx:3491` and `:3605` print `session.code`.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — 20 calls, incl. `:3491` and `:3605` (session code)
- `src/app/` — 45 further calls across other pages/components

## Severity

**Low** — console noise, no functional impact. The session-code lines are the only part with any
privacy weight, and a session code is already visible to a participant in that session.

## Fix Approach

Audit the 65 sites and, per site, either delete, gate on `import.meta.env.DEV`, or route through a
logger helper. Prefer deletion — most are single-use investigation aids. The two session-code lines
should be handled first regardless of what happens to the rest.

Consider an ESLint rule (`no-console` with an allowlist for `console.error`/`warn`) to keep the
count from climbing back. Without an enforcement mechanism this recurs — it already has.

## Acceptance Criteria

- [x] No session code or user identifier is printed to the production console on any `/live` flow
- [x] Ungated `console.log` count in `src/app/` is 0, or every survivor is justified in the spec
- [x] Loading any production page produces no `[TAG]`-prefixed console output (all remaining sites are `import.meta.env.DEV`/`DEBUG`-gated, never execute in prod)
- [x] A lint rule or equivalent gate fails when a new ungated `console.log` is added
- [x] No console errors introduced by the cleanup (tsc, eslint, vitest all pass; no new runtime error paths)

## Evidence

**Console.log audit (`grep -rn "console\.log(" src/app`):** 114 total before → 17 after. All 17
survivors are runtime-gated (`if (import.meta.env.DEV)` or a `DEBUG = import.meta.env.DEV` helper)
and never execute in production; each carries an `eslint-disable-next-line no-console` with a
rationale comment. 97 ungated sites deleted, including the two `session.code` lines in
`clarity-live-page.tsx` (former lines 3491, 3605 — handled first, per Fix Approach).

Breakdown of deletions: `src/app/data/api.ts` (75), `src/app/pages/clarity-live-page.tsx` (20,
incl. both session-code lines), `src/app/pages/clarity-demo-page.tsx` (1),
`src/app/pages/clarity-chat-page.tsx` (1). Two deletions left a variable unused (`filePath`,
`eventsPath` in `api.ts`, only ever read by the deleted log) and two left an empty block
(`clarity-live-page.tsx` dev-recording branch, `api.ts` DB-record-success branch) — all four
cleaned up minimally (unused destructure removed; the empty-block `if/else` in
`clarity-live-page.tsx` inverted to a single guard clause). No other behavior changed.

**Lint gate — added and proven to fire (epistemic gate 7):** `eslint.config.js` now has
`no-console: ['error', { allow: ['error', 'warn'] }]` scoped to `files: ['src/app/**/*.{ts,tsx}']`,
plus `'no-console': 'off'` for `**/*.test.{ts,tsx}` / `**/tests/**/*.{ts,tsx}`. Scoped to
`src/app/` rather than all of `src/**` — widening to `src/**` surfaces ~63 pre-existing ungated
`console.log` sites in `src/auth/AuthCallbackPage.tsx`, `src/hooks/`, and `src/lib/` that are
outside this spec's Affected Files list; fixing those was out of scope, and leaving the wider rule
in would fail the build on unrelated code. Flagging for a possible follow-up spec.

Failure-path proof: appended `console.log('[TEST-P1200-CANARY] should fail lint');` to
`clarity-demo-page.tsx`, ran `npx eslint src/app/pages/clarity-demo-page.tsx` →
`562:1  error  Unexpected console statement. Only these console methods are allowed: error, warn  no-console`,
exit code 1. Canary line removed immediately after; `npx eslint` on the same file then exits 0.

**Full test/lint/typecheck run (all pass):**
- `npx tsc --noEmit -p .` → exit 0, no output.
- `npx eslint src` and `npm run lint` (project-wide) → exit 0, no errors.
- `npx vitest run` → `304 passed | 2 skipped (306)` test files, `3485 passed | 19 skipped (3504)` tests.
- `./scripts/pre-commit-checks.sh` (staged) → exit 0, 2 non-blocking warnings: (1) `console.log
  found` — expected, lists the 17 justified DEV-gated survivors; (2) `/live runtime file changed
  but no E2E test` — `clarity-live-page.tsx` was touched only for log deletion + a logic-preserving
  guard-clause simplification (no new `/live` behavior), so no new E2E was added.

**Commits:**
- `e96c9d69` — `fix(p1200): remove ungated debug console.log from src/app; add no-console lint gate`

**Not done / flagged for the team lead:** ~63 ungated `console.log` sites outside `src/app/`
(`src/auth/AuthCallbackPage.tsx`, `src/hooks/use-audio-recorder.ts`, `src/hooks/useSpeechToText.ts`,
`src/lib/chunk-store.ts`, `src/lib/chunk-upload-queue.ts`, `src/lib/mixpanel.ts`,
`src/lib/nav-trace.ts`, `src/lib/session-events-collector.ts`) were discovered while widening the
lint rule to `src/**`, but were never in this spec's Affected Files list — left untouched and the
lint gate scoped to exclude them. Recommend a follow-up P-number if these should be cleaned up too.
