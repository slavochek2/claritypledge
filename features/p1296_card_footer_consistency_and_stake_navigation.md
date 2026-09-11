---
status: week
type: task
rank: 91
workstream: E1
created_date: '2026-09-10'
tags: [feed, stake, profile, cards, consistency, grouping, event-prep]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, adversarial-review, create-spec.2, adversarial-review.2, create-spec.3, create-spec.4]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1296: One card behaviour on feed, stake and profile — and a /stake you can link to and leave

> **Fourth draft, 2026-09-11.** Drafts 1–3 were a footer-alignment spec; three artifact passes
> and the founder's decisions since then made it a card-consistency spec across three surfaces.
> Rewritten as one build spec rather than accreted. What was tried, rejected and corrected on the
> way is in **History** at the bottom — read it before re-opening any decision.

## Problem

**Situation.** The same story renders differently depending on where it is met, and `/stake` —
the page an event links people to — cannot be linked to a tab or left from the bottom.

**Complication.** Seven defects, measured:

- **The footer drifts by surface.** On feed story cards the share control floats above the
  divider. `feed-point-card` has no footer row at all — its share sits in the `PositionButtons`
  row (`:212-240`). The profile's story footer carries owner edit/delete and a `ShareButton` that
  opens a modal and fires no analytics, and has no open-in-new icon.
- **`/stake` renders no footer.** Both feed cards gate the footer on a prop `/stake` never
  passes: `feed-story-card.tsx:338` on `linkedPoints`, `feed-point-card.tsx:251` on
  `linkedStories`. `stake-page.tsx:219-227` passes neither.
- **`/stake` passes no `currentUserId`**, so its cards render the read-only slab P1212 already
  fixed once on `/feed` (`feed-story-card.tsx:48-54`).
- **`/stake` has no linkable tab and no bottom exit.** Tab state is component state
  (`stake-page.tsx:56`). **The Clarity Night event of 2026-09-18 links to
  `claritypledge.com/stake/aisafety1?tab=stories`** (test DB, `events.description`, slug
  `ai-safety-disagreement-sanders-lecun-bengio-leahy-2026-09-18`) — today that link opens on
  Points.
- **One video piles up.** Prod, read-only, 2026-09-11: 8 stories carry a video, over 4 videos;
  3 videos back more than one story (3, 2, 2). Connor Leahy's video is mounted three times on
  `/stake/aisafety1`, on the feed's Stories tab, and on his own profile.
- **Supporting quotes double every card's length.** Founder: *"who wants to read after the story
  the supporting quotes? Maybe, but maybe not."*
- **Story text is cut early.** Feed cards clamp at 18 lines of `text-sm`; the profile at 24 of
  `text-base`. Founder: *"allow for more text until the show more appears"*, *"at least 50 or 60,
  70% more"*.

**Question.** Make a story and a point behave the same on `/feed`, `/stake` and the profile —
footer, grouping, quotes, text, timestamps — and make `/stake` linkable and escapable before
2026-09-18.

Founder framing, verbatim: *"the sharing button is like floating and there is a line... it should
have the same, reuse the same components as in slash feed"* · *"at the bottom of the page put back
button as a CTA. Go back."* · *"yes lets get footer to stake too both on point and story tabs and
consistent with feed"* · *"I do like the grouping"* · *"A yes to all three"* (feed, stake,
profile) · *"so its folded per default everywhere?"* · *"clicking on timestamps should still work
and should jump on all surfaces"* · *"they need to be consistent on all surfaces, including with
the grouping feature."*

**Why now.** `/stake/aisafety1` is the reading surface for the 2026-09-18 event
(`docs/events/aisafety1-source-material.md`), and the event's own link needs `?tab=stories`.

## Appetite

