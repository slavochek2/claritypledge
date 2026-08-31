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

- [ ] No session code or user identifier is printed to the production console on any `/live` flow
- [ ] Ungated `console.log` count in `src/app/` is 0, or every survivor is justified in the spec
- [ ] Loading any production page produces no `[TAG]`-prefixed console output
- [ ] A lint rule or equivalent gate fails when a new ungated `console.log` is added
- [ ] No console errors introduced by the cleanup
