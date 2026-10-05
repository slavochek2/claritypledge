---
status: all-done
type: story
rank: 26
workstream: growth
created_date: '2026-10-05'
tags: [feed, home, groups, cards, mobile]
disclosure: public
intent: cold-start
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-05
---

# P1415: Home rail shows Events first and one group; list cards open only via "Details"

## Problem

Filed from a brief relayed by the main session (2026-10-05). The founder's own sentences were
not passed through, so nothing below is quoted as theirs. Per the brief, the founder approved
both changes.

**A. Groups on the home page.** The desktop right column (P1401) puts Groups above Next events
and lists the first two public groups by directory rank — today "Communication Activism
Community · Chiang Mai" and "Clarity Practice Community · Online". Wanted: **Events first,
Groups below**, and the Groups list showing **only the Communication Activism group** (the
Online group must not show), keeping "All groups". On phones the Groups section should **not
show at all**. Events stay as they are (per the brief, the founder finds their size fine for
now).

**B. Accidental navigation from list cards.** Every story and point list card on `/feed`,
`/stake/:tag` and the profile is a `role="button"` root that navigates to the detail page on
any tap. On phones a tap meant to scroll, select text or aim at a small control often lands
on the card body instead and navigates away. Since P1366 every one of these cards carries an
always-visible outlined `Details →` button, so the whole-card tap has become redundant. Wanted:
the card body stops navigating. Only `Details →` and explicit links inside the card open
anything.

## Appetite

Blast radius: medium. Every list card on three surfaces, plus the home rail. No data or schema
change. Reversibility: git revert. Decision density: zero open decisions. Both changes were
approved by the founder before this spec was filed.

## Solution

### A. Home rail (`home-side-rail.tsx`)

- **Desktop:** Next events comes first, then Groups (still with "All groups").
- **Groups list = the Communication Activism group only.** Pick it by its **slug `cm`**, not by
  name and not by position. The group was renamed once already (2026-09-07), and that rename
  silently reordered the directory (decisions.md 2026-09-07, `display_order`), so a name match or
  "first row" would break on the next copy edit. The slug is what migrations and
  `docs/events/org-defaults.md` key the group on, and it is the group's URL (`/groups/cm`).
  Filter at **render**, not in `homeRead()`. The cached read's shape stays the same, so saved
  offline copies (P1407) stay valid. "Next events" stays scoped to the same two groups it reads
  today, which keeps online events showing.
- **Phones/tablets (top block):** no Groups section and no "All groups" link. Groups stay one
  tap away in the bottom nav. The events part is unchanged.
- Landmark names follow the content: the desktop `aside` becomes "Events and groups". The phone
  block is "Next events" only.

### B. Cards open via `Details →` only