Blast radius: **high**. Components: `FeedStoryCard`, `FeedPointCard`, `StoryCardFull`
(profile-private), `StoryVideoQuotes` (six call sites), `QuotedPointCard` (two small fixes), plus
two new shared pieces (`groupBySource` and `SourceGroup`, item 7). Pages: `/feed`, `/stake/:tag`,
`/p/:slug`. Tests: **1,614 lines bind to the feed cards**, two suites asserting on source text,
and **nine suites pin the quotes section's current wording or shape** (`p1141-*`, `p1212-*`,
`p1259-seek-before-ready`, `p1270-profile-story-media`, `e2e/p1141-story-video.spec.ts`) —
budget for all of them. Reversibility: high, no migration. Decision density: all product calls
made; one sequencing call open (Open Questions). Deadline: 2026-09-18.

## Solution

**1. One footer on every story and point list card — feed, stake, profile.**

Same controls, same order, same behaviour on all three surfaces; padding follows each card's own
column (the profile keeps its avatar-column `sm:pl-[68px]`, the feed its `px-4`).

- **Left:** expand chevron + count (`N points` / `N stories`; `0 points` stays, founder
  2026-09-10).
- **Right, in this order:** owner actions where they exist (profile only: edit, delete), then
  share, then open-in-new.
- **Share is one behaviour everywhere:** copy the link, toast, fire an analytics event naming the
  surface. `feed_card_shared` must keep firing from the feed (`feed-point-card.tsx:230`,
  `feed-story-card.tsx:318`) — lifting the control moves the tracking line with it. The profile
  story card's `ShareButton` (modal, no event) is replaced by this behaviour.
- **Open-in-new on every card.** Not redundant: the footer row stops propagation
  (`feed-story-card.tsx:342`), so it is the one band where the card-click is dead.
- **Base shape:** `feed-story-card`'s own row — `border-t border-border py-2.5`, theme tokens
  only. `feed-point-card` gains the row (a new row, not a moved one); lifting share out of
  `PositionButtons` is the focus-order risk below.
