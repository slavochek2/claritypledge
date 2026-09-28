---
status: in-progress
type: story
rank: 14
workstream: product
created_date: '2026-09-28'
tags: [cards, feed, profile, ux]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
- **Profile counts say whose they are.** A profile lists the owner's stories only (P470). Unlabelled, `2 stories` there reads as the point's total and contradicts the feed's number for the same point. A person has at most one story per point (DB unique `story_points` author+point, `20260301120000_story_points_author_unique.sql`), so on a profile the count is only ever 0 or 1: the expander drops the number and reads `Maya's story` (first name), or `Your story` on one's own profile; with 0 it is absent. Feed and stake keep `N stories`. The full set is one tap away via `Details →`.
- **Zero counts:** the expander renders only when the count is > 0 (no dead button). With 0 and a viewer-slot link, the link alone; with 0 and no link, plain `0 stories` / `0 points` text (today's copy).
- **The `⋯` menu joins the top row that exists on each real card** — `FeedPointCard`: the statement row; `PointCardWithLinks`: the profile-owner quote row, or the statement row on one's own profile (no quote row there, `:273`); story cards: the author row. There is no "POINT" label on real cards; the prototype's label is a stand-in.
- **The `⋯` menu keeps the propagation guard**: it sits in its own `role="presentation"` wrapper that stops clicks, so opening the menu, `Share` → "Copy link", `Edit` and `Delete` never also navigate.
- **Loading:** while linked stories load, the expander and slot reserve their height (no layout jump).

**Surfaces in scope (verified in code):** `FeedPointCard`, `FeedStoryCard`, `PointCardWithLinks` — **both** its footer branches (quote branch ~`:395–500`, plain branch ~`:580–690`) — and the profile's `StoryCardFull` (`profile-page-v2.tsx:1320`). On one's own profile the expanded stories already are the viewer's own (profiles show the owner's stories, P470), so no `✓ Your story` link is added there — the existing own-profile behaviour (`profile-page-v2.tsx:1237`, `:447–456`) stays.
**Out of scope, must look unchanged:** live-session mode, embeds, the point detail page (`point-detail-page.tsx:471`), landing demos.

**Own story card — profile only (`StoryCardFull`):** its pencil (edit) and trash (delete) move into the `⋯` menu — founder decision 2026-09-28, prototype K. `FeedStoryCard` has no edit/delete today; own cards on `/feed` and `/stake` get `Share` only. Edit stays **inline** (`handleEditStart`, `:1367`); while editing, the `⋯` menu is hidden and focus stays in the textarea. Delete keeps today's confirmation (`window.confirm`, `:1766`), the disabled-while-deleting state and both toasts. The card's author row (`:1505`) has no top-right slot today — restructure it so `⋯` never overlaps the name or ear badge at 320px.

**Menu mechanics:** use the existing shadcn `DropdownMenu` (`@/components/ui/dropdown-menu`, pattern `share-dropdown.tsx:158`), not the prototype's hand-built div. Trigger `aria-label` names the card (e.g. "More actions for this point"). `Share` opens the **share sheet** (link + embed, decisions.md 2026-09-11), not a direct copy: the item's `onSelect` sets a card-level `shareOpen`, and a controlled `ShareDialog` renders as a sibling of the menu so it survives the menu closing; `feed_card_shared` still fires with its surface. `+ Add a point` keeps its target (`/story/:id?addPoint=true`).

**Copy change is global:** `getPositionCTACopy` (`position-helpers.ts:44`) changes to `+ Add a story`, so every surface that uses it (list cards, `story-card-with-links.tsx`, `StoryCardDetail.tsx`) says the same thing — founder decision 2026-09-28. `AddPointPill` becomes `+ Add a point`.

These replace today's divergence: the `+ Add your story` pill appears on the profile only when it is the viewer's own profile (`point-card-with-links.tsx:281`), the `✏ your story` link only off it (`:417`), so on one's own profile a written story has no route from the card; the feed point card has its own pill and edit link (`feed-point-card.tsx:310`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Solid blue expander on every card competes with the page's primary CTA (P955 "one primary per view") | ACCEPT | Founder chose reading as the loud action. The P955 gate only checks `/tree/_gate/` fixtures and full-width primaries, so it will not fire here — its pass is not evidence. Visual QA must judge the Hierarchy item against the feed's top CTA. |
| At 320px the point card carrying both `N stories` and `+ Add a story` wraps to two lines | ACCEPT | Measured in the prototype; 375px and wider fit on one line. |
| Share becomes two taps (inside `⋯`), away from where P1296 put it | ACCEPT | Prod Mixpanel, last 90 days to 2026-09-28: `feed_card_shared` fired 2 times against 8,248 page views. |
| Card roots are `role="button"` containing buttons (nested interactive controls, pre-existing since P1296) | DEFER | Not introduced here; a semantics refactor (root as container, `Details` as the real link) is its own spec. |
| `⋯` holds only `Share` on most cards (a one-item menu) | ACCEPT | Founder chose one consistent corner rule over showing the share icon directly; share is used ~2×/90 days. |
| On a profile, a reader wants everyone's stories on the point, not just the owner's | ACCEPT | `Details →` opens the point page with all stories; watch for it in the first user sessions. |
| Users do not realise a card is tappable (founder observed one user on mobile) | MITIGATE | `Details →` is always visible; card tap stays as a secondary path. |
| `✓ Your story` opens edit mode today (`?edit=true`, all three call sites) | MITIGATE | It opens `/story/:id` to read; aria-label becomes `Your story`; editing stays on the story page. |
| Point page renders the same card without `isDetailView` | MITIGATE | Per decisions.md 2026-09-11, the list footer turns on only when the caller names a list surface (`shareSurface`); keep that contract. |

**Non-Goals**
- Do NOT change what expanding stories/points shows, grouping, quote folding or the share sheet (P1296 rules stand).
- Do NOT change the point or story detail pages.
- Do NOT change position buttons or their logic.
- Do NOT add analytics events in this spec.

## Acceptance Criteria

- [ ] On `/feed`, `/stake/:tag` and a profile, every point card with ≥1 story shows `N stories` as a solid blue button and every story card with ≥1 point shows `N points` the same way; tapping expands in place. At 0: no button (the viewer link alone, or plain `0 stories` / `0 points`).
- [ ] Every list card has one `⋯` in its top-right corner holding `Share`, which opens the share sheet and still fires `feed_card_shared`.
- [ ] On the profile, the viewer's own story card's `⋯` also holds `Edit` (inline edit, menu hidden meanwhile) and `Delete` (confirmation kept; card leaves the list on success; error toast on failure).
- [ ] The `⋯` menu opens and closes with keyboard (Enter/Space, arrows, Escape) and outside click; focus returns to the trigger, or moves into the share sheet when Share is chosen.
- [ ] On phone and desktop, each card shows an outlined `Details →` button that opens the point / story page; no external-link icon remains on list cards.
- [ ] On desktop, hovering or keyboard-focusing a card highlights its border; no control appears or moves (measured before/after).
- [ ] A viewer with a position and no story sees `+ Add a story`; after writing one, sees `✓ Your story`, which opens `/story/:id` with no `edit` param — on the feed, stake pages and other people's profiles.
- [ ] On a profile the expander reads `<First name>'s story` (`Your story` on one's own) and is absent when that person has none; on feed and stake it reads `N stories`.
- [ ] `+ Add your story` no longer appears anywhere in the app; every surface says `+ Add a story`.
- [ ] Opening `⋯`, choosing any item by mouse or Enter, and clicking inside the share sheet or the delete confirmation never also navigates to the card's page.
- [ ] The point detail page, an embed and live-session cards look as before (screenshot compare).
- [ ] A story's author sees `+ Add a point` on their story card; other viewers see no extra link.
- [ ] At 375px every footer row fits on one line (screenshot per card state, including a 3-digit count and the own-story card); at 320px nothing overflows the card, including a long author name next to `⋯`.
- [ ] Visual QA per `.claude/rules/visual-qa.md` by a separate subagent at 320 / 375 / desktop.

## UI Contract

| Element | Copy | Style |
|---|---|---|
| Expander (point) | `N stories` / `1 story`; on a profile `Maya's story` / `Your story` (count is 0 or 1) | solid `bg-blue-600` white, h-10, chevron |
| Expander (story) | `N points` / `1 point` | same |
| Zero, no slot link | `0 stories` / `0 points` | plain muted text, no button |
| Viewer slot | `+ Add a story` · `✓ Your story` · `+ Add a point` | blue text link, h-10 hit area |
| Open | `Details →` | outlined secondary, h-10, always visible |
| Card menu | `⋯` (hint `More`) → `Share` · `Edit` · `Delete` (red) | 44px icon button, top-right; Edit/Delete only on own story |

## Invariants

- Every control on a list card stops its own click. The footer row and the `⋯` menu each sit in a `role="presentation"` + stopPropagation wrapper, and the menu content, share sheet and delete confirmation render as React descendants of that wrapper — portals bubble through the React tree (card-footer-controls.tsx header).

## Related

- P1296 (done) — unified the footer this replaces; its decisions.md 2026-09-11 rules stand except footer layout.
- Prototype: `/tree/card-actions`, variant K (branch `proto/card-actions`).
