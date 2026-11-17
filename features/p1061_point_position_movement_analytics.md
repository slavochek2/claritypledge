---
status: qa
type: story
disclosure: public
rank: 344
created_date: '2026-08-13'
tags: [recognition-chain, points, positions, stories]
delivery_stage: dev
pipeline_ran: [create-spec, create-spec.2, dev]
exec_model: opus
exec_effort: high
driver: heuristic
spec_review_hash: f50027bb28dfc17e28e3050d993fe156aed70e6f2ef8869e8e122b78cfd4b356
spec_review_vendors: [codex, gemini, openrouter]
---

# P1061: Show position movement on a point or story

> **Whose intention this serves:** [p1055](p1055_norm_measurement_instrument.md) §Intention owns it. In short: make visible whether people's positions move, and whether they move more after their understanding of a story was verified.

## Problem

**Situation:** Every saved position change is recorded (`point_position_history`, written by a trigger on `point_positions` since `20260204_stories_points_calibration.sql`) and readable for public points. Nothing displays it. On production's public points (read 2026-11-17, people still holding a position, the 10 agent accounts excluded, which changes none of these numbers): 49 points have history; 36 have at least one person whose latest position differs from their first, 74 such changes by 26 people, 10 of them across sides; 21 more changed and came back to where they started.

**Complication:** The product's claim is that verified understanding changes what people do with a position. Without a view of movement, neither the founder nor anyone else can see whether that happens. A design was explored over six rounds as P1683 (dev-only prototype `/tree/story-positions`, invented data) and the founder approved it:

> "reflect on the last version. I do like it a lot. So how do we create a spec out of that? Because I want to implement it now for our stories and points."

**Question:** Build the approved design on real stories and points: one count on a story, arrows on each of its linked points, a comparison panel behind the count, and a "Changes" view on the point page.

## Appetite

- **Blast radius: medium.** No schema change and no new write, but it touches three heavily used surfaces (feed story card, story page, point page), shows by name who changed their mind, and needs one new read that must respect today's visibility rules.
- **Reversibility: high.** The added read function can be dropped; the UI additions can be removed.
- **Decision density: settled.** All product decisions are made (below). Remaining choices are `/dev`'s, bounded by the Definitions and Invariants.

## Decisions already made

- [decisions.md](../docs/decisions.md) 2026-11-16 [product] "A story carries one count of verified people who moved; where and how they moved belongs to the point (P1683 exploration)": story names nobody; one count on the story; arrows only on a single point; least text, explanations behind info buttons; the word "people", never "readers"; "verified" = the author rated the explain-back exactly 10; a person can be verified on several stories, each a line in their log with the story linked; no narrated notes, no ratings; filter by people, events, groups and dates, no place; one column; linked points keep their look and links; no white buttons.
- [decisions.md](../docs/decisions.md) 2026-11-17 [product] "Position movement is built now for stories and points, ahead of the recognition chain": "moved" = any change of position; the point page names who changed; the verified against not-verified comparison stays, not-verified withheld under 5; the prototype's words ship as seen, except three sentences corrected minimally (UI Contract); a verified person who kept their position counts as "same" in the bars. This narrows 2026-11-01 [product] (3): the canvas half of P1061 still comes with [P1574](p1574_canvas_partner_story_requests.md)'s link and is not part of this build.

## Definitions (the counting rules)

Every rule below is a test case in Done-When. Positions are on the 7-level scale; "toward agree" is higher.

