---
status: week
type: task
rank: 91
workstream: E1
created_date: '2026-09-10'
tags: [feed, stake, cards, consistency, event-prep]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, adversarial-review, create-spec.2, adversarial-review.2, create-spec.3]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1296: Align the feed cards in place, and give /stake a footer and a way out

> **Third draft.** Two adversarial reviews, both VERDICT: No, both on a different false premise. Draft 1 called this a styling drift on already-shared components. Draft 2 said feed and stake should adopt the profile's `PointCardWithLinks`. **Both premises were falsified by command and both are recorded below as rejected alternatives, because each one is a trap the next reader could fall into for the same reasons.**

## Problem

**Situation:** The share control on feed story cards floats *above* the footer divider, orphaned, while the profile keeps its equivalent inside a footer row with a count and an open-in-new icon that feed cards lack. `/stake/:tag` renders no footer at all, has no exit at the bottom of the page, and cannot be linked to a specific tab.

**Complication:** Four defects, only the first cosmetic.

- **The floating share control**, on `feed-story-card` only. `feed-point-card` has no divider or footer at all — `grep -n "border-t border-border" src/app/components/feed/feed-point-card.tsx` returns nothing, and its share control sits inside the `PositionButtons` flex row (`:212-240`). So "align the point card's footer" means **building a new row**, not moving one.
- **`/stake` renders no footer whatsoever.** Both feed components gate the footer block on a prop `/stake` never passes: `feed-story-card.tsx:338` on `linkedPoints !== undefined`, `feed-point-card.tsx:251` on `linkedStories !== undefined`. `stake-page.tsx:219-227` passes neither; `feed-page.tsx:510-525` passes both plus `currentUserId`.
- **`/stake` passes no `currentUserId` to `FeedStoryCard`.** That prop's docstring (`feed-story-card.tsx:48-54`) records the P1212 finding verbatim: *"Omitting it is why the feed rendered a read-only slab where the profile rendered an interactive card, from the same component."* Third surface, same defect.
- **`/stake` has no bottom exit and no linkable tab.** Tab state is component state (`stake-page.tsx:56`), so `?tab=stories` is ignored.

**Question:** Converge the two feed cards onto one footer shape, in place, and make `/stake` linkable and escapable.

Founder framing, verbatim:

> "the sharing button is like floating and there is a line... it should have the same, reuse the same components as in slash feed"

> "at the bottom of the page put back button as a CTA. Go back. That's cool because otherwise people feel stuck and the only CTA is at the top."

> "yes lets get footer to stake too both on point and story tabs and consistent with feed (ideally reusing same companents not rebuilding them)"

**Why now:** `/stake/aisafety1` is the pre-event surface for the first AI-safety event. See `docs/events/aisafety1-source-material.md`.

## Appetite

Blast radius: **medium-high**. Two components, three surfaces, plus a page-level data fetch on `/stake`. **1,614 lines of tests bind to the feed cards**, including two structural suites that assert on source text — budget for updating them. Reversibility: high. Decision density: **one open call**, deferred to artifacts (repeat-source handling).

## Solution

**1. Align `FeedStoryCard` and `FeedPointCard` in place. Do not adopt another component and do not extract a new one.**

The footer shape to converge on is **`feed-story-card`'s own**: `border-t border-border px-4 py-2.5`. It is the only footer in the repo already using theme tokens. `feed-point-card` gains a matching row; pad it against the feed's `px-4`, **not** the profile's `sm:pl-[68px]`.

Contents, left to right: expand affordance and count, then right-aligned share, then open-in-new. Feed cards gain the open-in-new icon they lack. On the point card this means lifting the share control out of the `PositionButtons` row, which is the focus-order risk below.

**2. `/stake` gets the footer on BOTH tabs.** **FOUNDER DECISION, RESOLVED 2026-09-10.** Requires `/stake` to fetch linked stories and points — a page-level data change, not styling.

**3. The footer covers point cards as well as story cards.** **FOUNDER DECISION, RESOLVED 2026-09-10**, same statement.

**4. Pass `currentUserId` on `/stake`.** Independent of everything else.

**5. `/stake` tab state moves into the URL.** Derive the tab from `?tab=` as `feed-page.tsx:61` does. Three constraints:

- **Keep the guard at `stake-page.tsx:119-121`.** It forces Points when the tab bar is hidden (`showTabs` requires both lists non-empty, `:115`). Delete it and `/stake/cmp7?tab=stories` — cmp7 is Points-only — renders an empty Stories branch **with no tab bar to switch back from**. Draft 2 instructed deleting exactly this.
- **Preserve `?event=`.** `stake-page.tsx:46` destructures getter-only; `event-links.ts:90` builds `/stake/:tag?event=<slug>`. A bare `setSearchParams({ tab })` drops it.
- **Tab switches use `replace: true`**, or the new bottom CTA walks the reader back through their own tab switches.

**6. `/stake` gains a bottom back CTA**, mirroring `handleBack` (`stake-page.tsx:141-144`).

**7. Absorb P500's `text-base` body type, then close P500.** `feed-story-card.tsx:245` and `feed-point-card.tsx:186` are `text-sm`. **Do NOT cite `profile-page-v2.tsx:1930` as the target — it sits inside `PointCardFull`, which is never rendered.** **Do NOT absorb P500's "~180 char threshold" for Show more; P1259 change 6 banned that shape explicitly.** Tab counts ("Points (N)") are the other live P500 item. Note `text-base` on `feed-story-card:245` interacts with `line-clamp-[18]` — density changes, screenshot it.

**8. Repeat-source handling — OPEN, decided against artifacts.**

The pile is real and it is **on the Stories tab today, behind no collapse**: 8 stories from 4 authors over 4 videos under `aisafety1`, verified read-only against prod. Two candidate designs, both applying to `/feed` and `/stake`:

- **(a) Collapse repeats.** Full player on a source's first appearance; later appearances render quotes and timestamps with the player behind a small expandable affordance. The rule `a69` already specified.
- **(b) Group by source.** A source's stories under one heading, player shown once. For this tag each author has exactly one video, so group-by-source and group-by-author coincide; group-by-source is the general rule.

`[FOUNDER DECISION: (a) or (b) — deferred until artifacts exist. Verbatim: "gorup by soruce is itneresitng but i guess we need to build artifact to see how it would look to decide if we do that or dedup as orignially thought of?" Build both as static artifacts against real aisafety1 content and show them before implementing either.]`

**Invariant on either design:** timestamps stay visible on every repeat without exception. The embed is convenience; the timestamp is the falsifiability hook. Hiding a repeated *player* is dedup. Hiding repeated *quotes or timestamps* is not, and is out of bounds.

## Alternatives Considered — both were drafted, both falsified

