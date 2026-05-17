---
status: qa
type: story
rank: 1000769.0
workstream: events
created_date: '2026-05-17'
tags: [events, rsvp, ux, conversion]
delivery_stage: verify
flow: dev
pipeline_plan: [create-spec, ux, dev, verify]
pipeline_ran: [create-spec, ux, dev, verify]
pipeline_skipped: [challenge-prd -- no untested premises, all decisions settled in conversation; architect -- no structural/data/API change, 2 files only; ui -- no new components, existing primitives; generate-tests -- no business logic, route matcher inline test in dev; decompose -- 2 files; spec-review -- spec just written; spec-compact -- under 200 lines]
---

# P844: Event Detail Page — Reduce RSVP Friction

## Problem

**Situation:** The event detail page (`/events/:slug`) displays the RSVP button inline at the bottom of the description column, below long-form markdown content. The button label is `"Sign up to join"` for logged-out visitors and `"I'm going"` for logged-in non-attendees. The header shows a competing primary CTA `"Start a Clarity Session"` on every page. The right column shows a `"+ Open a room"` card that logged-out users cannot use.

**Complication:** Visitors miss the RSVP button — it requires scrolling past the entire description, and the label `"Sign up to join"` reads like account creation rather than a single-step RSVP, signalling unwanted friction. Two blue primary CTAs (header + RSVP) compete for the same attention. The "Open a room" card occupies prime right-column real estate for users who can't act on it.

**Question:** How do we make RSVP the unambiguous primary action on event detail pages without changing the RSVP backend flow or auth model?

## Appetite

Low blast radius — changes are scoped to `EventDetail.tsx`, the global navigation header's route-awareness, and a conditional render on the Practice Rooms card. No data model, no API, no auth changes. Fully reversible (each of the four changes is independently removable). Low decision density — labels and layout calls are settled in conversation; no open product questions.

## Solution

Four UI-only changes targeting visibility, label clarity, and competing-CTA suppression:

1. **Rename the RSVP button.** Replace both `"Sign up to join"` (logged-out) and `"I'm going"` (logged-in, not RSVP'd) with **`"Reserve a seat"`**. Leave the green `"You're going! / See you there"` confirmation card, `"Event Ended"`, and `"Event Full"` disabled states unchanged.

2. **Make the RSVP button discoverable.**
   - **Mobile (<lg breakpoint):** Pin the RSVP button as a sticky bottom bar that sits above the existing BottomNav. Show the button in all non-RSVP'd states (logged-out, logged-in not RSVP'd, full, ended — with appropriate label/disabled state). Hide the sticky bar when RSVP'd (the green confirmation card inline is sufficient) and when viewer is the host or event is cancelled.
   - **Desktop (lg+):** Move the RSVP block from the bottom of the description column to the **top of the description column** — after the date/location/calendar row and before the markdown description. RSVP sits in the natural reading flow (title → date → location → CTA → description), above the fold, with no card wrapper. The right sidebar stays Organizer → Participants → Practice Rooms.

3. **Hide the header CTA on event detail pages only.** In `simple-navigation.tsx`, the `"Start a Clarity Session"` button should be hidden when `location.pathname` matches `/events/:slug` (i.e., `startsWith("/events/")` AND is not exactly `/events` or `/events/list`). The `/events` list page keeps the header CTA — only the detail page hides it.

4. **Hide the Practice Rooms card for logged-out visitors.** The `"Clarity Practice Rooms / + Open a room"` card in the right column should render only when `isLoggedIn` is true. Logged-out visitors see the right column with Organizer + Participants only.

## Risks / Non-Goals

### Risks
- **Sticky mobile bar overlaps content.** Mitigation: bottom padding on the main content container equal to the sticky bar height, matching the existing BottomNav pattern.
- **Desktop RSVP card hierarchy.** Moving RSVP above Organizer may visually de-emphasise the host. Mitigation: keep card compact and let the Organizer card retain its existing visual weight directly below.
- **Route-aware nav regressions.** Adding pathname conditionals in `simple-navigation.tsx` may affect other surfaces if the matcher is too broad. Mitigation: matcher is `pathname.startsWith("/events/") && pathname !== "/events"` — narrow and explicit.

### Non-Goals
- Do NOT change the RSVP backend flow, `handleRsvp` logic, or the `/signup?redirect=...&action=rsvp` redirect for logged-out users.
- Do NOT introduce email-only RSVP or any auth-flow change.
- Do NOT add `maxAttendees` scarcity framing ("X seats left").
- Do NOT change the confirmation page or post-RSVP green card copy.
- Do NOT add "Add to calendar" or share buttons in this spec (separate consideration).
- Do NOT change the `/events` list page header, layout, or CTAs.
- Do NOT touch other event-related pages (`/events/new`, `/events/:slug/confirm`, `/events/:slug/edit`).
- Do NOT refactor the events prototype directory structure or move files out of `src/app/prototypes/events/`.