- **Point.** Each point version is its own point row (`points.superseded_by`), and positions belong to that row. A story's points are the linked points its story page shows the viewer today.
- **Holder:** a person whose current position on the point is not removed. **Every count on this page counts holders only.** A person who removed their position is not counted anywhere (see Risks).
- **A person's positions on a point:** their non-null history rows for it, ordered by `changed_at`. Removal rows (`position` NULL) are skipped. A row whose position equals the previous non-null position (a reasoning-only edit, or removing and re-taking the same position) is not a new position. Ties on `changed_at` (one transaction) are ordered by row id, which is arbitrary; the app never writes two positions for one person and point in one transaction, and tests seed distinct timestamps.
- **First / latest, no dates:** the earliest position / the current position.
- **First / latest, with dates** (point page filter only): the first / last of the person's positions taken inside the dates. A person needs at least two positions inside the dates to be listed; with fewer they drop out of the dated view.
- **Verification of a person by a story:** a `story_verifications` row for that story with `source = 'live'`, `speaker_id` = the story's author, `listener_id` not null and not the author, and `accuracy_achieved` true (rated exactly 10, `20260218_p272_accuracy_achieved_threshold.sql`). Rows for the same story and listener count once, from the earliest. Stories by agent accounts are left out entirely.
- **Explained back, not verified:** a person with a row meeting the same conditions except that `speaker_rating` is below 10 or not yet given, and no verification from that story. Their "before" is taken at their earliest such row.
- **Before:** the person's position at the moment of that row (the last history row at or before its `created_at`). If that row is a removal, or there is none, there is no "before" and the person is not counted on that point.
- **Story change on a point** (used only by the story's bars, arrows and count): before → latest, for every person in the two groups above who holds a position on the point and has a "before", **including people who have not changed their position since** (they count as Same).
- **Moved:** latest ≠ before. **Arrows:** ← latest lower than before, → latest higher.
- **Switched sides:** before and latest on opposite sides (agree side against disagree side; Unsure is on neither). **Other change:** any other difference. **Same:** no difference, including people who changed and came back.
- **Story count "N moved":** distinct verified people who moved on at least one of the story's points. The explanation's "of the M people {author} verified" counts every verified person by the rule above, holder or not.
- **Point page "first and latest"** (the chart, the change filter, the list): first → latest as defined above for each listed holder. It has nothing to do with "before", which belongs to stories.
- **Agent accounts** (`agent_accounts`, readable by anyone for `profile_id`) are excluded from every count, bar, arrow and from the Changes list. They stay in today's Positions list and in the point card's spread (below).

## Solution

Build the surfaces as the prototype at branch `feature/p1683-story-fitness-mockups`, commit `f5eacc37b`, shows them (`src/app/tree/story-positions/`: `StoryPageScreen.tsx`, `StoryPanel.tsx`, `PointPageScreen.tsx`, `ChangesBlock.tsx`, `ScopeControl.tsx`, `charts.tsx`, `bits.tsx`, `model.ts`, `scope.ts`, `copy.ts`; read with `git show f5eacc37b:<path>`). The prototype is the reference for look and interaction. Its data layer is invented and is replaced; where its counting differs from the Definitions above (it drops people who took no position since), the Definitions win.

1. **Story card.** Beside the existing "N verified" badge, a chip "N moved", hidden when N is 0 and on agent-authored stories (they show no badge today). It appears where the card appears in a list of stories (the feed and the stake page) and on a pinned story; the chat cards (`ChatLinkCard`, `AttachmentCard`, `ShareableCard`) do not get it. On a card the chip opens a one-sentence explanation; on the story page it opens the panel.
2. **The panel** (story page). Per story point: its statement, a "Verified" bar and a "Not verified" bar split into switched sides / other change / same, a key with an info button, and Done. The not-verified bar is replaced by "not shown for fewer than 5 people" when that group has fewer than 5 people.
3. **Story points on the story page.** Look and links unchanged. One addition inside each point box: the arrows chip ("← a | b → moved") for the story's verified people on that point, hidden when both are 0, opening a one-sentence explanation.
4. **Point page.** The existing positions block gets a "Positions | Changes" switch.
   - **Positions** is today's block, unchanged, except that an opened "1 story" pill also shows the arrows chip (its verified badge is already there).
   - **Changes** appears only where the viewer can read every holder's history today: on public points, and for a non-public point's first validator. Elsewhere the block is today's Positions list with no switch. It shows holders with at least two positions (first and a later one), agent accounts excluded: the first/latest chart, the filter by change as the prototype has it (toward disagree / same / toward agree, by first → latest), and people by name. Holders with one position are not listed; the chart's explanation already says so. Opening a person shows their positions over time as a graph and, under it, one line per verification from a story the viewer can open: "{author} verified {person}'s understanding of {author}'s story", the story name linking to it (one line per story, from its earliest verification). The dated list of positions is present for screen readers only.
   - **Filter**, on the switch line, visible only while Changes is open: the blue-bordered "Filter" pill opening a dialog with a search over people, events and groups, the dates "When the positions were taken" (From, To), the number of people selected, Reset and Done. Chosen people, events and groups combine as "any of them"; the dates then cut each person's positions to the days chosen, inclusive, in the viewer's time zone. An active filter is spelled out in one line under the switch and tints the pill.
     - **People** offered: the holders listed in Changes.
     - **An event** stands for the people registered for it, at any date (not limited to recent events as the canvas Share list is). **A group** stands for its members.
     - **For a signed-in viewer, an event or a group is offered only when they can already see who is in it today** (for example a public group's members). A private group, whose members even its own members cannot list today, is never offered. Signed-out visitors get people and dates only, although a public group's members are readable to them, to keep one simple rule.
   - **The point card's spread** on the point page shows the first positions (outlined) → today's spread when at least one holder's first position differs from their current one, under the same condition as Changes (the viewer can read every holder's history). Both halves count every holder, agents included, as today's spread does. The filter does not apply to it.
   - **Links:** `?view=changes` opens Changes. `?filter=` keeps applying to Positions only. The Changes filter is not in the address.

**Reads.** One request for the counts of a whole list of stories, not one per card. Recommended: a database function taking story ids and returning, per story, the count, per point the arrows, and (for the panel) the bars. If it runs with elevated rights it must apply the same visibility as today's policies (stories and points the viewer can read, live rows only) and must not exceed them. The point page's Changes data either comes from a function or from paged reads; no read may stop silently at the 1000-row page limit (history on prod is already 842 rows). Counts for a list arrive with that list: the list is shown once both the stories and their counts are in (requested together), so no chip appears after the cards and nothing below moves; returning with Back shows them from the same cache as the cards, without a second fetch (decisions.md 2026-09-29, P1364 list-return cache). A failed read is reported as a failure, never as an empty result (today's `getPositionHistory` returns `[]` on error and cannot be reused as is).

## Invariants

- **No new exposure.** Nothing shown or returned reveals a row, a membership or a point the viewer cannot read today: no letter explain-backs (visible only to their two participants), no history of a point the viewer cannot read, no membership of a group whose members the viewer cannot see. Guest explain-backs (no listener) are left out of every count by the Definitions.
- **The story surfaces name nobody** (2026-11-16 ruling). Names appear only on the point page.
- **The under-5 rule is a display rule.** The not-verified bar never shows a number for fewer than 5 people, in text, bars or accessible labels. It does not hide anything else: for a public story, who explained it back and their rating are readable by anyone today (P586), and this build neither changes that nor claims otherwise.
- **Nothing new is written.** No write to `point_positions`, `points`, `stories`, `story_points` or `story_verifications`, so the P1364 cache-clear rule (decisions.md, "Any new write ... must clear the cache") is not triggered. If `/dev` finds it needs a write, stop and flag it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Showing who changed their mind punishes the behaviour the product wants to make safe | ACCEPT | Founder decision 2026-11-17. Revisit if a person asks to hide their history |
| Story count and arrows are empty at launch: 2 ratings of exactly 10 exist, and no verified person yet holds a position from before | ACCEPT | Hidden at zero. The point page has real data on 36 points |
| Not-verified bar withheld on most stories | ACCEPT | Founder kept the comparison; it fills in with use |
| A person who removes their position after a verification vanishes from the counts, though removing may be the strongest change | DEFER | Prod shows 10 holders who removed and came back; the count of removals that stayed removed is not readable publicly. Revisit with the first story that has 5 verified people |
| "of M people {author} verified" in the story chip's explanation uses this build's population; the "N verified" badge counts every source and speaker | ACCEPT | Both 10-rated rows on prod today are live and author-rated, so the numbers agree; they can differ later |
| Verifying a story's earlier version counts movement on points linked later | ACCEPT | A story is one story to its readers; links rarely change |
| A story point superseded by a new version: positions on the old row and the new row are separate, so movement across the change is not seen | ACCEPT | Versions are rare and each is its own point; the story page already shows the version it links |
| Graph text too small at 320px (prototype: ~8.5px dates, 11px names) | MITIGATE | No graph text under 12px as rendered; long histories scroll inside the graph, the page itself never scrolls sideways |
| A point with hundreds of holders | DEFER | Revisit when a point passes 200 holders |

**Non-Goals**
- Do NOT change how story points look or link on the story page, beyond the arrows chip.
- Do NOT build the canvas half (P1574's link) or show Changes on the canvas's open point; the shared positions block shows "Changes" on the point page only.
- Do NOT change the Contested rule (INBOX-340), the definitions page's threshold wording (INBOX-345), who may read explain-back ratings, or the "N verified" badge.
- Do NOT add a filter by place, names on story surfaces, ratings, narrated notes, or "one position" counts.
- Do NOT claim causation anywhere: the panel compares, it does not say verification caused movement.
- Do NOT add tables or columns.

## Cost Budget

Applies (`docs/technical/metered-services.md`, When this applies): two functions called per request. Sizes measured on TEST: a 20-story feed page's answer is 2,121 bytes; the point with the most history (17 rows) answers 5,490 bytes, about 320 bytes per history row (5,490 / 17).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 1 per list page viewed (`withMovement`: one call for the whole page) + 1 per point page viewed on a public or own-validated point; no timer, no retry loop (Try again is a click) | users per hour x (list pages + point pages per user) | visibility script: 1 SQL request (self-hosted TEST over IAP) x 1 run = 1; unit tests: 0 (mocked) |
| Egress (bytes) | list pages x about 2.1 KB + point pages x about 5.5 KB (at most 320 bytes x history rows on that point; history on prod is 842 rows in all, so a single point stays well under 270 KB) | users per hour x per-user bytes | 1 response of one JSON row, under 2 KB |
| Log lines | 1 per failed read (`throwDbError`), only when a request fails; a refused point read (stale page) also logs 1 | failures per hour x 1 | 0 on a passing run |
| Service unit | none beyond Supabase requests and egress; each call is one SQL statement | none | none |

1. **Fits the plan limit today?** Fits. Supabase Free egress 5 GB a month (registry, read 2026-10-21): monthly bytes = active users x (list pages + 2.6 x point pages per user) x 2.1 KB. At 2.1 KB per list page, 5 GB holds about 2.4 million list page views a month from this read alone (5,000,000 KB / 2.1 KB); read today's usage from the registry row's dashboard before relying on it. Requests are not a Supabase Free limit.
2. **Fits at 10x?** Fits: 10x traffic is 10x these bytes, still far below 2.4 million page views a month at today's scale.
3. **If either answer is no:** not needed. The upgrade, if usage elsewhere ever eats the headroom, is Supabase Pro (from $25 a month, 250 GB egress).

## UI Contract

Words ship exactly as in the prototype at `f5eacc37b` (`copy.ts`, `bits.tsx`, `charts.tsx`, `StoryPanel.tsx`, `ScopeControl.tsx`, `ChangesBlock.tsx`), invented names replaced by real ones, with three corrections (founder, 2026-11-17, "correct them minimally"):

| Where | Prototype | Ships as |
|---|---|---|
| Point arrows explanation (`chipHint`) | "… {s} kept their position." | "… {s} ended where they started." |
| Panel explanation (`strengthHint`) | "Each person is counted from the position they held at the explain-back to their latest one; people who took no position since are not drawn." | "Each person is counted from the position they held at the explain-back to their latest one, also when they have not changed it since." |
| Panel explanation (`strengthHint`) | "The second bar is drawn only for five or more people, so nobody is singled out as not verified." | "The second bar is drawn only for five or more people." |

Other words, unchanged, include "N moved", "Verified", "Not verified", "switched sides", "other change", "same", "Same position", "not shown for fewer than 5 people", "Positions", "Changes", "Filter", "Filter people", "People, events, groups", "When the positions were taken", "From", "To", "Reset", "Done", and the verification line.

- Buttons are filled blue or the blue-bordered pill. The prototype's grey "Reset" becomes the blue-bordered pill; no grey or white outlined action buttons anywhere (visual-qa.md).
- Every control's tap area at least 40px tall at 320, 375 and 1280 wide (the chips keep the prototype's 22px look with a 44px tap area); no horizontal page overflow.
- Blue marks "latest" or a change, never "good".

## UX Notes

- **Empty:** no chip on a story with no verified mover; no arrows on a point with no verified mover; Changes with nobody to list shows "No one here has a position before and after yet".
- **Loading:** a list waits for its counts (Reads); on the story page the chip and arrows appear with the page.
- **Error:** a failed count read shows the cards and the story page without the chip and the arrows (as for zero), is reported to error monitoring, and is never cached as zero, so the next visit asks again. On the point page Positions keeps working and Changes says it could not load, with a retry.
- **Signed out:** everything shows as for a signed-in reader without memberships; the filter offers people and dates.

## Acceptance Criteria

- [x] A story with at least one verified person who moved on one of its points shows "N moved" with the right N, on the feed, the stake page, a pinned story and the story page.
- [x] A story with none shows no chip; an agent-authored story never shows one.
- [x] On the story page, "N moved" opens the panel; each point shows the Verified bar with its parts, including people who kept their position as "same"; the Not verified bar appears only for 5 or more people, otherwise the withheld line.
- [x] Story points on the story page look and link as before; the arrows chip appears only when someone moved.
- [x] On a public point page, Changes lists the holders with at least two positions, never an agent account, and never anyone absent from Positions; on a non-public point, only its first validator sees Changes.
- [x] Opening a person in Changes shows their graph and one line per story that verified them, each linking to that story; a story the viewer cannot open has no line.
- [x] The Filter pill shows only while Changes is open; choosing people, an event, a group or dates narrows the list as defined and is spelled out under the switch; Reset clears it.
- [x] A private group is never offered in the filter; a signed-out visitor is offered people and dates only.
- [x] The three corrected sentences read as in the UI Contract.
- [x] Returning to the feed with Back shows the chips at once, without a new count request.

## Done-When

- [x] Every rule in Definitions has a unit test with its expected result, including: two verifications by the same story (counted once, earliest); a verification by someone other than the author (not counted); the author as listener (not counted); a letter row (not counted); a person with no position before the verification (not counted on that point); a removal before the verification (no before); a person who removed their position after it (not counted); a reasoning-only history row (not a change); removing and re-taking the same position (not a change); a person who changed and came back (Same); a person who never changed since (Same); an unrated explain-back (not verified); an agent account (excluded); a story by an agent account (no count); dates that leave one position, or that fall inside a removal (person not listed in the dated view).
- [x] The read is checked against today's visibility: as a signed-out visitor, as a signed-in account that is neither the point's first validator nor a holder, and as a former holder of a non-public point, no history, explain-back or membership beyond today's appears.
- [x] Browser check at 320, 375 and 1280 on a `/tree/_gate/` fixture rendering the real components with fixture data (`.claude/rules/src.md`, P955 gate fixtures), plus one test-database story with a seeded live 10-rated verification: no overflow, no control under 40px, panel and filter dialog open, fit and close.
- [x] The feed makes at most one more request per page of stories than before (counted in the browser's network panel), and a feed page with 1000+ history rows behind it still returns complete counts.

## References

- Prototype: branch `feature/p1683-story-fitness-mockups`, commit `f5eacc37b`, `src/app/tree/story-positions/` (dev-only route `/tree/story-positions`)
- Rulings: decisions.md 2026-11-16 [product], 2026-11-17 [product], 2026-11-01 [product] (narrowed)
- Today's surfaces: `src/app/components/feed/feed-story-card.tsx` (rendered by `feed-page.tsx`, `stake-page.tsx`, `pinned-story.tsx` and three chat cards), `src/app/components/social/StoryCardDetail.tsx`, `src/app/components/social/point-positions-block.tsx`, `src/app/pages/point-detail-page.tsx`, `src/app/components/shared/position-spread.tsx`
- Data: `point_position_history` and `story_verifications` (`20260204_stories_points_calibration.sql`), exactly-10 (`20260218_p272_accuracy_achieved_threshold.sql`), history visibility (`20260325120000_p586_visibility_privacy_foundation.sql`), verification visibility (`20260910110000_p1278_b_live_verification_visible_to_its_participants.sql`), letter rows (`20260403224331_p581_clarity_letters.sql`), agent accounts (`20260819120000_p1104_agent_accounts.sql`), group membership visibility (`20260724120000_p1010_organizations_membership.sql`), point versions (`20260424120000_p800_point_supersede.sql`), the badge count (`update_story_understood_count`, `20260222120000_p413_nullable_story_verifications.sql`)
- Related: [P1574](p1574_canvas_partner_story_requests.md) (carries the canvas half), [P1055](p1055_norm_measurement_instrument.md), [P1559](p1559_follow_through_record.md)
