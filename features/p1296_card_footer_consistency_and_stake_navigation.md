---
status: week
type: task
rank: 91
workstream: E1
created_date: '2026-09-10'
tags: [feed, stake, profile, cards, consistency, grouping, event-prep]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, adversarial-review, create-spec.2, adversarial-review.2, create-spec.3, create-spec.4, adversarial-review.3, create-spec.5]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1296: One card behaviour on feed, stake and profile — and a /stake you can link to and leave

> **Fifth draft, 2026-09-11** — the fourth draft with all 17 findings of its Fable review applied
> after each was re-verified by command (see Review). Drafts 1–3 were a footer-alignment spec;
> three artifact passes and the founder's decisions since then made it a card-consistency spec
> across three surfaces, written as one build spec rather than accreted. What was tried, rejected and corrected on the
> way is in **History** at the bottom — read it before re-opening any decision.

## Problem

**Situation.** The same story renders differently depending on where it is met, and `/stake` —
the page an event links people to — cannot be linked to a tab or left from the bottom.

**Complication.** Seven defects, measured:

- **The footer drifts by surface.** On feed story cards the share control floats above the
  divider. `feed-point-card` has no footer row at all — its share sits in the `PositionButtons`
  row (`:212-240`). The profile's story footer carries the owner's `+ Add point` CTA (P580,
  `profile-page-v2.tsx:1724`), edit, delete, and a `ShareButton`, and has no open-in-new icon.
  The profile's POINT cards are `PointCardWithLinks` (`profile-page-v2.tsx:1201`): stories count
  left, then `ShareButton`, then open-in-new. `ShareButton` opens `ShareDialog` — copy link plus an
  embed code, with the profile owner's position carried in the embed (`?from=`,
  `ShareDialog.tsx:27`) — and fires no analytics.
- **`/stake` renders no footer.** Both feed cards gate the footer on a prop `/stake` never
  passes: `feed-story-card.tsx:438` on `linkedPoints`, `feed-point-card.tsx:251` on
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
(profile-private), `PointCardWithLinks` (its footer, in list context only — item 1),
`StoryVideoQuotes` (six call sites), `QuotedPointCard` (two small fixes), plus two new shared
pieces (`groupBySource` and `SourceGroup`, item 7). Pages: `/feed`, `/stake/:tag`, `/p/:slug`.
Tests: **3,486 lines across 11 files bind to the feed cards** (counted 2026-09-11), including the
three `p1179-*` stake suites and `p1259-clamp-classes-compile.test.ts`, which pins the clamp
values literally; and **nine suites pin the quotes section's current wording or shape**
(`p1141-*`, `p1212-*`, `p1259-seek-before-ready`, `p1270-profile-story-media`,
`e2e/p1141-story-video.spec.ts`) — budget for all of them. The branch is 23 commits behind `main`
(none touch these files): rebase before `/dev`. Reversibility: high, no migration. Decision density: all product calls
made; one sequencing call open (Open Questions). Deadline: 2026-09-18.

## Solution

**1. One footer on every story and point list card — feed, stake, profile.**

Same controls, same order, same behaviour on all three surfaces; padding follows each card's own
column (the profile keeps its avatar-column `sm:pl-[68px]`, the feed its `px-4`).

Cards in scope: `FeedStoryCard` and `FeedPointCard` (feed, stake), `StoryCardFull` (profile
stories), and `PointCardWithLinks` **in its profile list context only** — the same component is
the point page's own detail card (`isDetailView`), which keeps its current footer.

- **Left:** expand chevron + count (`N points` / `N stories`; `0 points` stays, founder
  2026-09-10).
- **Right, in this order:** owner actions where they exist (profile only: `+ Add point` — P580,
  kept —, edit, delete), then share, then open-in-new.
- **Share looks and sits the same on every card**; what it DOES is Open Question 2. Whatever the
  answer, it fires an analytics event on every surface: `feed_card_shared` keeps firing from the
  feed (`feed-point-card.tsx:230`, `feed-story-card.tsx:418`) and gains a `surface` property
  (`feed` | `stake` | `profile`), documented in `docs/technical/analytics.md` (today: `type`, `id`
  only, `:732-738`). Lifting the control moves the tracking line with it.