On every card that renders `CardFooterActions` (`FeedPointCard`, `FeedStoryCard`,
`PointCardWithLinks` in its list mode, and the profile's `StoryCardFull`):

- The card root no longer navigates on click, tap, Enter or Space, at any width.
- The root stops pretending to be a control. It becomes an `<article>` that keeps its existing
  accessible name ("Point: …" / "Story by …") and its `data-testid`. It loses `role="button"`,
  `tabIndex`, `onClick`, `onKeyDown`, `cursor-pointer`, and the hover/focus-within border that
  signalled "this whole card is a link".
- Keyboard and screen-reader users reach the detail page through `Details →`, a real `<button>`
  already labelled "Details for this story/point". This also closes P1366's deferred risk:
  "Card roots are `role="button"` containing buttons (nested interactive controls)".
- Explicit links keep working: author name and avatar, quoted stories, tag pills, linked text,
  the video, `+ Add a story`, `✓ Your story`, `+ Add a point`, the `⋯` menu.
- **P1336 `linksInNewTab`:** the POINT card (the only card the onboarding embed shows) routes
  `Details →` and every in-card path through `useOpenPath()`, so the embed still opens details in
  a new tab. Story cards (feed and profile) use plain `navigate`, as before. The old card-root
  guard (a link in the statement must not also navigate the tab) is gone, because the root no
  longer navigates.
- **P1364 return state:** unchanged. Expanded/collapsed state and the per-card test handles
  remain as they are.

**Why whole-card click existed.** P491 shipped the feed cards as "Clickable → navigates". P1366
kept that path as secondary after adding `Details →` (its Risks table: "card tap stays as a
secondary path"), and rejected only a variant with *no* Details button (option L). No entry in
decisions.md rules that the whole-card tap must stay once `Details →` exists. P1366 deferred
the nested-interactive root as "its own spec", and this is that spec.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Users who learned "tap the card" now tap and nothing happens | ACCEPT | `Details →` is labelled and always visible on every card (P1366). The founder asked for exactly this trade. |
| A missing CA group (renamed slug, set private) leaves an empty Groups list | ACCEPT | "All groups" still shows. Same graceful degradation as an empty fetch today. |
| `cm` falls out of the top `HOME_MAX_GROUPS` by directory rank, so it is not in the read | ACCEPT | It is rank 10, the first. A founder re-rank that demotes it would hide it from the rail. "All groups" stays. |
| Tests and e2e locate cards by `role="button"` | MITIGATE | Updated to the new semantics (`article` / the per-card testid), never weakened. E2E failures are triaged against a main-baseline run (decisions.md 2026-09-28, P1366). |

**Non-Goals**
- Do NOT change the `/groups` directory card, which stays a whole-card link (P1204), or event cards.
- Do NOT change `PointCardWithLinks` outside list mode: the point page, embeds, live sessions and
  landing demos keep today's behaviour. None of them has a `Details →` button.
- Do NOT change `homeRead()`'s fetch or cache shape, or which groups' events count as "ours".
- Do NOT restyle `Details →` or the footer row.
- Do NOT touch the unused, module-private `PointCardFull` in `profile-page-v2.tsx`.

## Acceptance Criteria

- [x] Desktop `/feed`: the right column shows Next events above Groups. Groups lists only
      "Communication Activism Community · Chiang Mai", plus "All groups". Verified in the
      browser at 1280 against the test DB (rail headings `["Next events","Groups"]`, links
      `/groups/cm` and `/groups` only), plus e2e `p1415-home-rail-and-details-only` and unit
      `p1415-home-rail`.
- [x] Phone `/feed` (375 and 320): the top block shows Next events and no Groups heading, group
      tile or "All groups" link. Verified in the browser with `window.innerWidth` confirmed at 375
      and 320, plus e2e at both widths.
- [x] Tapping a story or point card's body (text, padding, author meta row) on `/feed`,
      `/feed?tab=stories`, `/stake/:tag` or a profile does not leave the page. Real taps at 375 on
      `/feed` points and stories in e2e. `/stake` and the profile use the same components and are
      verified at component level (unit: `FeedPointCard`, `FeedStoryCard`, list-mode
      `PointCardWithLinks`, `StoryCardFull`).
- [x] Tapping `Details →` on any of those cards opens its detail page. Back returns to the list,
      with P1364 return state intact. `p1364-back-navigation` now opens cards via Details and
      passes for feed stories, `/stake`, and profile Points and Stories. Its feed-*points* cases
      fail identically on main at the base commit, because they load `/feed`, which opens on
      Stories since P1392. Those failures are pre-existing, not P1415's.
- [x] Explicit links inside a card (author name, quoted story, `+ Add a story`) still navigate.
      Unit tests cover the author name. The quoted-story and slot handlers are unchanged and
      carry their own `onClick`.
- [x] A keyboard user can Tab to `Details →` and press Enter to open the detail page. The card
      itself is no longer a tab stop. Unit tests (userEvent Tab plus Enter) cover all three list
      cards. Story roots are `tabindex="-1"`: a focus target for SourceGroup's "Show N more", never
      a Tab stop.
- [x] Cards show no pointer cursor and no blue hover border on the body. Unit class assertions,
      plus e2e computed `cursor` and unchanged border colours after hover.

## Review round (2026-10-05)

Reviews: 3 of 3 reported (Codex SHIP; Gemini and Opus SHIP-WITH-FIXES). Applied:
- `p1364-back-navigation` point-card cases load `/feed?tab=points`. They loaded bare `/feed`,
  which opens on Stories since P1392, so they never exercised point cards.
- `homeRead()` always carries the `cm` group (from the same list call, no extra query), even if a
  re-rank pushes it out of the top `HOME_MAX_GROUPS`. "Our next events" still come from the top
  `HOME_MAX_GROUPS` only.
- When there is no group to name (cm missing, private or renamed, or the read failed), the desktop
  rail drops the whole Groups section rather than showing a heading over "All groups".
- A saved copy without `groups` renders.
- List-mode `PointCardWithLinks` is named `Point: …`, like the feed card.
- Every `Details →` is `aria-describedby` a hidden span holding its card's name, so a
  screen-reader button list tells the cards apart. Details stays a `<button>`; converting it to a
  link is out of scope.

## Follow-ups (not fixed here)

- [FOLLOW-UP #7] Profile story card in edit mode: `Details →` stays live and navigates away,
  discarding the unsaved draft. The old root click was disabled while editing; Details never was.
- [FOLLOW-UP #8] `StoryCardFull` has no keyboard test (Tab to Details, then Enter). Unit tests
  cover the three other list cards.
- Pre-existing, not P1415: `/feed` overflows to 370px wide at 320px (header container and the
  Stories/Points + Sort row), identical on prod. `p1364` "a tab or sort change, then Back" fails
  on main too (it looks for a "currently newest first" button the Sort select replaced).

## Related

- P1401 (rail placement, Groups first), now reversed.
- P1366 (Details button, nested-interactive DEFER), resolved here.
- P1204 (groups directory card stays a link).
- P1336 (`linksInNewTab`) and P1364 (return state), both preserved.
