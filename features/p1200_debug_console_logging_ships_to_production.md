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
delivery_stage: ship
pipeline_ran: [create-bug, inline, ship]
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

**Lint gate — added, then widened, and proven to fire twice (epistemic gate 7):**
`eslint.config.js` has `no-console: ['error', { allow: ['error', 'warn'] }]`, plus
`'no-console': 'off'` for `**/*.test.{ts,tsx}` / `**/tests/**/*.{ts,tsx}`. Initially scoped to
`src/app/**` only (widening to `src/**` surfaced ~63 pre-existing ungated `console.log`/`console.info`
sites in `src/auth/AuthCallbackPage.tsx`, `src/hooks/`, and `src/lib/`, outside this spec's original
Affected Files list). Founder approved widening in the same P-number as a separate commit — now
scoped to `files: ['src/**/*.{ts,tsx}']` (test files still exempt).

**Widening cleanup — per-site policy applied to all ~63 sites**, read in full before touching:
- **Deleted** (single-use, no test/operational dependency, no established file convention):
  `use-audio-recorder.ts` (7 sites — flush/mode/duration/start/stop status logs); `chunk-store.ts`
  (1 site — happy-path "using IndexedDB" confirmation; the fallback `console.warn` stays).
- **DEV-gated + `eslint-disable-next-line` with rationale** (operational value, not test-asserted):
  `chunk-upload-queue.ts` (3 sites — rare orphaned-chunk crash-recovery path, P566);
  `useSpeechToText.ts` (2 `console.info` sites — P1196/P1213 auto-restart lifecycle, extensively
  documented in-file); `AuthCallbackPage.tsx` (2 previously-ungated P581 sites, matched to the
  file's own established DEV-gate convention; its ~26 pre-existing DEV-gated sites also received
  the disable directive, since the AST-based rule can't see a runtime `if (import.meta.env.DEV)`
  guard).
- **DEV-gated (not deleted) because a test asserts the exact call** — `import.meta.env.DEV` is
  `true` under vitest (verified: printed `IMPORT_META_ENV_DEV= true MODE= test` in a throwaway
  test), so gating changes nothing at test time: `session-events-collector.ts` (3 sites —
  `session-events-collector.test.ts` asserts `toHaveBeenCalledWith` on each); `mixpanel.ts`
  (2 sites — `mixpanel-ml-collector.test.ts` asserts the same).
- **Left ungated, annotated only** — `nav-trace.ts` (2 sites): the file's own header doc states
  these are deliberately prod-active, opt-in via `?navtrace=1`, because the P1197 bug they
  diagnose does not reproduce in dev (six constructed harness scenarios failed to trigger it); a
  DEV gate would defeat the instrument's purpose. `p1197-nav-trace.test.ts` also asserts on these
  calls, unaffected since behavior is unchanged.

Failure-path proof, run twice: (1) appended `console.log('[TEST-P1200-CANARY] should fail lint');`
to `clarity-demo-page.tsx`, ran `npx eslint src/app/pages/clarity-demo-page.tsx` →
`562:1  error  Unexpected console statement. Only these console methods are allowed: error, warn  no-console`,
exit code 1; removed, re-ran → exit 0. (2) After widening, appended
`console.log('[TEST-P1200-WIDEN-CANARY] should fail lint');` to `src/lib/chunk-store.ts`, ran
`npx eslint src/lib/chunk-store.ts` → same `no-console` error, exit code 1; removed, re-ran → exit 0.

**Full test/lint/typecheck run — before AND after widening (both pass):**
- `npx tsc --noEmit -p .` → exit 0, no output.
- `npx eslint src` and `npm run lint` (project-wide) → exit 0, no errors.
- `npx vitest run` → `304 passed | 2 skipped (306)` test files, `3485 passed | 19 skipped (3504)`
  tests — unchanged after widening, including the 3 files with console-spy assertions
  (`session-events-collector.test.ts`, `mixpanel-ml-collector.test.ts`, `p1197-nav-trace.test.ts`).
- `./scripts/pre-commit-checks.sh` (staged) → exit 0 both times. First commit: 2 non-blocking
  warnings — expected `console.log found` (the justified survivors) and `/live runtime file
  changed but no E2E test` (`clarity-live-page.tsx` only had logs deleted + a behavior-preserving
  guard-clause simplification, no new `/live` behavior). Second commit: 1 non-blocking warning —
  the expected `console.log found` listing all DEV-gated/intentional survivors across the widened
  scope.

**Commits:**
- `e96c9d69` — `fix(p1200): remove ungated debug console.log from src/app; add no-console lint gate`
- `f1846cd6` — `docs(p1200): evidence`
- `3551114c` — `fix(p1200): widen no-console gate to src/**; clean src/auth, src/hooks, src/lib`

**Not done:** none — the widening closes the item previously flagged here as a follow-up.
