---
status: all-done
type: bug
rank: 1000794
severity: high
workstream: live
date_reported: '2026-04-23'
created_date: '2026-04-23'
tags: [live, drawer, scroll, layout]
pipeline_ran: [fix]
completed_at: 2026-04-23
---

# P794: /live rating drawer scroll-behind + card width + Chrome compaction

## Problem

In `/live`, when the partner receives a rating request, a bottom drawer opens. Three defects:

1. **First-screen scroll lock (critical):** partner cannot scroll behind the drawer on the first rating. The `IdleScreen` drawer at line 1488 is missing `modal={false}` — Vaul's default `modal=true` installs a body-scroll lock. The other 3 drawer sites were fixed; site 1 was missed.
2. **Last item hidden under drawer:** on all screens, the last content item stays under the drawer at max scroll. `CONTENT_LAYOUT` has no bottom-padding compensation for drawer height (same fix P777 applied to letter reading).
3. **Card sizing:** story card capped at `max-w-sm` (384px); letter reading uses `max-w-2xl` (672px). Journey card similarly narrow.

## Appetite

2–3 surgical changes in one file (`live-mode-view.tsx`) + canary test. No new components or DB migrations.

## Solution

- Align `IdleScreen` drawer (line ~1488) to peer pattern: add `modal={false} dismissible={false}`, normalize `DrawerHeader` to `sr-only`, remove `onOpenChange` fallback-dismiss.
- Add `pb-[calc(env(safe-area-inset-bottom)+280px)]` to `CONTENT_LAYOUT`; widen to `max-w-2xl`.
- Extract `DRAWER_CONTENT_WRAPPER`, `STORY_CARD_LAYOUT`, `JOURNEY_LAYOUT` constants; replace 26 inline literals.
- Canary test: source-code assertions that prevent regression of all 4 sites.

See architect plan at `~/.claude/plans/create-a-plan-here-curried-platypus.md` for verbatim before/after blocks.

## Risks / Non-Goals

- **Not** migrating /live drawers to `<FixedBottomBar>` — separate architectural decision. Follow-up recommended after this lands.
- **Not** touching `ComprehensionRatingCard`, `drawer.tsx`, or `fixed-bottom-bar.tsx`.
- `CONTENT_LAYOUT_CENTERED` kept at `max-w-lg` — idle/pre-session screens must not widen.
- 280px padding: calibrated for worst-case dual-button drawer (Submit + Skip + Back).

## Acceptance Criteria

- [x] Partner can scroll freely behind the rating drawer on the first /live rating (IdleScreen) — manual UAT ✓
- [x] At max scroll, last content item is visible above the drawer (all screens) — manual UAT ✓
- [x] Story card and journey card match letter reading width (`max-w-2xl`) — canary verified
- [x] Drawer chrome is compact across all 4 drawer sites — canary verified (DRAWER_CONTENT_WRAPPER)
- [x] CONTENT_LAYOUT_CENTERED unchanged (idle screens look identical) — canary verified
- [x] Decline path works: "Decline" button closes drawer, /live continues — manual UAT ✓
- [x] Canary test passes green (7/7) — ✓ (extended to cover free-mode-view + free-mode-success)

## Done-When

- Canary terminal output (passing, 6/6)
- Screenshot: first-rating drawer scrolled to max with last content item above drawer
- Screenshot: story card at new width
- Screenshot: idle screen (CONTENT_LAYOUT_CENTERED unchanged)
- Decline path manually verified
