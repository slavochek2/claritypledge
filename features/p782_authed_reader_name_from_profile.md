---
status: in-progress
type: bug
rank: 46880
severity: medium
workstream: letter
date_reported: '2026-04-21'
created_date: '2026-04-21'
tags:
  - letter-reading
  - auth
  - profile
delivery_stage: fix
pipeline_ran:
  - create-bug
  - fix
---

# P782: "For you" on public letter for authed readers — reads wrong object

## Summary

An authenticated non-sender opening a public one-to-many letter URL sees "For you" on the cover instead of "For {first-name}", despite P778 explicitly targeting this.

**Root cause:** `letter-reading-page.tsx` reads `currentUser.user_metadata?.name` but `useAuth()` returns a `Profile`, not a Supabase auth user. `Profile` has `name: string` at the top level — no `user_metadata`. At runtime: `currentUser.user_metadata` is `undefined` → `metaName` undefined → state stays at default `'you'`.

**Why tests passed:** `src/tests/p778-public-letter-authed-parity.test.tsx` mocked `currentUser` as `{ user_metadata: { name: ... } }` — the Supabase-auth-user shape, not the `Profile` shape. Tests validated the wrong mock of the wrong object.

## Affected Sites

Three sites in `letter-reading-page.tsx` share this bug:
- **Line ~210-211** — authed RLS path, fallback when `delivery.receiver_name` absent (pre-existing, predates P778)
- **Line ~273-274** — P778 authed-public path (surfaced the bug)
- **Line ~341-342** — token path, fallback when `delivery.receiver_name` absent (pre-existing)

## Acceptance Criteria

- [ ] Opening a public one-to-many letter as authenticated non-sender shows "For {first-name}"
- [ ] All three `letter-reading-page.tsx` sites read from `currentUser.name` (not `user_metadata`)
- [ ] `p778-public-letter-authed-parity.test.tsx` mock updated to `Profile` shape
- [ ] New canary unit test fails without fix, passes with fix
- [ ] E2e reproduce spec passes (authed reader name shown correctly)
- [ ] Sender preview still shows "This is your letter" (no regression)
- [ ] Anon flow still shows "For you" (no regression)
- [ ] Token/email flow shows receiver name (no regression)

## Out of Scope

- TypeScript investigation: why `tsc` didn't flag `currentUser.user_metadata` as missing on `Profile`
- Rename `currentUser` → `currentProfile` (~50 sites)
- Extract `firstNameFromProfile()` shared util
