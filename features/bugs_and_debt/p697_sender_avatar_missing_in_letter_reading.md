---
id: p697
title: Sender avatar missing when recipient reads a letter
type: bug
status: in-progress
severity: medium
delivery_stage: fix
pipeline_ran: [fix]
date_reported: 2026-04-12
tags: []
rank: 1000697.0
created_date: 2026-04-12
---

# P697: Sender avatar missing when recipient reads a letter

## Bug Description

**Severity:** Medium — recipient sees only initials for sender; Google photo and pledge ring never appear
**Reported:** 2026-04-12

**Symptoms:**
- Recipient opens a letter via token URL (`/letter/:id?token=...`) or public URL
- Sender's Google profile picture is absent — only initials show
- Pledge ring (has_pledged indicator) also absent
- Letter preview page works correctly because the sender IS the current user (avatar comes from AuthContext)

**Root cause:** Both RPCs (`get_letter_for_reading`, `get_letter_for_public_reading`) join `profiles` for `sender_display_name` but omit `avatar_url`, `avatar_color`, and `has_pledged`. The authenticated path in `letters-service.ts` similarly only fetches `name` from profiles.

**Reproduction steps:**
1. User A sends a letter to User B
2. User B opens the letter URL
3. Observe: sender avatar shows initials only, no photo, no pledge ring

**Affected users:** All letter recipients

---

## Solution

4 files — data-flow gap only, no component changes:

1. **Migration** — add `sender_avatar_url`, `sender_avatar_color`, `sender_has_pledged` to both RPCs
2. **Type** (`src/app/types/index.ts`) — add 3 optional fields to `ClarityLetter`
3. **Service** (`src/app/data/letters-service.ts`) — fetch `avatar_url, avatar_color, has_pledged` in authenticated path
4. **Page** (`src/app/pages/letter-reading-page.tsx`) — wire fields into `senderProfileOwner` (2 locations)

## Done-When

- [ ] Migration applied to test DB without error
- [ ] TypeScript compiles clean (`tsc --noEmit`)
- [ ] Tests pass without regressions
- [ ] Regression test fails before fix, passes after
- [ ] Browser: recipient sees sender Google photo + pledge ring
