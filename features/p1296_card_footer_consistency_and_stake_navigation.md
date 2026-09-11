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

Blast radius: **medium-high**. Two components, three surfaces, plus a page-level data fetch on `/stake`. **1,614 lines of tests bind to the feed cards**, including two structural suites that assert on source text — budget for updating them. Reversibility: high. Decision density: repeat-source design **chosen, (b) group by source**; two placement calls open (Open Questions 1-2).

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

**8. Repeat-source handling — (b) group by source, chosen 2026-09-11 against artifacts.**

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

**FOUNDER DECISION, 2026-09-11 — (b) group by source.** Verbatim, after the second artifact: *"I
do like the grouping"*. The cost recorded below — (b) reorders the list — is accepted with it. The
rule that keeps the reordering bounded: a group sits where its source FIRST appears in whatever
order the page already uses, and the other stories of that source join it there. Nothing is
re-sorted by author or date. A source with one story gets no group chrome.

**THIRD PASS, 2026-09-11 — three annotated screenshots from the founder, all three built.**

- *"too much text that is not needed? 3 Stories by Agent on Connor Leahy? or what? or we name the
  source?"* (the group heading) → one line, **"3 stories from this video"**. No avatar, no name.
  The group IS the video, and the player names it (title and channel) as soon as it mounts; every
  byline inside already names the person.
- *"not sure we need the name of person again here? redundant?"* (the quotes toggle) → **"2
  supporting quotes"**. The byline a few lines above already says whose words they are.
- *"should show position here"* (the opened point) → **the artifact's defect, not a design gap.**
  `/feed` already renders the story author's stance above each point ("Connor Leahy Disagrees+",
  P1270 §4, via `profileSubjectPosition`). The prod snapshot had left that field out, so the
  artifact showed a point with no stance. Re-read from prod `point_positions` through
  `story_points.author_id`: all eight links carry a stance. With the fixture carrying them the
  stance renders, and no component changed.

**Where the repeats actually occur — prod, read-only, 2026-09-11.** The whole `stories` table
filtered to rows with a video (one request, `limit=1000`, 8 rows returned, all filed 2026-09-09):
four videos, three of them backing more than one story (groups of 3, 2 and 2). **No video has been
read by two different authors.** So every repeat is one person's video appearing more than once,
and 3 of the 4 authors carry a repeat on their OWN profile. The pile is on three surfaces at once —
`/feed`, `/stake/:tag` and the author's profile — and the profile renders stories through a
different component (`StoryCardFull`, page-private, `profile-page-v2.tsx:1175`), not
`FeedStoryCard`. That is what Open Question 1 is about.

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

**Invariant, amended 2026-09-11:** quotes and timestamps are never REMOVED from a repeat, and are
never folded without a control stating their count. The earlier wording ("visible without
exception") contradicted the founder's second-pass decision to fold them (*"if we collapse, we
collapse both"*). What survives is the part that mattered: the evidence is announced on every card,
one click away, and a timecode on a folded card still plays. The embed is convenience; the
timestamp is the falsifiability hook. Hiding a repeated *player* is dedup; deleting repeated
*quotes* is not, and stays out of bounds.

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
- Do NOT remove quotes or timestamps under any dedup design. Folding them behind a control that
  states their count is allowed (founder, 2026-09-11); deleting them is not.

## Done-When

- [x] Two artifacts exist showing repeat-source options (a) and (b) against real `aisafety1` content — `/tree/stake-grouping`, real `FeedStoryCard`, prod snapshot, browser-verified
- [x] Second pass: the fold is real and reversible, quotes fold with it, a timecode opens the fold and plays, groups are indented and capped — all four verified in Chrome
- [x] The founder has chosen: **(b) group by source**, 2026-09-11
- [x] Third pass: group heading reduced to a count, quotes toggle drops the name, the author's stance restored on opened points — verified in Chrome
- [ ] Grouping renders on every surface named in Open Question 1, with the same rule on each
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
- [ ] Every repeated source keeps its quotes and timestamps, folded behind a counted control; a timecode on a folded or grouped card plays
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

1. **Which surfaces group.** `/feed` Stories and `/stake/:tag` Stories render `FeedStoryCard`, so
   one implementation covers both. The profile's Stories tab renders `StoryCardFull`, which would
   need the same two opt-in props (`quotesCollapsed`, and a way to hand timecodes to the group's
   player) plus the group wrapper. Prod says the repeats are on all three surfaces equally (every
   repeat is one author's own video, see item 8). Recommendation: all three in this spec, one rule,
   because a rule that holds on two of three surfaces is the inconsistency this spec exists to
   close. `[FOUNDER DECISION: feed + stake + profile, or feed + stake now and profile as its own
   P-number]`
2. **Are supporting quotes folded on every list, or only inside groups?** Founder, second pass:
   *"generally supporting quotes, maybe we collapse everywhere, not just in stake."* The artifact's
   `Supporting quotes folded` switch applies to every tab, so both readings can be looked at
   directly. Recommendation: folded on every list surface (`/feed`, `/stake`, profile), open on the
   story's own page (`/story/:id`), where the reader came for the whole story. A fold that
   applies inside groups only would make the same story look different depending on whether its
   video happens to repeat. `[FOUNDER DECISION]`
3. **Should an old story be collapsible on its own?** Founder: *"should one be able to collapse old
   stories? I don't know."* NOT built. Recommendation: close it. The body already clamps at 18
   lines, groups cap at two stories, and quotes fold — the three things that made the page long
   are each handled.
4. **Name repetition — mostly resolved by the third pass.** The group heading and the quotes toggle
   no longer name the person. What remains: an opened point's stance row names the author again
   ("Connor Leahy Disagrees+"). That row is P1270's shipped `/feed` behaviour, rendered by the
   shared `QuotedPointCard` the profile also uses — not changed here.

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
