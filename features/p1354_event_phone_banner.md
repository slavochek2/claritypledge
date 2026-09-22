---
status: week
type: story
rank: 12
workstream: events
created_date: '2026-09-22'
tags: [events, banner, mobile]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1354: Event pages can show a separate phone-optimised banner

## Problem

**Situation:** An event page shows one banner image (`events.banner_url`) in a strip of fixed
height, 192px on phones and 256px from 768px up (`BannerDisplay`, `h-48 md:h-64`, `object-cover`).
The same file is cropped to a ~2:1 box on a 375px phone and to a ~7.5:1 box on a 1920px screen.

**Complication:** An image that has to survive both crops can only use the middle band of itself,
so on phones its content comes out small. The Clarity Night #2 banner (five faces, names and the
ikigai emblem, redrawn on 2026-09-22 for exactly this slot) shows faces at about 30px and surnames
at about 10px on a 375px phone. Phones are where most people open event links (shared in WhatsApp
and Facebook groups). Making the slot taller was tried and rejected: P1353 let the height follow
the width, and the founder turned it down because it pushes the event description below the fold.

> Founder, verbatim: *"yes for mobile the banner can be different and mobile optimized?"* then *"yes"*.
> On P1353: *"also the banner he put is too height! i dont thik we should paly with hight"*,
> *"otherwise the evnet description not visible"*.

**Question:** Let an event carry an optional second banner drawn for the phone slot, shown only
where that slot applies, without changing any height.

## Appetite

Blast radius: low to medium. One optional column on `events` and one change to a component shared
by events and profiles. Reversibility: high (additive nullable column; with it empty, every page
renders as today). Decision density: low; the founder decided the direction above.

## Invariants

- **The banner height does not change** on any page or at any width (founder, 2026-09-22; P1353
  rejected for this reason).
- **An event without a phone banner renders exactly as today**, byte-for-byte in the banner area.
- **Profile banners are unchanged.** `BannerDisplay` is shared by profiles and events
  (decisions.md, the P519 entry: "Banner components ... remain shared — used by profiles and events").
- **The phone image shows exactly where the 192px slot applies**: the switch point matches the
  height breakpoint (Tailwind `md`, 768px), so no width shows the phone image in the 256px slot or
  the desktop image in the 192px slot.

## Solution

- Add an optional `banner_mobile_url` to `events`, readable wherever `banner_url` is read today.
- `BannerDisplay` takes an optional phone image and renders a responsive image (`<picture>` with a
  source for widths under 768px), falling back to the existing `banner_url`. Same classes, same
  crop behaviour, same error fallback.
- `EventDetail` passes the phone image when the event has one.
- The phone image is set by hand for now (like the Clarity Night banners), hosted in our own
  `event-banners` storage in the same environment as the event.
- Then make the phone version of the Clarity Night #2 banner (drawn for the ~2:1 phone slot, e.g.
  two rows of faces) and set it on TEST for review.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The phone image fails to load | MITIGATE | Same `onError` fallback as today: gradient, never a broken image |
| Share cards (og:image) should show the phone art | ACCEPT | Share cards keep `banner_url`: previews are wide, and the desktop art is drawn wide |
| Hosts cannot upload a phone banner themselves | DEFER | Hand-set is enough for Clarity Nights; a host control waits for demand |
| Prod event goes live before this ships | ACCEPT | The current banner already works on phones (verified 320px and 375px), only smaller |

**Non-Goals**
- Do NOT change the banner height or aspect handling anywhere (P1353 is rejected).
- Do NOT add a phone banner to profiles, stories or points.
- Do NOT add generation or host upload UI for the phone banner.
- Do NOT change the AI banner generator.

## Acceptance Criteria

- [x] An event with a phone banner shows the phone image at 375px and 320px, and the regular banner at 768px, 1280px and 1920px, verified by screenshot at each width (`innerWidth` confirmed).
- [x] An event without a phone banner looks the same as before at 375px and 1280px.
- [x] A profile page banner looks the same as before.
- [x] If the phone image URL is broken, the phone shows the gradient fallback, not a broken-image icon.
- [ ] The Clarity Night #2 event on TEST has a phone banner whose faces and names are readable on a 375px phone, reviewed by the founder.

## Done-When

- [x] Migration adds the nullable column and applies cleanly on test.
- [x] A regression test covers: phone source present only when a phone URL is given; the switch width equals the height breakpoint; no phone URL renders the same markup as today.

## Pre-deploy Checklist

- [ ] Apply the migration on prod.
- [ ] Upload the Clarity Night #2 phone banner to prod `event-banners` storage and set it on the prod event (with the desktop banner and the ikigai description image, which also need prod copies).

## Related

- [p1353](archive/p1353_event_banner_crops_wide_images_on_desktop.md): banner height follows width; founder rejected on 2026-09-22 (this spec replaces its goal for phones).
- [p489](done/22_mar_26/p489_ai_generated_event_banners.md): AI-generated event banners.
- [p1352](p1352_event_description_images_from_own_storage.md): description images from our own storage (same storage rule).