- **Touch targets 44px** on the icons (`min-w-11 min-h-11`, the profile's existing size).
- **Inside a group every card keeps this footer unchanged.** A group removes a player, never a
  card's controls.

**2. `/stake` renders the footer on BOTH tabs** (founder, 2026-09-10). Wire the existing batch
fetchers `getPointsForStories` / `getStoriesForPoints` (`stories-service.interface.ts:83,123`)
exactly as `feed-page.tsx:510-525` does. No new query.

**3. `/stake` passes `currentUserId`.**

**4. `?tab=` selects the tab on `/stake`, as it already does on `/feed`.** `/feed` has read
`?tab=stories` since P491 (`feed-page.tsx:60`, pinned by `p491-hashtag-feed.test.tsx:339`) —
keep it. `/stake` derives its tab from the URL the same way, with three constraints:

- **Keep the guard at `stake-page.tsx:119-121`** that forces Points when the tab bar is hidden;
  `/stake/cmp7?tab=stories` (Points-only tag) must still open on Points.
- **Preserve `?event=`** (`event-links.ts:89` builds `/stake/:tag?event=<slug>`); a bare
  `setSearchParams({ tab })` drops it.
- **Tab switches use `replace: true`**, or the back CTA walks the reader through their own tab
  switches.

**5. `/stake` gains a bottom "Go back" CTA** (founder's label, 2026-09-10), mirroring
`handleBack` (`stake-page.tsx:141-144`). Not "Back to the feed": `handleBack` returns to the
previous page and only falls back to `/feed` on a cold arrival.

**6. Story text: `text-base` everywhere, and the "show more" clamp raised to 30 lines.**

- Feed/stake story cards move to `text-base` (P500's live item; close P500 after this). Point
  card statement follows (`feed-point-card.tsx:186`).
- Clamp **30 lines** on the three list cards: `FeedStoryCard` 18 → 30, `StoryCardFull` 24 → 30.
  30 = 18 × 1.67, the top of the founder's "50–70% more".
- Measured 2026-09-11 by rendering the eight real `aisafety1` bodies (499–807 chars) at
  16px/24px: 18–28 lines at a 239px column (conservative for 375px — the real column is wider),
  21–34 lines at 199px (320px, ungrouped). **All 8 show in full at 375px; 7 of 8 at 320px.**
- Keep the arbitrary-value form `line-clamp-[30]` — Tailwind 3.4's scale stops at 6 and a bare
  `line-clamp-30` compiles to nothing (the P1259 trap). "Show more" renders only on measured
  overflow (P1259 change 6, `useTextOverflow`); never a character threshold.
- Out of scope: `StoryCardDetail`'s `compact` clamp (story and doc pages) and the letters/live
  previews — not list cards.

**7. Group stories by source — on `/feed` Stories, `/stake/:tag` Stories, and the profile's
Stories tab** (founder: *"I do like the grouping"*, *"A yes to all three"*).

*What a source is.* A source is one video, identified as `provider:videoId` from the existing
`parseVideoUrl` (`src/lib/video.ts:56`). So every URL form of one video — `watch?v=`, `youtu.be/`,
`/embed/`, `/shorts/`, `/live/`, with or without `&t=` — is one source, and the raw URL string
is never the key. Only YouTube exists today (the host allowlist lives in both `video.ts:39` and
the `stories.video_url` CHECK, migration `20260823120000_p1141_stories_video_reference.sql`).
**Adding a source type later means extending `parseVideoUrl` and the allowlist; grouping follows
with no change of its own.** A story whose URL does not parse, or that has only an image or no
media, is never grouped.

*What gets grouped.* Exactly the stories the page is showing at that moment, after its own
filters. Grouping is a pure function over the rendered list — `groupBySource(stories)` —
recomputed whenever that list changes. It never fetches.

| Surface | List it groups | Filters that change the list | Who can be in one group |
|---|---|---|---|
| `/feed` Stories | the 50 loaded (`FEED_LIMIT`, `feed-page.tsx:28`) | tags, text search, sort — all client-side over the loaded 50 (`:221-229`) | any authors |
| `/stake/:tag` Stories | the 50 loaded for that tag (`STAKE_LIMIT`, `stake-page.tsx:40`) | none | any authors |
| Profile Stories | all of that person's stories | none | one author, by definition |

- **Filtering and search regroup live.** Type in the feed's search and a group keeps only the
  matching stories; if one remains it renders as a plain card; if none, the group disappears.
- **Where a group sits:** at its first story's position in the page's current order (newest- or
  oldest-first); the source's other visible stories join it there. Nothing is re-sorted by
  author or date. This moves cards — accepted with the decision (History, §b).
- **Paging:** none of the three surfaces loads more after the first fetch, so no group can split
  across pages. If load-more is ever added, it must regroup across everything loaded.
- **The heading counts visible stories only** — on the feed a source may have more stories than
  the 50 loaded. Accepted: it describes the list in front of the reader.
- **Points tabs are untouched** — points carry no video.

*What a group looks like* — the reference is the built artifact, `/tree/stake-grouping`, tab
"(b) Group" (commits `293c46780`, `e15068df3`, `37a9e8002`, `91eb5e759` on this branch):

- A tray (`bg-muted`, rounded, bordered), heading **"N stories from this video"** — semibold,
  `text-foreground`, no avatar, no name. The player names the video once it mounts; bylines name
  the people. It reads the same whether one author or several.
- **One player per group**, at the top. Member cards render no media box of their own.
- Stories beneath, **indented under a 2px rule from 640px up; no indent below 640px** — at 320px
  the indent cost 36px and wrapped bylines (History, §d).
- **Two stories shown, the rest behind "Show N more story/stories"** (40px). A source with one
  visible story gets no tray.
- Every member card keeps its full footer (item 1), its folded quotes (item 8), its points.

*Timestamps inside a group* drive the group's player — never a second copy of the same video.

*Build shape.* `groupBySource` (pure, unit-tested: key parsing, first-appearance order, singles,
unparseable URLs, a search that leaves one story) and `SourceGroup` (tray, heading, player, cap)
taking the card as a render prop, so `FeedStoryCard` and `StoryCardFull` both sit inside it
unchanged in shape. `FeedStoryCard`'s artifact prop `sourceCollapsed.onSeek` becomes the real
hand-off; `StoryCardFull` gains the same. The artifact's variant (a) and its `expandLabel`
control are removed. **Delete `/tree/stake-grouping` and `aisafety1-fixture.ts` in the build's
last commit, after UAT sign-off** — root `/tree/*` explorations are throwaway
(`.claude/rules/src.md:138`); until then it is the side-by-side reference.

**8. Supporting quotes are folded by default, on every surface.**

The fold moves **into `StoryVideoQuotes`** — its heading becomes the toggle: chevron + **"N
supporting quotes"**, 40px, `aria-expanded`. All six call sites inherit it with no per-card
toggle: `FeedStoryCard` (feed, stake), `StoryCardFull` (profile), `PointCardWithLinks` (profile
points, point page), `StoryCardWithLinks` (story and point pages), `StoryCardDetail` (story and
doc pages), `LiveStoryCardExpanded` (live sessions, letters). The subject's name leaves the
heading on every surface — the byline above already names the person (founder: *"not sure we
need the name of person again here? redundant?"*).

- No surface is exempt. Live sessions and letters were considered: the quotes there are evidence
  for the story, not the story being explained, and the fold announces their count.
- The artifact's `quotesCollapsed` (card) and `showHeading` (quotes) props are removed — the
  behaviour is the component's own now.

**9. Timestamps jump to the right second on every surface.** Measured per call site 2026-09-11:

| Surface | What it shows | A timestamp click |
|---|---|---|
| `FeedStoryCard`, `StoryCardFull`, `PointCardWithLinks`, `StoryCardDetail` | a player | seeks and plays **in place** from that second |
| inside a group | the group's player | seeks and plays the group's player |
| `StoryCardWithLinks`, `LiveStoryCardExpanded` | a thumbnail only (`story-card-with-links.tsx:409`, `live-story-card-expanded.tsx:292`) | opens the video **at that second** in a new tab — deliberate, kept |
| any surface whose player is blocked (`playerBlocked`) | fallback | opens at that second in a new tab |

Testing note: against `npm run dev`, React StrictMode drops the FIRST seek on a player that has
not mounted yet (History, §c). Production is unaffected. Do not file it as a bug.

**10. Two small `QuotedPointCard` fixes found by visual QA.** Its stance row (`flex`, no wrap)
pushes the "Disagrees+" badge to the card border when the column is narrow — add `flex-wrap`.
Its grey tag measures 4.40:1 against its background — raise it to pass AA (4.5:1).

**Invariant.** Quotes and timestamps are never REMOVED from any card; they may be folded behind
a control stating their count. The timestamp is the falsifiability hook; the embed is convenience.
Hiding a repeated *player* is dedup; deleting repeated *quotes* is not.

## Alternatives Considered

**Rejected: adopt `PointCardWithLinks` on feed and stake.** It renders on two production surfaces,
not six; its story expansion is gated on `liveSessionMode || profileOwner || isEmbed` (`:642-645`)
so it would render a dead chevron (P1282); it would revert P1212's aria-label and keydown guard and
P1270's feed-only `authorPosition`; its `ShareButton` fires no analytics. The feed cards are the
better base.

**Rejected: extract a shared CARD component.** P500 rejected it in March and it still holds —
`StoryCardFull` is an owner-editing surface. The two new shared pieces in item 7 are a list
transform and a wrapper, not a card.

**Rejected: (a) collapse repeats** — keep list order, fold a repeat's player behind "Same video as
above — show it here". Built and verified in the artifact; the founder chose (b) on seeing both.
It kept order and moved nothing, which is its one advantage; recorded so it is not re-proposed as
new.

**Rejected: collapse-by-default for cards.** A no-op — cards already collapse, and
`useLazyStoryPlayer` already prevents the video pile off-screen.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| 1,614 test lines on the feed cards + 9 suites pinning the quotes section | MITIGATE | Rewrite assertions to the new behaviour deliberately; never to make a red suite green |
| Lifting share out of `PositionButtons` disturbs focus order | MITIGATE | Tab through every footer on every surface; `decisions.md` 2026-05-20 [technical] records a prior defect in this row |
| Replacing the profile's `ShareButton` | MITIGATE | Owner edit/delete stay; check the profile's owner flows still work after the swap |
| A regroup (search, tag, sort) remounts a group's player | ACCEPT | Key groups by source key so a group that survives a filter keeps its player |
| Heading counts loaded stories, not all stories of a source | ACCEPT | The list's own limit |
| StrictMode drops a first pre-mount seek in dev | ACCEPT | Dev-only; see item 9 |
| Dark mode | ACCEPT | Dormant; keep `dark:` usage at 0 in touched cards |
| Deadline 2026-09-18 against this scope | OPEN | See Open Questions |

**Non-Goals**
- Do NOT adopt `PointCardWithLinks` on feed/stake, and do NOT extract a shared card.
- Do NOT delete `stake-page.tsx:119-121` or change the tab-visibility rule (`:111-121`).
- Do NOT change `?expanded=true`.
- Do NOT remove quotes or timestamps anywhere.
- Do NOT give the thumbnail-only surfaces (`StoryCardWithLinks`, `LiveStoryCardExpanded`) a player.
- Do NOT change `StoryCardDetail`'s `compact` clamp or the letters/live previews.
- Do NOT move the profile's stance-above-point layout (P1270, founder: *"profile stay same"*).

## Done-When

Artifact phase (done)
- [x] Artifacts for (a) and (b) on real `aisafety1` data — `/tree/stake-grouping`, real `FeedStoryCard`, prod snapshot
- [x] Fold reversible, quotes fold, timecode opens and plays, groups indented and capped — Chrome
- [x] Founder chose (b) group by source, 2026-09-11
- [x] Heading reduced to a count, name dropped from the quotes toggle, stance restored — Chrome, 1280/375/320

Footer and `/stake`
- [ ] Story and point cards on `/feed`, `/stake` and the profile show one footer: count left; owner actions (profile), share, open-in-new right; 44px icons
- [ ] Share copies, toasts and fires an analytics event on every surface; `feed_card_shared` still fires from the feed
- [ ] `/stake` shows the footer on both tabs and passes `currentUserId` (interactive position controls)
- [ ] `/stake/aisafety1?tab=stories` opens on Stories — the event's exact link; `/stake/cmp7?tab=stories` opens on Points
- [ ] `/feed?tab=stories` still opens on Stories
- [ ] **A new test** asserts `?event=` survives a tab switch on `/stake` (`p1179` checks arrival only)
- [ ] Tab switches add no history entries; "Go back" after two switches leaves the page
- [ ] "Go back" is reachable at the bottom of `/stake/:tag`

Text
- [ ] Feed/stake/profile story bodies are `text-base`, clamped at 30 lines, "show more" only on measured overflow; P500 closed

Grouping
- [ ] `groupBySource` unit tests: every YouTube URL form of one id groups; two ids do not; unparseable/imageless stories stay single; first-appearance order under both sorts
- [ ] Groups render on `/feed` Stories, `/stake/:tag` Stories and the profile Stories tab with one player each, heading "N stories from this video", cap 2 + "Show N more"
- [ ] Feed search and tag filters regroup live; a group left with one story renders as a plain card
- [ ] No indent below 640px; no horizontal overflow and one-line bylines at 320px
- [ ] Every card inside a group keeps its full footer and points
- [ ] `/tree/stake-grouping` and its fixture deleted after UAT sign-off

Quotes and timestamps
- [ ] Quotes folded by default on all six `StoryVideoQuotes` surfaces, toggle "N supporting quotes", 40px
- [ ] A timestamp plays in place on `FeedStoryCard`, `StoryCardFull`, `PointCardWithLinks`, `StoryCardDetail`, and drives the group player inside a group — checked in a production build, not the dev server
- [ ] On `StoryCardWithLinks` and `LiveStoryCardExpanded` a timestamp opens the video at that second
- [ ] `QuotedPointCard` stance row wraps at 320px; its tag passes AA

Across all of it
- [ ] Screenshots at desktop, 375px and 320px on feed, stake and profile, before and after
- [ ] Footer focus order verified by keyboard on each surface
- [ ] No console errors on feed, stake or profile

## Open Questions

1. **Sequencing against 2026-09-18.** The event needs `/stake/aisafety1?tab=stories` to open on
   Stories on prod by then; it does not strictly need grouping, folded quotes or the footer.
   `[FOUNDER DECISION: one build shipped together, or the /stake navigation items (3, 4, 5) first
   as their own ship]`

## Related

- **P500** — `text-base` and tab counts; closed by item 6.
- **P491** — `/feed?tab=stories`, the behaviour `/stake` adopts.
- **P1141** — the video reference, host allowlist, supporting quotes.
- **P1212** — feed-card a11y fixes and quotes on every surface.
- **P1259** — lazy player, pre-mount seek, measured "show more" (no character threshold).
- **P1270** — the story author's stance on a point (`profileSubjectPosition`).
- **Clarity Night, 2026-09-18** — test DB event `ai-safety-disagreement-sanders-lecun-bengio-leahy-2026-09-18`, links `/stake/aisafety1?tab=stories`.
- **`docs/events/aisafety1-source-material.md`** — why `/stake/aisafety1` matters.
- **`/tree/stake-grouping`** — the grouping reference, until deleted by this build.

## History

**§a Drafts 1–3.** Draft 1 called the footer a styling drift on shared components; draft 2 said
adopt `PointCardWithLinks`. Both adversarial reviews returned VERDICT: No on those premises; both
premises were falsified by command (Alternatives). Draft 3 aligned the feed cards in place.

**§b Three artifact passes on repeat sources.** Pass 1 faked the fold with CSS; the founder
rejected it: *"how do I uncollapse it?"* · *"if we collapse, we collapse both"* · *"I click on
that quote it doesn't work — I mean on the timestamp"* · *"if it's group, then it has to look like
a group"* · *"show more stories... otherwise people just scroll and scroll"*. Pass 2 built all of
that into the real card behind opt-in props. The founder chose (b): *"I do like the grouping"*.
Grouping reorders — on `/stake/aisafety1` oldest-first it moves five cards to gather Leahy's
three — and that cost was accepted with the choice. Pass 3 applied three annotated screenshots:
the heading became a count (*"too much text that is not needed?"*), the quotes toggle lost the
name, and a missing stance turned out to be the snapshot's defect — prod `point_positions` carries
a stance on all eight links, and `/feed` already renders it (P1270).

**§c Correction — the "dead timecode".** Recorded on 2026-09-10 as `useLazyStoryPlayer`
swallowing a seek. Wrong: measured with probes, the hook dispatches correctly and the chain plays
end to end. React StrictMode's dev-only double-invoke clears `StoryVideoPlayer`'s pending seek
before YouTube's `onReady`; with StrictMode removed the same click played from 44:52.

**§d Visual QA of pass 3 — 1 of 1 reviewer reported**, screenshots and checklist only; every
claim re-measured before acting. Fixed: the 36px phone indent that wrapped bylines (66px vs 44px)
and pushed the stance badge to the border; the invisible tray (`bg-muted/30`, ~1.03:1) and
metadata-grey heading; the "from this source"/"from this video" mismatch. Rejected: a "black
video box" that was a lazy thumbnail not yet loaded in a full-page capture. Pre-existing, now
item 10: the stance row cannot wrap; the tag is 4.40:1.

## Review

Reviews 1 and 2: 1 of 1 reviewer reporting each, both VERDICT: No, on premises this spec no longer
holds. The second had no browser check, which is why every visual Done-When item requires
screenshots. **This fourth draft: Fable review requested by the founder, 2026-09-11 — pending.**