- **Open-in-new on every card.** Not redundant: the footer row stops propagation
  (`feed-story-card.tsx:442`), so it is the one band where the card-click is dead.
- **Base shape:** `feed-story-card`'s own row — `border-t border-border py-2.5`, theme tokens
  only. `feed-point-card` gains the row (a new row, not a moved one); lifting share out of
  `PositionButtons` is the focus-order risk below.
- **Touch targets 44px** on the icons (`min-w-11 min-h-11`, the profile's existing size).
- **Inside a group every card keeps this footer unchanged.** A group removes a player, never a
  card's controls.

**2. `/stake` renders the footer on BOTH tabs** (founder, 2026-09-10). Wire the existing batch
fetchers `getPointsForStories` / `getStoriesForPoints` (`stories-service.interface.ts:83,123`)
exactly as `feed-page.tsx:510-525` does. No new query. Two constraints:

- **The list is still fetched once and the skeleton never returns.** `p1179-no-refetch-on-position`
  asserts exactly one list fetch and no skeleton after the first load. Key the linked-items effect
  on the loaded id lists, never on `loading`, and never set `loading` for it.
- **The three `p1179-*` suites mock `storiesService` with `getPublicStoriesFeed` only**
  (`p1179-stake-surface:22`, `p1179-no-refetch-on-position:21`, `p1179-links-menu:43`). Add the two
  fetchers to those mocks; do not weaken an assertion to get past the missing function.

**3. `/stake` passes `currentUserId`.**

**4. `?tab=` selects the tab on `/stake`, as it already does on `/feed`.** `/feed` has read
`?tab=stories` since P491 (`feed-page.tsx:60`) — keep it, and add the test it never had:
`p491-hashtag-feed.test.tsx:339` is a commented-out TODO ending in `expect(true).toBe(true)`.
`/stake` derives its tab from the URL, with four constraints:

- **The tab is a pure derivation, never a write:** `activeTab = showTabs ? urlTab : 'points'`.
  Today's guard (`stake-page.tsx:119-121`) is an effect that SETS the tab to Points whenever
  `showTabs` is false — and `showTabs` is false while loading, because both lists are still empty.
  Ported as a URL write, it would strip `?tab=stories` from the event's link before the data
  arrives and the page would open on Points anyway. Replace the effect with the derivation; the
  behaviour it protects stays: `/stake/cmp7?tab=stories` (Points-only tag) opens on Points.
- **Preserve `?event=`** (`event-links.ts:89` builds `/stake/:tag?event=<slug>`) and every other
  param: update from the current params, never `setSearchParams({ tab })`.
- **Tab switches use `replace: true`**, or the back CTA walks the reader through their own tab
  switches.
- **`replace: true` breaks today's cold-arrival test** — see item 5.

**5. `/stake` gains a bottom "Go back" CTA** (founder's label, 2026-09-10), using `handleBack`
(`stake-page.tsx:141-144`). Not "Back to the feed": `handleBack` returns to the previous page and
only falls back to `/feed` on a cold arrival. Two constraints:

- **Detect the cold arrival by history position, not by `location.key`.** `handleBack` tests
  `location.key === 'default'`, but react-router (7.13) mints a new key on every navigation,
  `replace` included, while keeping the history index in `history.state` (`idx`, preserved by
  its `replaceState`). So with item 4, a reader who opens the event link cold, switches a tab, then
  taps "Go back" gets `navigate(-1)` — out of the app. Use `window.history.state?.idx === 0`, or
  capture the cold arrival once at mount. The header back button shares the handler and the fix.
- **Two "Go back" controls, two distinct accessible names**, each containing the visible words
  "Go back" (label-in-name). `p1179-stake-surface.test.tsx:141,153,166` find the header button by
  `/go back/i` and would throw on two matches: target each by its own name and assert both. Never
  repair it with `findAllByRole(...)[0]`, which would hide which button was tested.

**6. Story text: `text-base` everywhere, and the "show more" clamp raised to 30 lines.**

- Feed/stake story cards move to `text-base`. Point card statement follows
  (`feed-point-card.tsx:186`).
- **Tab labels show counts** — "Points (N)" / "Stories (N)" on `/feed` (P500's other open
  acceptance criterion, `p500_feed_card_harmonization.md:46`) and on `/stake`, matching the
  profile's existing pattern. With both, close P500.
- Clamp **30 lines** on the three list cards: `FeedStoryCard` 18 → 30, `StoryCardFull` 24 → 30.
  30 = 18 × 1.67, the top of the founder's "50–70% more". `p1259-clamp-classes-compile.test.ts:128-129`
  pins `[24]` and `[18]` literally — update both to `[30]`.
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
| `/feed` Stories | the 50 loaded (`FEED_LIMIT`, `feed-page.tsx:28`) | text search filters the loaded 50 client-side (`:221-229`); tags and sort REFETCH from the server behind the skeleton (`:119-145`, `:461`), and the new list is regrouped | any authors |
| `/stake/:tag` Stories | the 50 loaded for that tag (`STAKE_LIMIT`, `stake-page.tsx:40`) | none | any authors |
| Profile Stories | all of that person's stories | none | one author, by definition |

- **Filtering and search regroup.** Type in the feed's search and a group keeps only the
  matching stories; if one remains it renders as a plain card; if none, the group disappears. A
  tag or sort change refetches and regroups the new list.
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
supporting quotes"**, 40px, `aria-expanded`. N is the number of quotes that surface renders —
live sessions and letters render only the quotes not already in the story text
(`live-story-card-expanded.tsx:143`), so their N can be smaller than the stored count. All six call sites inherit it with no per-card
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
| 3,486 test lines across 11 files on the feed cards + 9 suites pinning the quotes section | MITIGATE | Rewrite assertions to the new behaviour deliberately; never to make a red suite green |
| Lifting share out of `PositionButtons` disturbs focus order | MITIGATE | Tab through every footer on every surface; `decisions.md` 2026-05-20 [technical] records a prior defect in this row |
| Changing the profile's footer | MITIGATE | `+ Add point`, edit and delete stay; check the owner flows after the change. What share does there is Open Question 2 |
| A regroup remounts a group's player | ACCEPT | Search is client-side: key groups by source key so a group that survives a search keeps its player. Tag and sort refetch behind the skeleton and remount everything anyway |
| Heading counts loaded stories, not all stories of a source | ACCEPT | The list's own limit |
| StrictMode drops a first pre-mount seek in dev | ACCEPT | Dev-only; see item 9 |
| Dark mode | ACCEPT | Dormant. Add no new `dark:` classes (the feed cards have 0; `story-video-quotes.tsx` already has 4 and `quoted-point-card.tsx` 1 — leave those) |
| Deadline 2026-09-18 against this scope | OPEN | See Open Questions |

**Non-Goals**
- Do NOT adopt `PointCardWithLinks` on feed/stake, and do NOT extract a shared card.
- Do NOT drop the Points-only fallback `stake-page.tsx:119-121` implements (it becomes a
  derivation, item 4), and do NOT change the tab-visibility rule (`:111-117`).
- Do NOT change `PointCardWithLinks` in its detail view (the point page) — list context only.
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
- [ ] Story and point cards on `/feed`, `/stake` and the profile (lists) show one footer: count left; owner actions (profile: `+ Add point`, edit, delete), share, open-in-new right; 44px icons
- [ ] Share behaves as decided in Open Question 2 on every card, and fires `feed_card_shared` with `surface` on every surface; `docs/technical/analytics.md` documents `surface`
- [ ] `/stake` shows the footer on both tabs and passes `currentUserId`; the list is still fetched once and the skeleton never returns (`p1179-no-refetch-on-position` green without weakening)
- [ ] `/stake/aisafety1?tab=stories` opens on Stories — the event's exact link — and `?tab=stories` is still in the URL after the data loads; `/stake/cmp7?tab=stories` opens on Points
- [ ] **A new test** opens `/feed?tab=stories` and asserts the Stories tab is selected (replacing the TODO at `p491-hashtag-feed.test.tsx:339`)
- [ ] **A new test** asserts `?event=` survives a tab switch on `/stake` (`p1179` checks arrival only)
- [ ] Tab switches add no history entries
- [ ] **Cold arrival** (fresh tab on the event link) → switch tabs twice → "Go back" lands on `/feed`, not outside the app; **warm arrival** (came from another page) → "Go back" returns to it. Both for the header button and the bottom CTA
- [ ] "Go back" is reachable at the bottom of `/stake/:tag`; the two back controls have distinct accessible names, and `p1179-stake-surface` asserts each by its own name

Text
- [ ] Feed/stake/profile story bodies are `text-base`, clamped at 30 lines (`p1259-clamp-classes-compile` updated to `[30]`), "show more" only on measured overflow
- [ ] `/feed` and `/stake` tab labels show counts; P500 closed

Grouping
- [ ] `groupBySource` unit tests: every YouTube URL form of one id groups; two ids do not; unparseable/imageless stories stay single; first-appearance order under both sorts
- [ ] Groups render on `/feed` Stories, `/stake/:tag` Stories and the profile Stories tab with one player each, heading "N stories from this video", cap 2 + "Show N more"
- [ ] Feed search and tag filters regroup live; a group left with one story renders as a plain card
- [ ] No indent below 640px; no horizontal overflow and one-line bylines at 320px
- [ ] Every card inside a group keeps its full footer and points
- [ ] `/tree/stake-grouping` and its fixture deleted after UAT sign-off

Quotes and timestamps
- [ ] Quotes folded by default on all six `StoryVideoQuotes` surfaces, toggle "N supporting quotes" (N = quotes rendered there), 40px
- [ ] A timestamp plays in place on `FeedStoryCard`, `StoryCardFull`, `PointCardWithLinks`, `StoryCardDetail`, and drives the group player inside a group — checked in a production build, not the dev server
- [ ] On `StoryCardWithLinks` and `LiveStoryCardExpanded` a timestamp opens the video at that second
- [ ] `QuotedPointCard` stance row wraps at 320px; its tag passes AA

Across all of it
- [ ] Screenshots at desktop, 375px and 320px on feed, stake and profile, before and after
- [ ] Footer focus order verified by keyboard on each surface
- [ ] No console errors on feed, stake or profile

## Open Questions

1. **Sequencing against 2026-09-18.** The event needs `/stake/aisafety1?tab=stories` to open on
   Stories on prod by then, and "Go back" to work for someone arriving cold from it; it does not
   strictly need grouping, folded quotes or the footer elsewhere. The Fable review found both HIGH
   defects of the fourth draft inside exactly those items (4, 5) and leaned to shipping them first.
   `[FOUNDER DECISION: one build shipped together, or the /stake items (2–5) first as their own
   ship]`
2. **What share does on a card.** Feed cards copy the link in one tap and toast. Profile cards
   open a sheet with the link AND an embed code — for a point, the embed carries the profile
   owner's position. One behaviour on every card means either losing the embed from profile cards
   (it stays on a story's and a point's own page) or adding a sheet step to every feed share.
   `[FOUNDER DECISION: one-tap copy on every card, embed from the item's own page — or the sheet
   on every card]`

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
screenshots.

**Review 3 — Fable, requested by the founder, 2026-09-11. 1 of 1 reviewer reported: 17 findings,
VERDICT: Not ready.** Every finding was re-verified by command before it changed this spec; all 17
held, two with corrections (the profile's point card DOES show a count when it has stories; the
branch is 23 commits behind `main`, not 19). Applied: the tab guard as a pure derivation and the
history-position cold-arrival test (the two HIGHs in items 4–5); distinct back-control names;
the `p1179` mocks and no-refetch constraint; `PointCardWithLinks` in list context; `+ Add point`
kept; the feed filter table corrected (tags and sort refetch); tab counts restored (dropped by the
fourth draft in error); the clamp test named; N defined; `surface` on the share event; test count
3,486/11; branch line citations; the `dark:` wording; the rebase. Two findings are product calls
and are Open Questions 1 and 2.
