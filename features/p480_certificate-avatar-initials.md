---
status: today
type: story
rank: 3
tags:
  - agreements
  - ui
  - p472
flow: dev
created_date: 2026-03-06
---

# P480: Avatar/initials in agreement certificate signature area

## Problem

The `AgreementCertificate` component renders only plain text names in signature slots — no avatar or initials fallback. When a user signs up via OTP (no OAuth), their `avatar_url` is null and no visual identifier appears. The rest of the app uses `GravatarAvatar` which handles initials fallback.

## Acceptance Criteria

- [x] AC1: `SignatureSlot` in `agreement-certificate.tsx` renders a small avatar circle above or beside the name
- [x] AC2: When `avatarUrl` is available, show the image; when null, show initials via `GravatarAvatar` (or `getInitials()`)
- [x] AC3: Works for both creator and partner slots in active, pending, and celebration variants
- [x] AC4: No avatar shown in creation mode (signature row is hidden per P472 A1)

## Technical Notes

**Files to change:**
- `src/app/components/agreements/agreement-certificate.tsx` — add avatar props to `SignatureSlot`, import `GravatarAvatar`
- `src/app/pages/accept-agreement-page.tsx` — pass `creatorAvatarUrl` and `partnerAvatarUrl` from agreement data
- `src/app/pages/agreement-page.tsx` — same, pass avatar data to certificate

**Key constraint:** `AgreementCertificate` currently receives only string names (`creatorName`, `partnerName`). Need to add optional `creatorAvatarUrl?` and `partnerAvatarUrl?` props. The agreement object from the service already includes `creator.avatar_url` and `partner.avatar_url`.
