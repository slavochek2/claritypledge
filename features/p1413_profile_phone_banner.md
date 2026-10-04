---
status: qa
type: story
rank: 24
workstream: profiles
created_date: '2026-10-04'
tags: [profiles, banner, mobile]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1413: Profile pages get a phone banner, like events (P1354)

## Problem

> Founder, verbatim: "make sure on profiles we have banners for mobile phones and big for desktop ... we improve this for event pages - maybe we reuse same pattern? and for my page generate both"
> And: "i want to upload it to my clarity page (claritypledge.com/p/slava) ... its smaller so maybe we need to regenerate?"

**Situation:** The profile banner (`profile-page-v2.tsx`, `BannerDisplay`, `h-[120px] md:h-[160px]`) is one image, `object-cover`. The desktop slot is about 640×160 (4:1); the phone slot about 343×120 (~2.9:1). Events already carry an optional phone image (`events.banner_mobile_url`, P1354) and `BannerDisplay` already takes `mobileBannerUrl`.
**Complication:** One designed image cannot fit both slots: text composed for one shape gets cut in the other. Profiles have only `banner_url`.
**Question:** Give profiles the same optional phone banner, and set the founder's two banners.

## Appetite

Blast radius: one page (profile) plus the profiles read path. Reversibility: additive nullable column; revert = stop reading it. Decision density: zero (founder chose "reuse the same pattern").

## Solution

- Add nullable `profiles.banner_mobile_url`, hand-set and read-only in the UI, same as events (P1354). No upload or regenerate controls for it.
- Expose it through whatever the profile page reads (the profile RPC / column grants: P877, P886, P1104, P1259 own those), map to `bannerMobileUrl`, pass `mobileBannerUrl` to `BannerDisplay` on the profile page.
- Removing the desktop banner drops the phone one too (already `BannerDisplay` behaviour).
- Founder's profile: desktop art at 4:1 (2560×640) and phone art at ~2.85:1 (1372×480), Communication Activism design, served from `public/banners/` (deployed with the site) and set on the `slava` profile.

## Invariants

- One `<img>` mounted per viewport via `matchMedia`, never `<picture>` (decisions.md 2026-09-22, P1354).
- `banner_mobile_url` must not widen what anon can read beyond a public image URL; follow the existing profiles column-grant pattern (P877).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| New column missing from the profile read RPC, so it silently never shows | MITIGATE | Test asserts the page receives it |
| Phone art goes stale when the founder regenerates the desktop banner | ACCEPT | Hand-set field; same trade-off as events |

**Non-Goals:** Do NOT change the slot heights. Do NOT add upload/AI-generation for the phone banner. Do NOT touch event pages.

## Acceptance Criteria

- [x] A profile with both banners shows the phone image under 768px and the desktop image at 768px and up, one image requested per viewport.
- [x] A profile with only `banner_url` looks exactly as today.
- [x] claritypledge.com/p/slava shows the Communication Activism banner whole (title and tagline not cut) at 320, 375 and 1280px — verified locally against the test DB by the founder ("yes approved", 2026-10-04). `[post-deploy]` re-check on prod once the migration and the banner row update land.

## Related

- P1354 (event phone banner), P510 (profile banner UX), P504 (profile banners).
