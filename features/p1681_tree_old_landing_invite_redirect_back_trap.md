---
status: week
type: bug
rank: 337
severity: low
date_reported: 2026-11-13
created_date: 2026-11-13
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [navigation, landing, invite, history]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1681: DEV-only /tree/old-landing keeps the invite-redirect Back trap that P1680 fixed

## Summary

`src/app/pages/clarity-pledge-landing.tsx` still carries its own inline copy of the `?referrer=` / `?login=` redirect, pushing `/sign-pledge` or `/login` instead of replacing, so Back returns to the invite URL and the redirect fires again. Surfaced by P1680's surface audit and deferred there because the page is reachable only in development.

## Root Cause

`clarity-pledge-landing.tsx:39-47` calls `navigate("/sign-pledge")` / `navigate("/login")` without `{ replace: true }`, the same cause P1680 fixed in the shared `useInviteRedirects` hook. The page is routed only at `/tree/old-landing` behind `import.meta.env.DEV` (`src/app/tree/tree-routes.tsx:105`), so production visitors cannot reach it.

## Reproduction Steps

1. Run the dev server, open any page, then visit `/tree/old-landing?referrer=x` in the same tab.
2. Observe: lands on `/sign-pledge`.
3. Press Back.
4. Observe: Back does not return to the previous page (it lands on the invite URL, which redirects again).

**Reproduction rate:** expected 100% from the code (same mechanism P1680 reproduced); not run on this route.

## Expected Behavior

Back from `/sign-pledge` or `/login` returns to the page before the invite link, as on the production landings after P1680.

## Actual Behavior

Back returns to the invite URL and is redirected forward again.

## Affected Files

- `src/app/pages/clarity-pledge-landing.tsx:39-47` — inline redirect effect

## Severity

**Low** — development-only prototype route; no production visitor can reach it.

## Fix Approach

Replace the inline effect with `useInviteRedirects()` (called after the page's `landing_page_viewed` effect, as the other landings do), or delete the prototype if it is no longer used. Which one is a founder call.

## Acceptance Criteria

- [ ] From a prior page, opening `/tree/old-landing?referrer=x` (dev server) then pressing Back returns to the prior page; same for `?login=1`
- [ ] `?referrer` still wins over `?login`; empty values still do not redirect
