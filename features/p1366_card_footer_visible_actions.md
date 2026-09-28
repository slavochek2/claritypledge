---
status: week
type: story
rank: 14
workstream: product
created_date: '2026-09-28'
tags: [cards, feed, profile, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1366: Card footers show their actions — stories as a button, details in words, card menu in the corner

## Problem

**Situation:** Every point and story list card (feed, `/stake/:tag`, profile) ends in the footer P1296 unified: grey `N stories` / `N points` text with a chevron on the left, and on the right a share icon plus an external-link icon whose label ("Open point" / "Open story") exists only as a tooltip.

**Complication:** Founder feedback from users: people do not see the main action (that the stories open) and do not see that the card opens at all.

> Founder, verbatim: "people, for example, on points, they don't know the main action. So they don't see that they can open it."

The external-link icon also misleads: it implies leaving the site or a new tab; the control navigates in-app to the point or story page.

**Question:** What footer makes both actions visible on a phone, without competing with the page's primary CTA and without wrapping onto two lines?

## Appetite

Blast radius: medium — every list card on three surfaces, both card types; no data or schema change. Reversibility: high — presentational, git revert. Decision density: settled — the founder chose every visible rule below across a dozen prototype passes (`/tree/card-actions`, variant K, 2026-09-28).

## Solution

The approved reference is **variant K** in `src/app/pages/prototypes/card-actions-prototype.tsx` (branch `proto/card-actions`). Build to that render, on real data.

**Point card and story card, same layout:**
- **Top row:** a single **`⋯` menu in the top-right corner** (hint `More`) holding the card-level actions: `Share` on every card; `Edit` and a red `Delete` added on the viewer's own story card. Nothing else sits in the top row besides the card's existing content. Rule: top-right `⋯` = manage this card; bottom row = engage with it.
- **Bottom row, left:** a **solid blue expander button** — `N stories` on point cards, `N points` on story cards — with the chevron. It keeps today's expand behaviour. No hint on it (it is labelled).
- **Bottom row, middle — the viewer's slot, one place, blue text link:**
  - point card, viewer holds a position and has no story → `+ Add a story`
  - point card, viewer has written a story → `✓ Your story`, opens that story
  - point card, no position → nothing
  - story card, viewer is the author → `+ Add a point`; nobody else sees anything (there is no "your point")
- **Bottom row, right — open the card's page:** an outlined secondary button **`Details →`, always visible on every device**. No hover-reveal. Replaces the external-link icon everywhere on list cards.
- **Desktop hover:** the whole card's border highlights (also on `:focus-within`), confirming the card is clickable. Nothing appears, grows or moves.
- **Zero counts:** the expander renders only when the count is > 0 (no dead button). With 0 and a viewer-slot link, the link alone; with 0 and no link, plain `0 stories` / `0 points` text (today's copy).
- **The `⋯` menu joins the top row that exists on each real card** — `FeedPointCard`: the statement row; `PointCardWithLinks`: the profile-owner quote row, or the statement row on one's own profile (no quote row there, `:273`); story cards: the author row. There is no "POINT" label on real cards; the prototype's label is a stand-in.
- **The `⋯` menu keeps the propagation guard**: it sits in its own `role="presentation"` wrapper that stops clicks, so opening the menu, `Share` → "Copy link", `Edit` and `Delete` never also navigate.
- **Loading:** while linked stories load, the expander and slot reserve their height (no layout jump).

**Surfaces in scope (verified in code):** `FeedPointCard`, `FeedStoryCard`, `PointCardWithLinks` — **both** its footer branches (quote branch ~`:395–500`, plain branch ~`:580–690`) — and the profile's `StoryCardFull` (`profile-page-v2.tsx:1320`). `profile-page-v2.tsx:1237` withholds `viewerStoryId` on one's own profile; that condition is removed so `✓ Your story` works there.
**Out of scope, must look unchanged:** live-session mode, embeds, the point detail page (`point-detail-page.tsx:471`), landing demos.

**Own story card (`StoryCardFull`):** its pencil (edit) and trash (delete) move into the `⋯` menu — founder decision 2026-09-28, prototype K.

[FOUNDER DECISION: "+ Add a story" copy comes from the shared `getPositionCTACopy` (`position-helpers.ts:44`), also used by `story-card-with-links.tsx` and `StoryCardDetail.tsx`. Change it everywhere, or only on list cards?]

These replace today's divergence: the `+ Add your story` pill appears on the profile only when it is the viewer's own profile (`point-card-with-links.tsx:281`), the `✏ your story` link only off it (`:417`), so on one's own profile a written story has no route from the card; the feed point card has its own pill and edit link (`feed-point-card.tsx:310`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Solid blue expander on every card competes with the page's primary CTA (P955 "one primary per view") | ACCEPT | Founder chose reading as the loud action. The P955 gate only checks `/tree/_gate/` fixtures and full-width primaries, so it will not fire here — its pass is not evidence. Visual QA must judge the Hierarchy item against the feed's top CTA. |
| At 320px the point card carrying both `N stories` and `+ Add a story` wraps to two lines | ACCEPT | Measured in the prototype; 375px and wider fit on one line. |
| Share becomes two taps (inside `⋯`), away from where P1296 put it | ACCEPT | Prod Mixpanel, last 90 days to 2026-09-28: `feed_card_shared` fired 2 times against 8,248 page views. |
| Users do not realise a card is tappable (founder observed one user on mobile) | MITIGATE | `Details →` is always visible; card tap stays as a secondary path. |
| `✓ Your story` opens edit mode today (`?edit=true`, all three call sites) | MITIGATE | It opens `/story/:id` to read; aria-label becomes `Your story`; editing stays on the story page. |
| Point page renders the same card without `isDetailView` | MITIGATE | Per decisions.md 2026-09-11, the list footer turns on only when the caller names a list surface (`shareSurface`); keep that contract. |

**Non-Goals**
- Do NOT change what expanding stories/points shows, grouping, quote folding or the share sheet (P1296 rules stand).
- Do NOT change the point or story detail pages.
- Do NOT change position buttons or their logic.
- Do NOT add analytics events in this spec.

## Acceptance Criteria

- [ ] On `/feed`, `/stake/:tag` and a profile, every point card shows `N stories` as a solid blue button and every story card shows `N points` the same way; tapping expands in place.
- [ ] Every list card has one `⋯` in its top-right corner holding `Share`; the viewer's own story card's `⋯` also holds `Edit` and `Delete`, and both work.
- [ ] On phone and desktop, each card shows an outlined `Details →` button that opens the point / story page; no external-link icon remains on list cards.
- [ ] On desktop, hovering or keyboard-focusing a card highlights its border; no control appears or moves (measured before/after).
- [ ] A viewer with a position and no story sees `+ Add a story`; after writing one, sees `✓ Your story`, which opens `/story/:id` with no `edit` param — on the feed and on every profile including their own.
- [ ] Opening `⋯`, and clicking `Share` → "Copy link", `Edit` or `Delete`, never also navigates to the card's page.
- [ ] The point detail page, an embed and live-session cards look as before (screenshot compare).
- [ ] A story's author sees `+ Add a point` on their story card; other viewers see no extra link.
- [ ] At 375px every footer row fits on one line (screenshot per card state); at 320px nothing overflows the card.
- [ ] Visual QA per `.claude/rules/visual-qa.md` by a separate subagent at 320 / 375 / desktop.

## UI Contract

| Element | Copy | Style |
|---|---|---|
| Expander (point) | `N stories` / `1 story` | solid `bg-blue-600` white, h-10, chevron |
| Expander (story) | `N points` / `1 point` | same |
| Zero, no slot link | `0 stories` / `0 points` | plain muted text, no button |
| Viewer slot | `+ Add a story` · `✓ Your story` · `+ Add a point` | blue text link, h-10 hit area |
| Open | `Details →` | outlined secondary, h-10, always visible |
| Card menu | `⋯` (hint `More`) → `Share` · `Edit` · `Delete` (red) | 44px icon button, top-right; Edit/Delete only on own story |

## Invariants

- Every control on a list card stops its own click; the footer row keeps `role="presentation"` + stopPropagation so the share sheet cannot also navigate (card-footer-controls.tsx header).

## Related

- P1296 (done) — unified the footer this replaces; its decisions.md 2026-09-11 rules stand except footer layout.
- Prototype: `/tree/card-actions`, variant K (branch `proto/card-actions`).
