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

Two things verified 2026-09-10, both of which look like objections and are not:

- **The open-in-new icon is not redundant with the card click.** The card root navigates
  (`feed-story-card.tsx:83-85`), but the footer row calls `stopPropagation`
  (`feed-story-card.tsx:342`) — so the footer strip is the one band of the card where the
  card-click navigation is dead. The icon restores it there. The profile carries both for the same
  reason (`point-card-with-links.tsx:282` navigates AND `:632` renders the icon).
- **Lifting share out of the buttons row must carry its analytics line with it.**
  `analytics.track('feed_card_shared', …)` fires from `feed-point-card.tsx:230` and
  `feed-story-card.tsx:318`. This is the same fact that rules out the profile's `ShareButton`,
  which fires nothing.

Touch targets: the profile's footer icons are `min-w-11 min-h-11` (44px) while the feed's expander
is `min-h-[40px]`. Use 44px on the new icons — 40px is the checklist floor, not the target.

**2. `/stake` gets the footer on BOTH tabs.** **FOUNDER DECISION, RESOLVED 2026-09-10.** Requires `/stake` to fetch linked stories and points — a page-level data change, not styling.

**No new query is needed.** Both batch fetchers already exist with mock counterparts —
`getPointsForStories` and `getStoriesForPoints` (`stories-service.interface.ts:83,123`). `/stake`
wires them exactly as `feed-page.tsx:510-525` does. Verified 2026-09-10.

**3. The footer covers point cards as well as story cards.** **FOUNDER DECISION, RESOLVED 2026-09-10**, same statement.

**4. Pass `currentUserId` on `/stake`.** Independent of everything else.

**5. `/stake` tab state moves into the URL.** Derive the tab from `?tab=` as `feed-page.tsx:61` does. Three constraints:

- **Keep the guard at `stake-page.tsx:119-121`.** It forces Points when the tab bar is hidden (`showTabs` requires both lists non-empty, `:115`). Delete it and `/stake/cmp7?tab=stories` — cmp7 is Points-only — renders an empty Stories branch **with no tab bar to switch back from**. Draft 2 instructed deleting exactly this.
- **Preserve `?event=`.** `stake-page.tsx:46` destructures getter-only; `event-links.ts:90` builds `/stake/:tag?event=<slug>`. A bare `setSearchParams({ tab })` drops it.
- **Tab switches use `replace: true`**, or the new bottom CTA walks the reader back through their own tab switches.

**6. `/stake` gains a bottom back CTA**, mirroring `handleBack` (`stake-page.tsx:141-144`).
**Label: "Go back" — FOUNDER DECISION, RESOLVED 2026-09-10**, the founder's own words. Deliberately
NOT "Back to the feed": `handleBack` goes to the previous page whenever there is one and only falls
back to `/feed` on a cold arrival (`location.key === 'default'`), so a destination-naming label
would be wrong for most visitors.

**7. Absorb P500's `text-base` body type, then close P500.** `feed-story-card.tsx:245` and `feed-point-card.tsx:186` are `text-sm`. **Do NOT cite `profile-page-v2.tsx:1930` as the target — it sits inside `PointCardFull`, which is never rendered.** **Do NOT absorb P500's "~180 char threshold" for Show more; P1259 change 6 banned that shape explicitly.** Tab counts ("Points (N)") are the other live P500 item. Note `text-base` on `feed-story-card:245` interacts with `line-clamp-[18]` — density changes, screenshot it.

**8. Repeat-source handling — OPEN, decided against artifacts.**

The pile is real and it is **on the Stories tab today, behind no collapse**: 8 stories from 4 authors over 4 videos under `aisafety1`, verified read-only against prod. Two candidate designs, both applying to `/feed` and `/stake`:

- **(a) Collapse repeats.** Full player on a source's first appearance; later appearances render quotes and timestamps with the player behind a small expandable affordance. The rule `a69` already specified.
- **(b) Group by source.** A source's stories under one heading, player shown once. For this tag each author has exactly one video, so group-by-source and group-by-author coincide; group-by-source is the general rule.

**THE ARTIFACTS NOW EXIST, IN A SECOND PASS.** `/tree/stake-grouping` (DEV-gated) renders Today,
(a) and (b) in tabs, using the SHIPPING `FeedStoryCard` against a frozen prod snapshot of all eight
stories (`src/app/pages/tree/aisafety1-fixture.ts`). Verified in a real browser: no console errors
or warnings, no horizontal overflow at 375px or 320px, every fold control at least 40px tall.

