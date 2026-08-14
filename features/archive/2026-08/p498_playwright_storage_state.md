---
status: rejected
type: task
rank: 24
tags: [playwright, visual-qa, auth, tooling]
flow: dev
created_date: 2026-03-12
closed_at: '2026-08-14'
---

# P498: Playwright StorageState for Visual QA

> **Closed 2026-08-14 — backlog triage.** Delivered as unnumbered infrastructure: `e2e/save-auth.ts`, `npm run test:save-auth`, auto-loaded by `playwright.config.ts`. All four ACs satisfied.
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

## Problem

Agents need to verify visual output of authenticated pages (session history, partner dashboard, live host view) but headless browsers have no auth. Screenshots of these pages show login screens instead of actual content.

**Root cause:** Playwright sessions start unauthenticated. Supabase auth tokens live in localStorage — no way to inject them without a real login flow.

**Solution:** Save Playwright `storageState` (cookies + localStorage) after a manual login, reuse it in all subsequent headless sessions. One manual login per host, automated screenshots from then on.

---

## Scope

1. **Save-auth script** — launches headed Chromium, user logs in manually, script saves storageState to `.private/test-auth/{host}.json`
2. **Playwright config** — loads storageState when file exists, graceful fallback when missing or expired
3. **`/verify` integration** — detect saved state, use it for authenticated page screenshots
4. **Docs** — cookie expiry, refresh workflow, which pages need auth

---

## Acceptance Criteria

- [ ] AC1: `npm run test:save-auth` opens headed browser, user logs in, state saved to `.private/test-auth/{host}.json`
- [ ] AC2: E2E tests and `/verify` automatically use saved state when present
- [ ] AC3: Expired/invalid state produces clear error message, not silent failure
- [ ] AC4: `.private/test-auth/` is gitignored (contains session credentials)

---

## Notes

- Bonus on top of P496/P497 — not blocking anything
- Supabase access tokens expire (default 1 hour, refresh tokens last longer) — script should document refresh cadence
- storageState JSON contains secrets — must never leave `.private/`