**Rejected: adopt `PointCardWithLinks` (the profile's point card).** Drafted as this spec's second version on the founder's reasonable question, *"point cards in profiles build similarly? why not reuse that pattern?"* Falsified by command:

- It renders on **two** production surfaces, not six. `grep -rn "<PointCardWithLinks" src | grep -v tests` gives four call sites; `App.tsx:976,979` gate two behind `import.meta.env.DEV`. The "converge onto the dominant pattern" argument was built on a miscount of imports as renders.
- Its story expansion is gated on `liveSessionMode || profileOwner || isEmbed` (`:642-645`). Feed and stake are none of those, so the chevron would render, toggle, and show nothing — the P1282 defect, which the file's own comment at `:637-641` documents.
- It would revert three shipped fixes: P1212's `aria-label` on the card root (`feed-point-card:158`), P1212's `e.target !== e.currentTarget` keydown guard (`:163-166`), and P1270's `authorPosition` on `QuotedStory` (`:308`) — the last **deliberately feed-only**, because the feed is the only surface where one point carries stories by several authors. Founder ruling in that file: *"profile stay same."*
- `ShareButton` (`ShareDialog.tsx:247`) fires no analytics, so `feed_card_shared` would silently stop; and it opens a modal where the feed copies a link and toasts.
- 22 hardcoded-palette lines against the feed cards' 0.

**The feed cards are the better base** on tokens, aria, touch targets and keydown scoping. Adoption would converge in the wrong direction.

**Rejected: extract a shared component.** P500 rejected it in March and the reasoning stands. For stories there was never anything to adopt: `StoryCardFull` (`profile-page-v2.tsx:1299`) is page-private and an owner-*editing* surface (`onDelete`/`onUpdate`).

**Rejected: a collapse-by-default rule.** Drafted, then found to be a no-op. Everything already collapses (`feed-point-card:54`, `feed-story-card:73`, `point-card-with-links:172` where `isExpanded = isEmbed && expanded`), and `?expanded=true` is embed-only. `use-lazy-story-player.ts` already prevents the video pile via IntersectionObserver at `rootMargin: 50% 0px`. Both the rule and the risk it was written against were phantom.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| 1,614 lines of tests bind to the feed cards, two suites asserting on source text | MITIGATE | Budget for it; do not discover it mid-implementation |
| Lifting share out of the `PositionButtons` row disturbs focus order | MITIGATE | Tab through the footer on every surface. `decisions.md` 2026-05-20 [technical], "Portal-rendered menus require manual focus management", records a prior focus-order defect in this exact row |
| A point card needs a type adapter | MITIGATE | Types are inverted from the March note: `StoryWithPoints extends StoryWithAuthor` (converged), while the *point* card has prototype `Point` vs `PointWithUserPosition` |
| `text-base` interacts with `line-clamp-[18]` | MITIGATE | Density shift on story cards; screenshot before and after |
| Feed card with 0 linked items | MITIGATE | Define the empty footer. `point-card-with-links:600` returns `<span/>` in that case — a blank divider, worse than today's `0 stories` |
| Dark mode ACs are unproducible today | ACCEPT | No code adds `.dark`; the mode is dormant. Keep `dark:` usage at 0 in these cards rather than testing a mode that cannot be entered |
| `MobileTooltip` vs plain `title="Copy link"` parity | ACCEPT | Real, small |

**Non-Goals**
- Do NOT adopt `PointCardWithLinks` or any other component. See Alternatives.
- Do NOT extract a new shared component.
- Do NOT delete `stake-page.tsx:119-121`.
- Do NOT change the tab-visibility rule (`:111-121`), a prior founder ruling.
- Do NOT change `?expanded=true` behaviour.
- Do NOT implement repeat-source handling before the founder has seen both artifacts.
- Do NOT hide quotes or timestamps under any dedup design.

## Done-When

- [ ] Two static artifacts exist showing repeat-source options (a) and (b) against real `aisafety1` content, and the founder has chosen
- [ ] Story and point cards on `/feed` and `/stake` render the same footer row: `border-t border-border px-4 py-2.5`, count and expand left, share then open-in-new right
- [ ] Feed cards render an open-in-new icon
- [ ] `feed_card_shared` still fires from the feed share control
- [ ] `/stake` renders a footer on BOTH tabs
- [ ] `/stake` passes `currentUserId`; its Stories tab renders an interactive card, not a read-only slab
- [ ] `/stake/aisafety1?tab=stories` opens on Stories; `/stake/cmp7?tab=stories` still opens on **Points**, because cmp7 has no stories
- [ ] **A NEW test asserts `?event=` survives a tab switch.** `p1179` does not cover this: `:159,166,186` assert the URL on arrival only, never switch a tab, and use unanchored regexes that break on `?tab=…&event=…` ordering
- [ ] Switching tabs adds no history entries; the bottom back CTA after two tab switches leaves the page
- [ ] A back CTA is reachable at the bottom of `/stake/:tag` without scrolling up
- [ ] Feed card body type is `text-base`; feed tabs show counts; P500 closed
- [ ] Timestamps visible on every repeated source, whichever design is chosen
- [ ] Screenshots at desktop, 375px and 320px on feed, stake and profile, before and after
- [ ] Footer keyboard focus order verified by tabbing on each surface
- [ ] No console errors on feed, stake or profile

## Related

- **P500** — 13 Mar, backlog. Its March recommendation ("update the feed cards in place, not extract a shared component") is what this spec does. Close after item 7.
- **P1212** — a11y fixes on the feed cards that adoption would have reverted.
- **P1270** — `authorPosition`, deliberately feed-only.
- **P1259** — banned the char-threshold Show more shape.
- **`docs/events/aisafety1-source-material.md`** — why `/stake` matters now.

## Open Questions

1. Repeat-source design (a) or (b), after artifacts.
2. Empty-footer treatment on a card with 0 linked items.

## Review

Two adversarial reviews, 1 of 1 reviewer reporting each time, both VERDICT: **No**, each on a different premise this spec no longer holds. Second reviewer's coverage, in its own words: commands on all six axes plus two read-only prod REST reads; **no browser check** — every rendered-visual claim, focus order included, is read from source rather than observed. That gap is why the visual Done-When items require screenshots rather than inheriting the review's word.

**This draft has not been reviewed.** It was written from the second review's findings, including its explicit answer that in-place alignment is the correct target.