The first pass faked the fold with a CSS rule and the founder rejected it on four counts, each of
which is now built for real and each of which is a DECISION, not a variant:

> *"if we collapse, that one has to see that there is something was collapsed... how do I
> uncollapse it?"* · *"if we collapse, we collapse both"* (the supporting quotes too) · *"if
> something has a collapsed video and I see the quote and I click on that quote it doesn't work — I
> mean on the timestamp"* · *"if it's group, then it has to look like a group... maybe we switch
> them a bit to the right"* · *"should we show, for example, only one story and say, show more
> stories... otherwise people just scroll and scroll"*

- **FOUNDER DECISION — a fold must name what it folded and give it back.** The collapsed source is
  a labelled control in the media box's own position, not an absence.
- **FOUNDER DECISION — collapsing the source collapses its supporting quotes too**, behind a toggle
  carrying their count and subject.
- **FOUNDER DECISION — a timecode on a collapsed card opens the fold and plays from that second**;
  inside a group it drives the group's player. This answers the open question raised below.
- **FOUNDER DECISION — a group is indented under a rule**, and a long group shows two stories with
  the rest behind one control.

Implemented as three opt-in props no shipping call site passes — `sourceCollapsed` and
`quotesCollapsed` on `FeedStoryCard`, `showHeading` on `StoryVideoQuotes`. Defaults leave `/feed`,
`/stake` and the profile byte-identical, which is what keeps this inside the Non-Goal below: the
artifact exercises the real card, and no surface changes until the founder picks.

`[FOUNDER DECISION: (a) or (b) — artifacts built 2026-09-10, awaiting the founder's look. Verbatim: "gorup by soruce is itneresitng but i guess we need to build artifact to see how it would look to decide if we do that or dedup as orignially thought of?"]`

**What the real data does to the choice — and it is not what either draft assumed.** In the
oldest-first order `/stake` actually requests, LeCun's two stories are already ADJACENT and so are
Bengio's; only Leahy's three are scattered, at positions 1, 3 and 8. So (a) and (b) differ on
exactly one person, and (b)'s cost is concentrated there: grouping moves five cards.

Three observations from the built artifact, offered as input to the call, not as the call:

- **(b) reorders a list whose order is deliberate.** `stake-page.tsx:74-80` requests stories
  `ascending = true` and the file's header treats stored order as render order. On `/feed` the same
  rule would rearrange the global feed around whoever posted the video.
- **(b) collides with the agent profile.** Rendered, a group reads "Connor Leahy / 3 stories from
  one source" over one player — which is `/p/agent-connor-leahy`. The name then appears five times
  in one group (heading, plus byline and quote header on each card), and at 375px the group's
  container double-indents every card inside it.
- **(a) buys back roughly a video box (~330px) on each of the four repeats and moves nothing.**

**CORRECTION — the "dead timecode" finding recorded here on 2026-09-10 was wrong about its
mechanism, and the mechanism is what mattered.** It claimed `useLazyStoryPlayer` swallows a seek
because `playerRef` never populates. Measured in Chrome against the second artifact, with probes in
the hook, the card and `StoryVideoPlayer`: the hook dispatches correctly (`{pending: 2692, hasRef:
true}`) and the chain click → fold opens → player mounts → seeks → plays works end to end.

What DOES eat the first cold-mount seek is **React StrictMode, in dev only**. Its double-invoke
runs `StoryVideoPlayer`'s effect cleanup between the hook's dispatch and YouTube's `onReady`, and
that cleanup sets `pendingSeekRef.current = null`. Proof: with `<React.StrictMode>` in
`src/main.tsx` the ready log reads `{pending: null}`; with it temporarily removed, same click,
`{pending: 2692}` and the video plays from 44:52. `main.tsx` was restored immediately; the probes
were removed.

