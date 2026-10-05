---
status: in-progress
type: story
rank: 22
workstream: growth
created_date: '2026-10-06'
tags: [feed, cards, mobile, profile]
disclosure: public
intent: cold-start
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, dev]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1424: Nested items inside list cards open only via their own "Details →"

## Problem

**Situation:** Since P1415 (shipped 2026-10-05), tapping the body of a story or point card on
`/feed`, `/stake/:tag` or a profile does nothing. Only `Details →` and explicit links navigate.
But the items nested inside those cards still open on any tap: the quoted points under a story
card (`QuotedPointCard`) and the linked stories under a point card (`QuotedStory`).

**Complication:** Each nested point box contains its own position buttons, inside the tappable
area. A tap that just misses a position button, or lands while scrolling, opens the point. That
is the same accidental navigation P1415 removed one level up (decisions.md 2026-10-05
[product]: "The founder kept opening cards by accident on phones while aiming at position
buttons or scrolling"), and now the card and its children follow different rules.

**Question:** Should nested items follow the card's rule?

**Decided 2026-10-06 from the prototype `/tree/nested-tap`** (real feed cards at 375px, three
variants): the founder chose **B**. Tapping a nested item's body does nothing, and each nested
item gets its own small `Details →` that opens it. Founder, verbatim: "yes i think b is better?"

## Appetite

Blast radius: medium. Two shared components on four list surfaces (feed and stake story/point
cards, profile Stories and Points tabs). No data or schema change. Reversibility: git revert.
Decision density: zero open. Variant, label and placement were taken from the prototype the
founder chose.

## Solution

On **list cards only**, meaning the four places P1415 changed:

| List card | Nested item |
|---|---|
| `FeedStoryCard` (feed, stake) | quoted points (`QuotedPointCard`) |
| `FeedPointCard` (feed, stake) | linked stories (`QuotedStory`) |
| profile `StoryCardFull` | quoted points (`QuotedPointCard`) |
| profile `PointCardWithLinks` with `inListFooter` | linked stories (`QuotedStory`) |

These cards also reach surfaces through reuse, so those surfaces are in scope too:
- the `/feed` pinned story (`PinnedStory` → `FeedStoryCard`);
- `SourceGroup` on `/stake` and the profile;
- the embedded stake in `/prepare`, `/events/:slug/prepare` and `/tree/p1336`
  (`StakePage embedded linksInNewTab` → `FeedPointCard`). P1415 already made that card's root
  non-navigating there, so leaving the nested items out would give one card two rules. There
  the nested `Details →` opens in a new tab, through `useOpenPath()`.

- The nested box no longer navigates on tap, click, Enter or Space. Like the P1415 card root,
  it stops acting as a control: no `role="button"`, no tab stop, no pointer cursor, no hover
  state that suggests the whole box is a link.
- Each nested box gets a small outlined `Details →` button, bottom-right inside the box, styled
  like the prototype's (secondary to the card's own `Details →`). It opens the nested point or
  story through the same path the box used before: the point route (with `fromProfileId` on the
  profile), or the story route. On the feed point card that path goes through `useOpenPath()`,
  so P1336's new-tab embed behaviour still holds.
- Everything else inside the box keeps working: position buttons (including the P1372 Clear
  row on the profile), author name and avatar, `...more`, the video and its timecodes, tag
  pills, and linked text.
- Its accessible name says what it opens, e.g. "Details for this point" / "Details for this
  story", described by the nested item's text, the way P1415 wired the card-level button.

