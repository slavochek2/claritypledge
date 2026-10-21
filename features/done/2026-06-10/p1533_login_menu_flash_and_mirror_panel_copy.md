---
status: all-done
type: bug
rank: 53
severity: low
workstream: clarity-chat
date_reported: 2026-10-21
created_date: 2026-10-21
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [auth, navigation, mirror, copy]
disclosure: public
pipeline_ran: [create-bug, fix]
completed_at: 2026-10-21
---

# P1533: Old top menu flashes during login; Mira's panel copy and menu entry

## Summary

During login the page briefly shows the old public top menu (Feed / Letters / Groups) before the signed-in side menu. Founder, trying it on localhost: "when I log in, for a brief moment it loads top menu and not the side menu". Second item, from trying P1520: Mira's panel is reachable only by tapping her name, and two lines of its copy needed founder decisions.

## Root Cause

`/auth/callback` was hard-wired to `ClarityLandingLayout surface="public"`, which renders the public top menu. P1512's first-paint fix picks the signed-in shell from the stored session, but mid-login no session is stored yet, so it cannot apply on this route.

## Reproduction Steps

1. Signed out, on `localhost:5001`, log in.
2. Land on `/auth/callback?source=login`.
3. Observe: the public top menu (Feed, Letters, Groups) shows over the loading mark until the redirect.

**Reproduction rate:** 100% on login.

## Expected Behavior

- The login page shows the logo only, then the signed-in shell.
- Founder decisions (2026-10-21): Mira's three-dots menu has "About Mira", opening her panel; the panel subtitle reads "Your mirror · Only you see this chat."; the hint "Used the next time it gets a new face." is removed; the word stays "face".

## Actual Behavior

The public top menu flashes during login. The panel's subtitle read "Only you can see and talk to it.", it carried the redundant hint, and the menu had no way into the panel.

## Affected Files

- `src/App.tsx` — the `/auth/callback` route
- `src/app/pages/chat/ConversationHeader.tsx` — the mirror's menu
- `src/app/pages/chat/MirrorInfoDialog.tsx` — the panel copy

## Severity

**Low** — a brief visual flash and copy; nothing is lost or blocked.

## Fix Approach

Give `/auth/callback` the logo-only header (`logoOnly`, as `/intro` has). Add the menu item and apply the copy decisions.

## Acceptance Criteria

- [x] Logging in shows only the logo on the callback page, never Feed / Letters / Groups (`src/tests/p1533-auth-callback-no-public-nav.test.ts`; browser check on `localhost:5800/auth/callback?source=login`: logo only).
- [x] Mira's three-dots menu has "About Mira", which opens her panel; other chats have no such item (`src/tests/p1533-mirror-menu-copy.test.tsx`).
- [x] The panel reads "Your mirror · Only you see this chat." and has no "Used the next time…" line (same test).
