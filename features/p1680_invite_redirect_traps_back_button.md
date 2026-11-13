---
status: qa
type: bug
rank: 337
severity: medium
date_reported: 2026-11-13
created_date: 2026-11-13
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [navigation, landing, invite, history]
disclosure: public
date_resolved: 2026-11-13
root_cause: "Invite redirect used a push navigation, so the invite URL stayed one entry back and Back re-mounted it, re-firing the redirect (and landing_page_viewed)"
resolution: "useInviteRedirects navigates with { replace: true }; /builders uses the shared hook instead of its inline copy"
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1680-invite-redirect-history.test.tsx
  root_cause: "Invite redirect uses navigate() push, so the invite URL stays one entry back; Back re-mounts the landing, which redirects again (and re-fires landing_page_viewed)"
  confidence: high
  surfaces_in_scope: [hiring, coach, founder, builders]
  surfaces_deferred: [P1681]
  reproduced_at: 2026-11-13
---

# P1680: Invite links trap the browser Back button on /hiring, /coach, /founder and /builders

## Summary

Opening an invite link (`?referrer=x` or `?login=1`) on a landing page redirects to `/sign-pledge` or `/login` with a push navigation, so pressing Back returns to the invite URL, the redirect fires again, and the visitor cannot leave by Back. Introduced with the redirect itself; P1674 consolidated three copies into one shared hook without changing the push.

## Root Cause

`useInviteRedirects` (`src/app/hooks/useInviteRedirects.ts:14,16`) calls `navigate("/sign-pledge")` / `navigate("/login")` without `{ replace: true }`. A push keeps the invite URL as the previous history entry; Back pops to it, the page mounts, the effect sees the same query, and pushes again.

`/builders` (`src/app/pages/build-right-thing-landing.tsx:39-45`) has its own inline copy of the same effect with the same push. A third inline copy sits in `src/app/pages/clarity-pledge-landing.tsx:39-47`, routed only at the DEV-only `/tree/old-landing` (`src/app/tree/tree-routes.tsx:105`).

**Confirmed by `/reproduce`** (`src/tests/p1680-invite-redirect-history.test.tsx`): with history `[/prior, invite URL]`, the redirect lands on the target, then Back shows the target again, never `/prior`. Failing for all 12 redirect cases (4 pages × `?referrer`, `?login`, both); the 4 empty-value cases pass. Second symptom found by the same test: each Back press re-mounts the landing, so `landing_page_viewed` fires again; the trap inflates view counts.

## Invariants

- Targets and precedence stay exactly as they are: a non-empty `?referrer` goes to `/sign-pledge` and wins over `?login`; otherwise a non-empty `?login` goes to `/login`; empty values (`?referrer=&login=`) do not redirect.
- `landing_page_viewed` still fires once, with its `referrer` property, before the redirect.
- `/login` and `/sign-pledge` must not rely on `location.key === 'default'` to detect a cold arrival — a replace mints a non-default key (decisions.md 2026-09-11). Checked at filing: neither page does.

## Reproduction Steps

1. Open any page on the site (e.g. `/feed`), then visit `/hiring?referrer=x` in the same tab.
2. Observe: lands on `/sign-pledge`.
3. Press Back.
4. Observe: URL briefly becomes `/hiring?referrer=x`, then the redirect fires again and lands on `/sign-pledge`. The visitor never gets back to `/feed`.

Same with `?login=1` (lands on `/login`) and on `/coach`, `/founder`, `/builders`.

**Reproduction rate:** 100% (12 of 12 cases in the canary)

## Expected Behavior

Back from `/sign-pledge` or `/login` goes to whatever was before the invite link (the previous page, or out of the site on a cold arrival). The invite URL is not left in history.

## Actual Behavior

Back returns to the invite URL, which immediately redirects forward again.

## Affected Files

- `src/app/hooks/useInviteRedirects.ts:14,16` — used by `/hiring` (`program-page.tsx`), `/coach` (`coach-partnership-page.tsx`), `/founder` (`old-landing-2.tsx`)
- `src/app/pages/build-right-thing-landing.tsx:39-45` — `/builders`, inline copy
- `src/app/pages/clarity-pledge-landing.tsx:39-47` — DEV-only `/tree/old-landing`, inline copy

## Severity

**Medium** — invite links are prod-reachable entry points and the trap blocks Back navigation; workaround is the address bar or Back twice quickly.

## Fix Approach

Pass `{ replace: true }` to both navigate calls in the hook. Point `/builders` at the shared hook instead of its inline copy (it already calls the view effect first, so ordering is unchanged). Pin the history behaviour in a vitest test with a `MemoryRouter` that has a prior entry: after the redirect, `navigate(-1)` lands on the prior entry, not the invite URL.

## Resolution

`src/app/hooks/useInviteRedirects.ts` navigates with `{ replace: true }`, so the invite entry is replaced by `/sign-pledge` or `/login` and Back goes to whatever came before it. `/builders` (`build-right-thing-landing.tsx`) now calls the shared hook instead of its inline copy, after its view effect as before. The DEV-only `/tree/old-landing` copy is filed as P1681.

In development, StrictMode runs the redirect effect twice. With the old push, that left two `/sign-pledge` entries; with replace, it is idempotent.

**Evidence**

- **Canary** (`src/tests/p1680-invite-redirect-history.test.tsx`, MemoryRouter `[/prior, invite URL]`) has 20 cases: 5 entry paths (`/hiring`, `/coach`, `/founder`, `/builders`, and `/`, which forwards to `/builders`) × (`?referrer`, `?login`, both, empty).
  - Before the fix: 12 of 16 failed (the original 16 cases), Back staying on the target.
  - After: 20 of 20 pass.
  - Known-bad control (hook reverted to push): 15 of 20 fail, and the 5 empty-value cases pass.
- **Real Chromium** against the dev server, prior page `/about` then the invite URL then Back. The fixed build returns to `/about` in 10 of 10 cases, with 0 console errors and 0 page errors. An unfixed `main` control never returns to `/about`, in 8 of 8 cases. A cold arrival lands at `history.state.idx=0`, and Back leaves the site.
- **Full vitest suite:** 1044 files, 13,637 tests passed, 0 failed.

## Acceptance Criteria

- [x] From a prior page, opening `/hiring?referrer=x` then pressing Back returns to the prior page (same for `/coach`, `/founder`, `/builders`, and for `?login=1`). Covered by the canary and the real-browser probe; `/` is covered too.
- [x] `?referrer` still wins over `?login`; empty values still do not redirect. Covered by the canary and by the existing p1674 and p1671 suites, which still pass.
- [x] `landing_page_viewed` still fires once with `referrer` before the redirect on all four pages. The canary asserts exactly one view, with its referrer and variant, already tracked when the target mounts, and no second view after Back. That the view comes before the redirect is effect declaration order in each page's source; the test cannot separate the two.
- [x] Regression test passes: `src/tests/p1680-invite-redirect-history.test.tsx`
- [x] No console errors during the redirect. The real-browser probe saw 0 console errors and 0 page errors across 10 cases.