## Done-When

- [x] Logged-out visitor on `/events/:slug` sees `"Reserve a seat"` (not `"Sign up to join"`) as the RSVP button label.
- [x] Logged-in non-attendee on `/events/:slug` sees `"Reserve a seat"` (not `"I'm going"`) as the RSVP button label.
- [x] RSVP'd users still see the green `"You're going! / See you there"` confirmation card unchanged.
- [x] On mobile (<lg), the RSVP button is visible as a sticky bottom bar without scrolling, on every state where the button would otherwise show.
- [x] On desktop (lg+), the RSVP button appears above the fold in the description column, between Add to Calendar and the markdown description. No duplicate RSVP block remains at the bottom of the description column on desktop.
- [x] The `"Start a Clarity Session"` header CTA is not visible on `/events/:slug` routes (verified across `/events/ai-run-1` and any other event detail URL).
- [x] The `"Start a Clarity Session"` header CTA IS visible on `/events` list page (no regression).
- [x] The Practice Rooms card (`"Clarity Practice Rooms / + Open a room"`) is not rendered for logged-out visitors on `/events/:slug`.
- [x] The Practice Rooms card IS rendered for logged-in users on `/events/:slug` (no regression).
- [x] Mobile content does not visually overlap the sticky RSVP bar (sufficient bottom padding).
- [x] All existing event tests still pass.
- [x] Visual regression: host view of event detail page is unchanged (no RSVP button for host, no sticky bar for host).

## UX Notes

**States covered by the sticky mobile RSVP bar:**
- Logged-out → "Reserve a seat" (blue, primary)
- Logged-in, not RSVP'd → "Reserve a seat" (blue, primary)
- Event full + not RSVP'd → "Event Full" (disabled)
- Event ended → "Event Ended" (disabled)

**States that hide the sticky mobile RSVP bar:**
- Viewer is the host (no RSVP for own event)
- Event is cancelled
- Viewer has already RSVP'd (the inline green confirmation card in the right column / above-fold position handles this state)

**Desktop right-column order (top → bottom):** RSVP card → Organizer card → Participants card → Practice Rooms card (only if logged in).

**Empty-state behavior:** Practice Rooms hidden for logged-out users — there is no fallback message or login prompt in its place. The column just renders fewer cards.

## UX Design

### User Flows

**Flow A — Logged-out visitor discovers and reserves (mobile)**
1. Lands on `/events/:slug` (from share link, `/events` list, social, or direct URL).
2. Sees banner → title → date → location → organizer → description, scrolling vertically.
3. **From the first frame:** "Reserve a seat" sticky bar is visible at viewport bottom, above BottomNav. No scrolling required to discover RSVP.
4. Top header shows ClarityPledge logo + tab nav only — **no** "Start a Clarity Session" CTA competing.
5. User taps "Reserve a seat" in the sticky bar.
6. Redirected to `/signup?redirect=/events/:slug&action=rsvp` (existing flow, unchanged).
7. Completes signup → returns to event → auto-RSVP'd → `/events/:slug/confirm`.

**Flow B — Logged-out visitor discovers and reserves (desktop)**
1. Lands on `/events/:slug`.
2. Two-column layout: description left, sidebar right.
3. **Above the fold in right column (position 1):** "Reserve a seat" card. Below it: Organizer card → Participants card.
4. **No** Practice Rooms card (logged-out).
5. **No** "Start a Clarity Session" header CTA.
6. User clicks "Reserve a seat" → same auth redirect flow as A.

**Flow C — Logged-in non-attendee reserves**
1. Same as A/B but no auth redirect — clicking "Reserve a seat" calls `handleRsvp` directly.
2. Button shows "Joining..." disabled state during in-flight request.
3. On success: navigates to `/events/:slug/confirm` (existing flow, unchanged).
4. On failure: existing error toast `Couldn't sign you up. The event may be full or no longer available.` Sticky bar remains visible.

**Flow D — Logged-in already-RSVP'd**
1. No sticky mobile bar. The green "You're going! / See you there" confirmation card appears in the right-column position-1 slot (mobile: between description and Organizer; desktop: top of right column).
2. Cancel-RSVP ghost button ("Can't make it") visible inside the green card (unchanged).
3. Practice Rooms card visible (logged-in).

