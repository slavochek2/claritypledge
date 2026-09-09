---
status: backlog
type: bug
disclosure: public
rank: 300
severity: medium
workstream: social
date_reported: '2026-09-09'
created_date: '2026-09-09'
tags: [avatar, pledge-ring, gravatar-avatar, session-history, data-layer]
---

# P1289: Session History avatars show initials with no photo and no pledge ring

## Summary

Every row on `/sessions` (Session History) renders a **letters-only** avatar — never the
person's photo — and never shows the pledge ring, even for a pledger with a photo set.
The same person's photo and ring render correctly in the header and on their profile page
on the same screen, which is what makes the list look broken rather than merely plain.

Founder, 2026-09-09, looking at `/sessions` while logged in:

> *"it says VL, but obviously it's me, so... it doesn't render the picture, it doesn't
> render the circle around it ... It doesn't do it well at all."*

## Not P1112 — a third call site P1112 never covered

P1112 (shipped 2026-09-09) fixed `avatarColor` at `ClaritySessions.tsx` and
`profile-page-v2.tsx`. Verified in-browser the same day: header avatar and profile avatar
both render the photo **and** the ring correctly. Session History is a **different
component** on a different data path, and P1112 did not touch it.

## Root Cause — three layers, not a missing prop

**1. The call site passes almost nothing.** `src/app/components/sessions/session-list.tsx:115`:

```tsx
<GravatarAvatar name={session.partnerName} size="sm" isPledger={false} />
```

`GravatarAvatar` accepts `photoUrl` (documented in its props as *"Direct photo URL (e.g.
from Google OAuth)"*) and `avatarColor`, and takes `isPledger` to decide the ring
(`src/components/ui/gravatar-avatar.tsx`). This call site passes **no `photoUrl`**, **no
`avatarColor`**, and **hardcodes `isPledger={false}`** — so initials-with-default-colour and
no ring is exactly what the component was asked for. Compare the correct shape at
`ClaritySessions.tsx:107-114`, which passes `photoUrl={user.avatarUrl ?? undefined}`,
`avatarColor={user.avatarColor}` and `isPledger={user.hasPledged}`.

**2. The type carries no avatar fields.** `SessionSummary`
(`src/app/data/sessions-service.ts:12-20`) has `id`, `partnerName`, `roundCount`, `date`,
`sessionHistory`, `isPrivate`, `transcriptStatus`. No avatar URL, colour, or pledge flag.

**3. The query never asks for them.** `sessions-service.ts:67` selects
`id, creator_profile_id, joiner_profile_id, creator_name, joiner_name, created_at,
is_private, live_state, transcription_jobs(status, created_at)`. The partner's avatar and
pledge state are simply not fetched, so no amount of prop-passing fixes this alone.

**This is why it is not a one-liner** and why it was deliberately not folded into P1112:
the fix needs a profile join (or a second fetch) plus a type change, which is a different
size and blast radius from adding a prop that already had its data in hand.

## Acceptance Criteria

- [ ] A partner who has a photo set renders that photo in the Session History row, not initials
- [ ] A partner with no photo still renders initials, in **their** `avatarColor`, not the `#0044CC` default
- [ ] A partner who has pledged renders the pledge ring; a non-pledger does not
- [ ] `isPledger` is bound to live data at this call site — a hardcoded literal fails review
- [ ] The query change fetches avatar/pledge data without an N+1 per row (join or single batched fetch)
- [ ] A regression test pins all three props at this call site, in the shape of `src/tests/p1112-avatar-colour-call-sites.test.tsx` (which asserts `avatarColor=` is bound to an **expression**, not any literal — codex review of that canary caught the weaker form)
- [ ] Verified in a real browser at `/sessions` while signed in — a unit test alone does not close this, since the defect is visible-only

## Notes

- **Do not process yet.** Founder, 2026-09-09: *"the sesison list bug yes file but lets not
  process it now - drop it"*. Filed for the record at `backlog`.
- Same bug **class** as P1109 and P1112 (props dropped at a `GravatarAvatar` boundary), but
  the first instance where the underlying **data is not fetched at all**. Worth checking
  whether other list surfaces share the pattern before fixing just this one.
- `GravatarAvatar` makes every one of these props optional except `name` and `isPledger`,
  so a call site that forgets them is silently accepted. A follow-up worth considering:
  make the component harder to under-call, rather than fixing call sites one at a time —
  this is now the third.
