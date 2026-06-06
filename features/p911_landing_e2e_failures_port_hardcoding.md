---
status: backlog
type: bug
rank: 1000799.0
severity: medium
date_reported: '2026-06-06'
created_date: '2026-06-06'
tags: [e2e, landing, test-infra]
---

# P911: Landing-page e2e failures on main + hardcoded ports break e2e in worktrees

> Found during P909's test run: 5 e2e failures reproduce identically on a clean main checkout — pre-existing, unrelated to P909's delta. Filed as the deferral named by P909's ship gate.

## Summary

Two distinct concerns surfaced by running `e2e/app-boot-smoke.spec.ts` + `e2e/landing-no-horizontal-scroll.spec.ts` + `e2e/logo-navigation.spec.ts` on main:

### Concern A — product: landing page horizontal overflow (4 failing tests)

`e2e/landing-no-horizontal-scroll.spec.ts` fails on main:
1. `should not have horizontal scrollbar on mobile viewport` — expects `false`, gets `true`
2. `section animations should trigger on scroll`
3. `mobile viewport should not allow horizontal drag scroll` — expects scroll delta `0`, gets `80`
4. `FAQ section expanded should not overflow`

The landing page (`/`) appears to allow ~80px of horizontal drag at mobile width. Either the page regressed (tests are the spec → fix the page) or the page was redesigned and these tests encode a stale contract (then explain + update with approval, per `.claude/rules/tests.md`).

### Concern B — test infra: hardcoded ports + flaky locator

1. Several specs hardcode a localhost port instead of using Playwright's worktree-aware `baseURL` from `playwright.config.ts` — they fail with `ERR_CONNECTION_REFUSED` (or hit the wrong server) in any worktree (w1→5100 … w7→5700). Known offenders from a verified sweep: `e2e/app-boot-smoke.spec.ts:16` (`:5001`), `e2e/p844-verify.spec.ts:4` (`:5100`), `e2e/save-auth.ts:50` (`:5173`), `e2e/integration/p458-auth-callback-position.spec.ts:444` (`:5001` fallback). NOTE (corrected after adversarial review): `landing-no-horizontal-scroll.spec.ts` is NOT an offender — it already uses relative `page.goto('/')` (lines 12, 127); its failures are Concern A only. The canonical correct pattern is that file's relative-goto style.
2. `app-boot-smoke.spec.ts:32` — `getByText('Clarity Pledge').first()` is DOM-order dependent and resolves to a hidden testimonial paragraph ("Testing the Clarity Pledge"), making the home-boot test flaky on main (passed only on retry).

## Reproduction

```bash
# Concern A (on main, w0):
npx playwright test e2e/landing-no-horizontal-scroll.spec.ts   # 4 failures

# Concern B (from any worktree):
npx playwright test e2e/app-boot-smoke.spec.ts                 # ERR_CONNECTION_REFUSED :5001
```

## Acceptance Criteria

- [ ] Root cause of the landing-page horizontal overflow identified: page regression vs stale test contract (decide with founder if contract changed)
- [ ] `landing-no-horizontal-scroll.spec.ts` passes on main
- [ ] No e2e spec hardcodes a localhost dev port — all use Playwright `baseURL` (relative `page.goto('/')`); sweep confirms zero `localhost:5\d{3}` literals in `e2e/` (allowlist: deployed-prod smoke specs that intentionally read `PROD_*_URL`/`CSP_SMOKE_URL` env)
- [ ] `app-boot-smoke.spec.ts` home test uses a stable locator (role/landmark, not `getByText(...).first()`) and passes without retry