Two consequences. **P1259's pre-mount seek is sound in production** — the behaviour the founder
saw, and the thing I told them, were both artifacts of the prototype and the dev server. And
**anyone testing a timecode on a not-yet-mounted player against `npm run dev` will see it fail and
be wrong about why**; note it before filing that bug.

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
| Feed card with 0 linked items | RESOLVED | **FOUNDER DECISION 2026-09-10: keep `0 points` / `0 stories`**, as `feed-story-card.tsx:357` already does. The row still carries share and open-in-new, so it is never a bare divider. Do NOT copy `point-card-with-links:600`'s `<span/>` |
| Dark mode ACs are unproducible today | ACCEPT | No code adds `.dark`; the mode is dormant. Keep `dark:` usage at 0 in these cards rather than testing a mode that cannot be entered |
| `MobileTooltip` vs plain `title="Copy link"` parity | ACCEPT | Real, small |

**Non-Goals**
- Do NOT adopt `PointCardWithLinks` or any other component. See Alternatives.
- Do NOT extract a new shared component.
- Do NOT delete `stake-page.tsx:119-121`.
- Do NOT change the tab-visibility rule (`:111-121`), a prior founder ruling.
- Do NOT change `?expanded=true` behaviour.
- Do NOT implement repeat-source handling on any shipping surface before the founder has chosen. The
  opt-in props added for the artifact (`sourceCollapsed`, `quotesCollapsed`, `showHeading`) are
  passed by `/tree/stake-grouping` and nothing else; wiring them into `/feed` or `/stake` is the
  implementation, and it waits.
- Do NOT hide quotes or timestamps under any dedup design.

## Done-When

- [x] Two artifacts exist showing repeat-source options (a) and (b) against real `aisafety1` content — `/tree/stake-grouping`, real `FeedStoryCard`, prod snapshot, browser-verified
- [x] Second pass: the fold is real and reversible, quotes fold with it, a timecode opens the fold and plays, groups are indented and capped — all four verified in Chrome
- [ ] The founder has chosen (a) or (b)
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

1. **Repeat-source design (a) or (b).** The second-pass artifact is at `/tree/stake-grouping`. This
   is the ONLY thing blocking `/dev`.
2. **Should supporting quotes be folded EVERYWHERE, not only on a collapsed repeat?** Founder:
   *"generally supporting quotes, maybe we collapse everywhere, not just in stake... they take so
   much space. Who reads? I read the story and then I say, okay, that's interesting — and then who
   wants to read after the story the supporting quotes? Maybe, but maybe not."* The artifact's
   `Supporting quotes folded` switch applies to the Today tab as well, so the `/feed` version of
   this question can be looked at directly. Scope if yes: the six surfaces P1259 change 1 touched,
   which is a bigger change than this spec — likely its own P-number.
3. **Should an old story be collapsible on its own, independent of repeat sources?** Founder:
   *"should one be able to collapse old stories? I don't know."* NOT built. The card already clamps
   its body at 18 lines, so the unread cost of an old story is roughly one screen, not the pile
   this spec is about — which is why it is recorded rather than prototyped.
4. **In a group, the subject's name appears in the heading AND on every card inside it.** Visible
   in (b) at any width: heading, byline and quote toggle each name the same person, five times in
   Leahy's group. Reducing the member card's chrome inside a group is possible but is a change to
   what a card IS, not to how the list is arranged — out of scope until (b) is chosen.

~~Where a timecode seeks on a collapsed or grouped card~~ — RESOLVED 2026-09-11: the fold opens and
plays from that second; inside a group the group's player takes it. See item 8.

~~Empty-footer treatment~~ — RESOLVED 2026-09-10, see Risks.

## Review

Two adversarial reviews, 1 of 1 reviewer reporting each time, both VERDICT: **No**, each on a different premise this spec no longer holds. Second reviewer's coverage, in its own words: commands on all six axes plus two read-only prod REST reads; **no browser check** — every rendered-visual claim, focus order included, is read from source rather than observed. That gap is why the visual Done-When items require screenshots rather than inheriting the review's word.

**This draft has not been reviewed.** It was written from the second review's findings, including its explicit answer that in-place alignment is the correct target.

**Artifact session, 2026-09-10 — no subagents spawned, 0 of 0 reporting.** Every claim added in
that pass was verified by command or in a real browser by the main session: prod REST reads for the
eight stories, four profiles, the agent registry and the story→point links; `tsc` and `eslint` clean
on the new files; Chrome DevTools for the render, the 17 visible timecodes, the empty console, and
the absence of horizontal overflow at 375px and 320px. The `useLazyStoryPlayer` seek finding is read
from source (`use-lazy-story-player.ts`), NOT observed — it is the one claim in this pass that has
not been exercised, and it should be reproduced before the fix is designed on it.