**Scoping.** `QuotedStory` gets its click handler from its caller. Inside
`PointCardWithLinks`, reuse the existing P1415 signal `inListFooter`; do not add a second flag.
`QuotedPointCard` navigates by itself (`useNavigate` inside the component), so it needs a new
opt-in prop that both of its callers (feed story card, profile `StoryCardFull`) pass.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Two `Details →` buttons in one card (the card's, and each nested item's) read as ambiguous | MITIGATE | The nested one is smaller and sits inside the nested box, as in the prototype the founder approved. Its accessible name says which item it opens. |
| People used to tapping a quoted point now tap and nothing happens | ACCEPT | Same trade P1415 made, and the founder chose it again from the prototype. |
| Tests and e2e find nested items by `role="button"` | MITIGATE | Update them to the new semantics (testids, the new button). Never weaken them. Triage e2e failures against a main-baseline run, as P1415 did. Suites known to touch these components: p154-position-persistence-profile, p1104-agent-marker, p268-position-display-integrity. |

**Non-Goals**
- Do NOT change nested items outside list cards. These keep tap-to-open (decisions.md
  2026-10-05: "Point cards outside lists (point page, embeds) keep whole-card navigation"):
  - the point page embed `/point/:id?embed=true`;
  - `/point/:id` and `/story/:id`, whose nested boxes are the private `QuotedPoint` in
    `story-card-with-links.tsx` and `StoryCardDetail.tsx`;
  - the landing and demo pages.
- Do NOT change the card-level `Details →`, the footer row, or the expander.
- Do NOT add expand-in-place (variant C, rejected: a stray tap still shifts the layout under
  the finger).
- Do NOT fix the pre-existing gap that points under a feed story have no working position
  removal (decisions.md, P1372). It is separate.

## Acceptance Criteria

- [ ] At 375px on `/feed`, tapping the body (text, padding, pin icon) of a quoted point under a
      story card does not leave the page. The same holds for a linked story under a point card,
      on `/feed`, `/stake/:tag` and both profile tabs.
- [ ] Tapping a nested item's `Details →` opens that point or story, and Back returns to the
      list with P1364 return state intact.
- [ ] Position buttons inside a nested point still record a position, and tapping them never
      navigates.
- [ ] Author name, `...more`, video play and timecodes inside a nested item behave as before.
- [ ] A keyboard user can Tab to a nested `Details →` and press Enter to open it. The nested box
      itself is not a tab stop.
- [ ] On `/prepare` (embedded stake), tapping a nested story's body does nothing, and its
      `Details →` opens the story in a new tab (P1336).
- [ ] Non-goal guard: on `/point/:id?embed=true`, linked stories still open on tap. On
      `/story/:id`, quoted points still open on tap.
- [ ] The nested box has no pointer cursor or hover highlight.

## UI Contract

- Label: `Details →`, the same string as the card-level button. Placement: bottom-right inside
  the nested box. Size: 40px tall (`h-10`), `text-xs`, outlined, so it stays visually secondary
  to the card's own `Details →` (`text-sm`). The prototype's 32px was raised to 40px during
  `/dev`: `.claude/rules/visual-qa.md` requires touch targets of at least 40px, and this button
  sits beside position buttons, where a mis-tap is the whole problem.
  [FOUNDER DECISION: taken as shown in the prototype the founder chose. Change it here if a
  different label or placement is wanted.]

## Related

- P1415: the card-level rule. This spec extends it to nested items.
- P1366: introduced `Details →`.
- P1270: made `QuotedPointCard` and `QuotedStory` structurally identical.
- P1372: `onPositionClear` on `QuotedPointCard`.
- Left alone on purpose: the private `QuotedPoint` copies in `story-card-with-links.tsx` and
  `StoryCardDetail.tsx` (detail views). They are a third copy of the nested box. Merging the
  copies is not in scope.

## Resolved Decisions

- 2026-10-06, Opus spec review (1 of 1 reported): fixed one BLOCK (the `/point/:id` guard
  tested a page that never renders `QuotedStory`) and four WARNs (scope gaps: `/prepare`,
  pinned story, `SourceGroup`; the scoping signal; the e2e list). Every claim the edits rely
  on was re-checked by grep.
- Prototype: `/tree/nested-tap` (worktree `.claude/worktrees/nested-tap`, branch
  `proto/nested-tap-lab`, uncommitted, throwaway).