**Flow E — Host views own event**
1. No RSVP affordance anywhere (sticky bar hidden, right-column RSVP card hidden — existing `!isHost` gate).
2. Right-column position 1 is the Organizer card (unchanged from current).
3. Header CTA still hidden on `/events/:slug` (host is still on a detail page).

**Flow F — Past event or full event (visitor not RSVP'd)**
1. Sticky mobile bar present but disabled: "Event Ended" or "Event Full".
2. Desktop right-column card shows the same disabled state in position 1.
3. Reason: maintain spatial consistency across states; users learn where the action lives regardless of whether they can take it.

**Flow G — Cancelled event**
1. No RSVP affordance anywhere (sticky bar hidden, right-column RSVP card hidden — existing `!isCancelled` gate).
2. Existing cancelled-event banner remains the dominant signal.

### Screen Designs

**Mobile (<lg, 320–1023px) — event detail page**

```
┌────────────────────────────────┐
│ Logo · Home Letters Events Me  │ ← header (NO "Start a Session" CTA)
├────────────────────────────────┤
│ [banner image]                 │
│ Event Title                    │
│ Date · Time                    │
│ Location                       │
│ ─── description markdown ───   │
│ Organizer card                 │
│ Participants card              │
│ Practice Rooms card *          │  * only if isLoggedIn
│                                │
│                                │ ← extra bottom padding clears sticky bar
├────────────────────────────────┤
│  [ Reserve a seat ]            │ ← sticky bar (fixed, above BottomNav)
├────────────────────────────────┤
│  Home · Letters · Events · Me  │ ← BottomNav (fixed, existing)
└────────────────────────────────┘
```

When RSVP'd: sticky bar disappears, green confirmation card replaces the inline RSVP position (the existing inline location stays — see "Mobile RSVP'd state" below).

**Desktop (lg+, ≥1024px) — event detail page**

```
┌──────────────────────────────────────────────────────────┐
│ Logo · Home · Letters · Events · My Profile              │ ← NO "Start a Session" CTA
├──────────────────────────────────────────────────────────┤
│ [banner image, full width]                               │
├──────────────────────────────────────────────────────────┤
│  ┌── description column ──┐  ┌── sidebar (lg:w-96) ──┐   │
│  │ Title                  │  │ [ Reserve a seat ]    │ ← position 1
│  │ Date · Location        │  │  card (NEW)           │   │
│  │                        │  ├───────────────────────┤   │
│  │ markdown description   │  │ Event Organizer       │   │
│  │ …                      │  │ (avatar + name)       │   │
│  │                        │  ├───────────────────────┤   │
│  │ (NO inline RSVP here)  │  │ Participants (N)      │   │
│  │                        │  │ • person              │   │
│  │                        │  │ • person              │   │
│  │                        │  ├───────────────────────┤   │
│  │                        │  │ Practice Rooms *      │   │
│  │                        │  │ + Open a room         │   │  * only if isLoggedIn
│  └────────────────────────┘  └───────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### UI States (per screen — sticky bar and right-column RSVP card are novel patterns)

**Sticky mobile bar — "Reserve a seat" (default state, logged-out or logged-in non-attendee)**
- Position: fixed bottom, full viewport width, layered above main content but below any modal/dialog overlay.
- Z-index: above BottomNav so it doesn't visually clip; bottom offset = BottomNav height.
- Background: solid surface (white/card) with a subtle top shadow or 1px top border to separate from scrolling content.
- Height: compact, ~64px (sufficient for touch target + breathing room).
- Inner: single full-width primary blue button, centered label.
- Recovery: tapping outside doesn't dismiss — bar is persistent across scroll.
- Main content gets bottom padding equal to (sticky bar height + BottomNav height) so the last content row isn't covered.

**Sticky mobile bar — "Joining..." (loading)**
- Same chrome, button shows existing "Joining..." text + disabled state.
- Reason: prevents double-tap on slow connections; reuses existing `isActionLoading` flag.

**Sticky mobile bar — "Event Full" / "Event Ended" (disabled)**
- Same position, same height, button gets disabled styling (existing `disabled` Button variant).
- Reason: spatial consistency — users always find the RSVP slot in the same place, even when they can't act.

**Sticky mobile bar — hidden states**
- RSVP'd: hidden (green inline card handles this — see "Mobile RSVP'd state" below).
- Host viewing own event: hidden.
- Event cancelled: hidden.

**Mobile RSVP'd state — inline green card placement**
- The existing green "You're going!" card already renders inline in the description column. Keep this placement; do NOT pin it to bottom.
- Reason: once committed, the user doesn't need a persistent CTA. A scrollable confirmation card is sufficient and frees screen real estate.

**Desktop right-column RSVP card — default**
- Compact card matching Organizer/Participants visual weight (single padded container, rounded corners, light border).
- Contains: the same primary blue full-width button or disabled-state button.
- Position: first card in right column, immediately under banner row, above Organizer card.
- Reason for position above Organizer: RSVP is the primary action; Organizer is supporting context. The Organizer card retains its existing visual weight directly below — no demotion.

**Desktop right-column RSVP card — RSVP'd state**
- Card content replaced with the green "You're going! / See you there" confirmation (same component as today, just relocated from inline-bottom-of-description to top-of-right-column).
- "Can't make it" ghost button visible inside the card (unchanged).

**Header CTA visibility (route-aware)**
- `pathname` matches `/events/:slug` (single segment after `/events/`, slug is not `new` or `list`) → hide "Start a Clarity Session" CTA.
- `pathname === "/events"` (list) → show CTA.
- `pathname === "/events/new"` (create) → show CTA.
- `pathname === "/events/list"` (alias) → show CTA.
- `pathname === "/events/:slug/confirm"` (post-RSVP) → **show** CTA (user just RSVP'd, suggesting another action is on-context).
- `pathname === "/events/:slug/edit"` (host) → show CTA.
- Rationale: hide only on the page where the primary action is RSVP. Everywhere else under `/events/`, the header CTA doesn't compete.

**Practice Rooms card visibility**
- Logged-out: card not rendered at all (not greyed out, not "sign in to open" — just absent).
- Logged-in: card rendered as today (heading + "+ Open a room" button + empty-state line or room list).

### Edge Cases

**Slow network — sticky bar tap → "Joining..." then success/failure**
- Loading state on the sticky bar prevents double-tap.
- On success: page navigates to `/events/:slug/confirm`. Sticky bar unmounts cleanly with the route change.
- On failure: existing error toast appears at standard toast position; sticky bar returns to "Reserve a seat" enabled state — user can retry.

**Visitor scrolls during in-flight RSVP**
- Sticky bar stays visible (it's fixed); user sees "Joining..." disabled state regardless of scroll.

**Viewport rotation (mobile portrait ↔ landscape)**
- Sticky bar reflows to new width, height stays compact, button stays full-width.

**Breakpoint crossing (mobile → desktop via window resize on responsive tester)**
- At lg breakpoint: sticky bar unmounts, right-column RSVP card mounts. No layout flash — both states render their own content via Tailwind responsive utilities.

**User scrolls past description footer**
- Bottom padding ensures the last content line ("The run is the run.") clears the sticky bar. No content hidden behind the bar.

**Long event title or description**
- Sticky bar remains at the bottom regardless of content length. Right-column RSVP card stays at top of sidebar (does not stick-scroll — it just sits above the fold by virtue of being first in the column).

### Accessibility

**Sticky mobile bar**
- Container: `<div role="region" aria-label="Event registration">`.
- Button: standard `<button>` with the action label as accessible name. No additional aria needed.
- Disabled state: `aria-disabled="true"` plus visual styling. Screen reader announces "Event Full, button, dimmed" or similar.
- Tab order: sticky bar is part of the natural tab sequence (after main content, before BottomNav). Pressing Tab from the last description link should focus the bar's button.
- Touch target: button height ≥ 48px (above the 40px minimum — sticky bars get extra room because they're frequent-tap targets).

**Desktop RSVP card**
- Standard button accessibility (existing `Button` component handles).
- Card is focusable via Tab to the inner button only — the card chrome isn't tab-stoppable.
- Focus ring visible on the button (existing design system focus styles).

**Color contrast**
- Primary blue button on white sticky bar: existing `bg-blue-500` text-white — already passes WCAG AA in the design system.
- Disabled button (existing component): passes 3:1 UI contrast.
- Green RSVP'd card: existing component, no change.

**Screen reader announcement on RSVP success**
- Existing `toast.error` and route navigation handle this. No new live region needed.

**Header CTA hide — no accessibility regression**
- Removing an element from the DOM (vs hiding via CSS) means screen readers don't announce it. This is the correct behavior — the CTA isn't relevant on event detail pages.

### Responsive Design

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | 320–767px | Single column, sticky bottom RSVP bar above BottomNav, bottom-padded main content |
| Tablet | 768–1023px | Same as mobile (still <lg in Tailwind) — single column, sticky bar |
| Desktop | ≥1024px (lg) | Two-column, RSVP card pinned to top of right column, no sticky bar |

**Breakpoint behavior at lg (1024px):**
- Sticky mobile bar: `lg:hidden`
- Inline-description RSVP block (for logged-out / not-RSVP'd): removed entirely on desktop; the right-column card replaces it. On mobile, also removed inline (sticky bar replaces it).
- Inline green RSVP'd card: kept inline in description column for mobile; replicated in right-column position 1 on desktop.
- Practice Rooms card: stacks below Participants on mobile; stacks below Participants in right column on desktop.

### Visual Context

**Density intent: Compact-efficient.** The user is in a decision-making mode — scanning event info and deciding whether to commit. Both the sticky bar and the desktop right-column RSVP card should be compact (one button, minimal chrome) so they don't dominate the page or distract from the description. Reason: the goal is conversion, not contemplation; the affordance must be present and obvious without overweighting.

**Visual reference: Luma's event page.** Luma pins the primary CTA to the bottom on mobile and places it as a compact card top-right above the fold on desktop. The right-column card here should match the visual weight of the existing Organizer and Participants cards — same rounded container, same padding scale, same border treatment. The sticky mobile bar should match the existing BottomNav surface treatment (solid background, top separator) so the two stacked fixed bars feel like one unified bottom system, not two competing chrome regions.

## Acceptance Criteria

- [x] Visitor lands on event detail page and sees an unambiguous "Reserve a seat" CTA without scrolling on both mobile and desktop.
- [x] No competing primary CTA visible in the header on event detail pages.
- [x] Logged-out users do not see a "+ Open a room" affordance they cannot use.
- [x] RSVP flow on click is unchanged (logged-out → /signup redirect → auto-RSVP → confirm page).
- [x] The change works across all event detail URLs, not just `ai-run-1`.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| RSVP button label | `Reserve a seat` | Logged-out visitor, event upcoming, not full |
| RSVP button label | `Reserve a seat` | Logged-in non-attendee, event upcoming, not full |
| RSVP'd confirmation heading | `You're going!` | Logged-in, already RSVP'd (UNCHANGED) |
| RSVP'd confirmation sub | `See you there` | Logged-in, already RSVP'd (UNCHANGED) |
| Cancel RSVP ghost button | `Can't make it` | Logged-in, already RSVP'd (UNCHANGED) |
| Disabled button | `Event Full` | Event at capacity, viewer not RSVP'd (UNCHANGED) |
| Disabled button | `Event Ended` | Event is past (UNCHANGED) |
| Button color | `bg-blue-500 hover:bg-blue-600` | Primary, follows design system blue=actions |
| Loading button label | `Joining...` | RSVP in-flight (UNCHANGED — already in code) |
| Error toast | `Couldn't sign you up. The event may be full or no longer available.` | RSVP failure (UNCHANGED) |
| Sticky bar position | Fixed bottom, above BottomNav | Mobile only (<lg breakpoint) |
| Sticky bar height | ~64px (compact, ≥48px touch target inside) | Mobile only |
| Sticky bar background | Solid surface with top border or shadow | Mobile only — separates from scrolling content |
| Sticky bar ARIA | `role="region"` with `aria-label="Event registration"` | Mobile sticky container |
| Main content bottom padding | sticky bar height + BottomNav height | Mobile only, when sticky bar is rendered |
| Desktop RSVP card placement | Right column, position 1 of N | Above Organizer card |
| Header CTA hide rule | Hide only on `/events/:slug` (single segment after `/events/`, not `new`/`list`). Show on `/events`, `/events/new`, `/events/list`, `/events/:slug/confirm`, `/events/:slug/edit`, and all non-event routes | `simple-navigation.tsx` — applies to all three CTA instances |
| Practice Rooms card render rule | `isLoggedIn === true` | `EventDetail.tsx` right column |

## Surfaces in Scope

**In scope:**
- `src/app/prototypes/events/components/EventDetail.tsx` — button labels, sticky-mobile layout, desktop right-column reordering, Practice Rooms gating.
- `src/app/components/layout/simple-navigation.tsx` — route-aware hiding of the `"Start a Clarity Session"` CTA on event detail pages (three instances at lines ~168, ~198, ~237).

**Out of scope:**
- `src/app/prototypes/events/components/RsvpConfirm.tsx` (confirmation page).
- `src/app/prototypes/events/components/EventsList.tsx`, `EventCard.tsx` (list page and cards).
- `src/app/prototypes/events/components/CreateEvent.tsx`, `EditEvent.tsx` (host flows).
- `eventsService` and any data-layer code.
- BottomNav component itself (only respect its presence for sticky bar offsetting).
