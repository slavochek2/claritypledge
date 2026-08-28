---
status: backlog
type: bug
rank: 221
severity: low
workstream: social
date_reported: '2026-08-19'
created_date: '2026-08-19'
tags: [avatar, pledge-ring, gravatar-avatar, props-drilling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1112: Avatar colour dropped at two more `GravatarAvatar` call sites (session list, profile identity row)

## Summary

`ClaritySessions.tsx:104` and `profile-page-v2.tsx:1745` both wire `isPledger` correctly from live data but never pass `avatarColor`, so the person's avatar falls back to the component default (`#0044CC`) instead of their real colour — the same bug class as P1109, at different files.

## Root Cause

`GravatarAvatar`'s `avatarColor` prop is optional and defaults to `#0044CC` when omitted (`src/components/ui/gravatar-avatar.tsx:69`). Two call sites pass a real, dynamic `isPledger` value (so the pledge ring itself renders correctly) but never pass `avatarColor`, even though the surrounding data already carries an avatar colour field:

- `src/app/components/social/ClaritySessions.tsx:104` — `isPledger={user.hasPledged}`, no `avatarColor`.
- `src/app/pages/profile-page-v2.tsx:1745` — `isPledger={profileOwner.hasPledged}`, no `avatarColor` — same "quote pattern" Avatar → Name → Ear → Badge row structure as the P1109 identity row.

Found during P1109's code-review pass (`/fix p1109`) as a sibling instance of the same bug class, at files outside P1109's stated scope (`story-detail-identity-row` only). Per `.claude/rules/src.md` — Avatar Usage: "`GravatarAvatar` requires two props — always pass both" (`photoUrl`/`avatarColor` + `isPledger`).

## Reproduction Steps

1. Sign in as any user — call them the **viewer**.
2. Ensure a second user has `has_pledged: true` and a non-default `avatar_color`.
3. For `ClaritySessions.tsx:104`: navigate to wherever this component renders a session list including that second user, and look at their avatar.
4. For `profile-page-v2.tsx:1745`: navigate to a profile page where that second user's identity appears in the quote-pattern row.
5. Observe: the avatar shows the default blue (`#0044CC`) fill instead of the person's own avatar colour. The pledge ring (if applicable) renders correctly — only the colour is wrong.

**Reproduction rate:** 100% — the prop is simply never passed.

## Expected Behavior

Both avatars render with the person's own `avatarColor`, matching every other surface that renders them (feed cards, the now-fixed `StoryCardDetail.tsx` sites).

## Actual Behavior

Both avatars render with the component's default blue fill regardless of the person's actual avatar colour.

## Affected Files

- `src/app/components/social/ClaritySessions.tsx:104` — `GravatarAvatar` call missing `avatarColor` prop
- `src/app/pages/profile-page-v2.tsx:1745` — `GravatarAvatar` call missing `avatarColor` prop
- `src/components/ui/gravatar-avatar.tsx:69` — default fallback (`#0044CC`), for reference

## Severity

**Low** — cosmetic only. The pledge ring (the trust signal) already renders correctly at both sites; only the fill colour is wrong. No workaround needed, no blocked functionality, no false claim.

## Fix Approach

At each site, pass `avatarColor={<the person's avatarColor field>}` alongside the existing `isPledger` prop, matching the pattern already correct in `story-card-with-links.tsx` and the P1109-fixed `StoryCardDetail.tsx` sites. Verify the surrounding data object actually carries an `avatarColor`/`avatar_color` field before wiring it through — don't assume the type declares it if the fetch doesn't select it (see P697 in `docs/decisions.md:13255` for the fetch-layer version of this exact failure shape).

## Acceptance Criteria

- [ ] `ClaritySessions.tsx`'s session-list avatar shows the person's real avatar colour, not the default blue
- [ ] `profile-page-v2.tsx`'s identity row avatar shows the profile owner's real avatar colour, not the default blue
- [ ] The pledge ring continues to render correctly at both sites (regression check — this fix must not touch `isPledger`)
- [ ] No console errors during either flow
