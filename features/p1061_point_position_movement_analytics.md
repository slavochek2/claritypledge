---
status: week
type: story
disclosure: public
rank: 344
created_date: '2026-08-13'
tags: [recognition-chain, points, positions, stories]
delivery_stage: create-spec
pipeline_ran: [create-spec, create-spec.2]
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1061: Show position movement on a point or story

> **Whose intention this serves:** [p1055](p1055_norm_measurement_instrument.md) §Intention owns it. In short: make visible whether people's positions move, and whether they move more after their understanding of a story was verified.

## Problem

**Situation:** Every position change anyone has made is recorded (`point_position_history`, written by a trigger on `point_positions` since `20260204_stories_points_calibration.sql`) and readable for public points. Nothing displays it. On production's public points (read 2026-11-17, people still holding a position): 49 points have history, 36 have at least one person who changed position, 74 changes by 26 people, 10 of them across sides. These counts may include agent accounts, which a public read cannot tell apart.

**Complication:** The product's claim is that verified understanding changes what people do with a position. Without a view of movement, neither the founder nor anyone else can see whether that happens. A design was explored over six rounds as P1683 (dev-only prototype `/tree/story-positions`, invented data) and the founder approved it:

> "reflect on the last version. I do like it a lot. So how do we create a spec out of that? Because I want to implement it now for our stories and points."

**Question:** Build the approved design on real stories and points: one count on a story, arrows on each of its linked points, and a "Changes" view on the point page.

## Appetite

- **Blast radius: medium.** Read-only over existing tables, but it touches three heavily used surfaces (feed story card, story page, point page) and shows, by name, who changed their mind.
- **Reversibility: high.** No schema change is required by the design; an added read function can be dropped.
- **Decision density: settled.** All product decisions are made (below). What remains is for `/dev` to resolve from the code (Open Questions).

## Decisions already made

- [decisions.md](../docs/decisions.md) 2026-11-16 [product] "A story carries one count of verified people who moved; where and how they moved belongs to the point (P1683 exploration)": story names nobody; one count on the story; arrows only on a single point; least text, explanations behind info buttons; the word "people", never "readers"; "verified" = the author rated the explain-back exactly 10; a person can be verified on several stories, each a line in their log with the story linked; no narrated notes, no ratings; filter by people, events, groups and dates, no place; one column; linked points keep their look and links; no white buttons.
- [decisions.md](../docs/decisions.md) 2026-11-17 [product] "Position movement is built now for stories and points, ahead of the recognition chain": "moved" = any change of position; the point page names who changed; the verified against not-verified comparison stays, not-verified withheld under 5; the prototype's words ship as seen. This narrows 2026-11-01 [product] (3): the canvas half of P1061 still comes with [P1574](p1574_canvas_partner_story_requests.md)'s link and is not part of this build.

## Definitions (the counting rules)

All counts are per point **version** (positions stay with the version they were given on) and exclude agent accounts.

- **Holder** of a point: a person whose current position on it is not removed.
- **First position:** the person's earliest recorded position on the point. **Latest:** their current one. **Changed:** first ≠ latest, by any number of steps.
- **Verified by a story:** the person has a `story_verifications` row for that story with `accuracy_achieved` true (rating exactly 10). If there are several, the earliest counts.
- **Before (verified):** the position the person held on a linked point at the moment of that verification (the last history entry at or before its `created_at`). No position then means no "before", and the person is not counted on that point.
- **Moved (verified):** latest ≠ before. **Arrows:** latest is toward disagree (←) or toward agree (→) of before.
- **Not verified (for the panel):** people who explained the story back (a rated `story_verifications` row) and have no 10 on it. Their "before" is the position held at their first rated explain-back.
- **Switched sides:** before and latest are on opposite sides (one agrees, the other disagrees; Unsure is on neither side). **Other change:** any other difference. **Same:** no difference.
- **Story count "N moved":** distinct people verified by the story who moved on any of its current linked points.

## Solution

Build the three surfaces as the prototype at branch `feature/p1683-story-fitness-mockups`, commit `f5eacc37b`, shows them (`src/app/tree/story-positions/`: `StoryPageScreen.tsx`, `StoryPanel.tsx`, `PointPageScreen.tsx`, `ChangesBlock.tsx`, `ScopeControl.tsx`, `charts.tsx`, `bits.tsx`, `model.ts`, `scope.ts`, `copy.ts`; read them with `git show f5eacc37b:<path>`). The prototype is the visual and interaction reference; its data layer is invented and is replaced by the real reads.

1. **Story card (feed and story page).** Beside the existing "N verified" badge, a chip "N moved" (the story count), hidden when N is 0. On the feed it opens a one-sentence explanation. On the story page it opens a panel: per current linked point, its statement, a "Verified" bar and a "Not verified" bar split into switched sides / other change / same, a key with an info button, and Done. The not-verified bar is replaced by "not shown for fewer than 5 people" when that group has fewer than 5.
2. **Linked points on the story page.** Unchanged in look and links. One addition inside each point box: the arrows chip ("← a | b → moved") counting the story's verified people who moved on that point, hidden when both are 0, opening a one-sentence explanation.
3. **Point page.** The existing positions block gets a "Positions | Changes" switch.
   - **Positions** is today's block, unchanged, except that an opened "1 story" pill shows that story's verified badge and arrows chip.
   - **Changes** lists every holder: a before/latest chart (first positions outlined, latest filled), a filter by change, and people by name. Opening a person shows their positions over time as a graph and, under it, one line per verification: "{author} verified {person}'s understanding of {author}'s story", the story name linking to the story. The dated list of positions is present for screen readers only.
   - **Filter**, on the switch line, visible only while Changes is open: a blue-bordered pill ("Filter") opening a dialog with a search over people, events and groups, two date fields "When the positions were taken" (From, To), the number of people selected, Reset and Done. An active filter is spelled out in one line under the switch and tints the pill. Events and groups offered are those the viewer belongs to, as the canvas Share field lists them (`src/app/components/canvas/canvas-share-options.ts`); people are the point's holders.
   - **The point card's spread** on the point page shows first positions (outlined) → today's spread, only when they differ.

Reads must not add a request per feed card: the feed's counts come in one read for the page's stories, or with the stories themselves. Whether that is a database function or a client computation over the existing tables is `/dev`'s call (Open Questions).

## Invariants

- **The Changes view never shows a person the Positions view would not show.** Same holder set, same visibility rules (P586), same agent handling. History of a non-public point is never readable by someone who cannot read the point.
- **The story surfaces name nobody** (2026-11-16 ruling). Names appear only on the point page and in a person's own verification lines.
- **No numbers about people below 5 in the not-verified group** are shown, in text, bars or accessible labels.
- **Nothing new is written.** This build adds no write to `point_positions`, `points`, `stories`, `story_points` or `story_verifications`, so the P1364 cache-clear rule (decisions.md, "Any new write ... must clear the cache") is not triggered. If `/dev` finds it needs a write, stop and flag it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Showing who changed their mind punishes the behaviour the product wants to make safe | ACCEPT | Founder decision 2026-11-17 (names, same openness as today's list). Revisit if a person asks to hide their history |
| Story count and arrows are empty everywhere at launch (no verified person has a position before and after yet; 2 ratings of 10 exist) | ACCEPT | Hidden at zero, so nothing empty shows. They appear as verifications accrue. The point page has real data on 36 points |
| Not-verified bar is withheld almost everywhere (1 public point has 5+ people who changed) | ACCEPT | Founder kept the comparison; it fills in with use |
| Agent accounts' positions are moved by the content pipeline, which would read as minds changing | MITIGATE | Agent accounts are excluded from every movement count and from the Changes list |
| Filtering a public point by an event could reveal who attended it | MITIGATE | Only events and groups the viewer belongs to are offered, as in the Share field |
| Feed gets slower | MITIGATE | One read for the page's stories, measured before and after on the feed |
| Graph dates render ~8.5px at 320px wide (prototype) | MITIGATE | Graph text never below 12px rendered; long histories scroll sideways or thin their labels |
| A point has hundreds of holders | DEFER | Today's maximum is far below; revisit when a point passes 200 holders |

**Non-Goals**
- Do NOT change how linked points look or link on the story page, beyond the arrows chip.
- Do NOT build the canvas half (P1574's link) or anything on the canvas's open point; the shared positions block shows "Changes" on the point page only.
- Do NOT change the Contested rule (INBOX-340, a separate change request against P1508) or the definitions page's threshold wording (INBOX-345).
- Do NOT add a filter by place, names on story surfaces, ratings, narrated notes, or "one position" counts.
- Do NOT claim causation anywhere in the words: the panel compares, it does not say verification caused movement.
- Do NOT add tables or columns.

## UI Contract

Words ship exactly as in the prototype at `f5eacc37b` (`copy.ts`, `bits.tsx`, `charts.tsx`, `StoryPanel.tsx`, `ScopeControl.tsx`), founder decision 2026-11-17. Among them: "N moved", "Verified", "Not verified", "switched sides", "other change", "same", "not shown for fewer than 5 people", "Positions", "Changes", "Filter", "Filter people", "People, events, groups", "When the positions were taken", "From", "To", "Reset", "Done", "{author} verified {person}'s understanding of {author}'s story". Hint sentences are the prototype's, with the invented names replaced by the real ones.

- Buttons: filled blue (primary) or blue-bordered pill (secondary); no white or grey outlined action buttons (visual-qa.md).
- Every control at least 40px tall at 320, 375 and 1280 wide; no horizontal overflow.
- Blue marks "latest" or a change, never "good".

## UX Notes

- **Empty:** a story with no verified mover shows no chip; a point with no verified mover shows no arrows; a point where nobody changed shows "Changes" with the chart and "No one here has a position before and after yet" when the filter leaves nobody.
- **Loading:** the counts arrive with or after the card; the card never jumps when they arrive (reserve no space; the chip appears inline).
- **Error:** a failed movement read hides the chip and the arrows; the point page keeps the Positions view working and the Changes view says it could not load.
- **Links:** `?view=changes` on the point page opens Changes, so the view can be linked to.

## Acceptance Criteria

- [ ] On a story whose verified people include at least one who changed position on a linked point after verification, the card shows "N moved" with the right N, on the feed and on the story page.
- [ ] On a story with no such person, no chip appears.
- [ ] On the story page, tapping "N moved" opens the panel; each linked point shows the Verified bar with its parts; the Not verified bar appears only for 5 or more people, otherwise the withheld line.
- [ ] Each linked point on the story page looks and links as before; the arrows chip appears only when someone moved.
- [ ] On a point page, "Changes" lists every holder who is listed under "Positions" (and no one else), with the before/latest chart and the filter by change.
- [ ] Opening a person in Changes shows their graph and one line per verification, each linking to that story.
- [ ] The Filter pill appears on the switch line only while Changes is open; choosing a person, an event, a group or dates narrows the list and is spelled out under the switch; Reset clears it.
- [ ] A viewer is offered only events and groups they belong to.
- [ ] Agent accounts never appear in a movement count or in the Changes list.
- [ ] Nothing about a non-public point's history reaches someone who cannot read that point.

## Done-When

- [ ] Counting rules (Definitions) are covered by unit tests, including: several verifications for one person, no position before verification, a removed position, a position changed back to where it started (counts as Same), agent accounts.
- [ ] Browser check at 320, 375 and 1280 on test data with at least one verified mover: no overflow, no control under 40px, the panel and the filter dialog open, fit, and close.
- [ ] Feed load measured before and after (number of requests and time to show the cards); no request per card.
- [ ] Read access checked as an anonymous visitor and as a signed-in non-member against a non-public point: no history returned.

## Open Questions (for /dev)

1. **Where the counts are computed.** A database function returning per-story counts and per-point arrows for a set of stories, or a client computation over `story_verifications` and `point_position_history`. Both tables are readable today (anon read of `story_verifications` returned 41 rated rows on prod). Decide on request count for the feed and on visibility rules.
2. **Does "N verified" (`stories.understood_count`) count people or verifications?** The panel and the chip's accessible label say "of N verified people"; that N must equal the badge. Check the trigger that maintains `understood_count`.
3. **History rows with only a reasoning change** repeat the same position; they must not count as a change. Confirm against the trigger in `20260409120000_fix_position_history_trigger.sql`.
4. **Point versions.** When a point has a newer version, which version's holders the point page shows today, and the counts follow the same.

## References

- Prototype: branch `feature/p1683-story-fitness-mockups`, commit `f5eacc37b`, `src/app/tree/story-positions/` (dev-only route `/tree/story-positions`)
- Rulings: decisions.md 2026-11-16 [product], 2026-11-17 [product], 2026-11-01 [product] (narrowed)
- Today's surfaces: `src/app/components/feed/feed-story-card.tsx`, `src/app/components/social/StoryCardDetail.tsx`, `src/app/components/social/point-positions-block.tsx`, `src/app/pages/point-detail-page.tsx`, `src/app/components/shared/position-spread.tsx`
- Data: `point_position_history` and `story_verifications` (`supabase/migrations/20260204_stories_points_calibration.sql`), the exactly-10 rule (`20260218_p272_accuracy_achieved_threshold.sql`), history visibility (`20260325120000_p586_visibility_privacy_foundation.sql`), reader `getPositionHistory` in `src/app/data/points-service-real.ts`
- Related: [P1574](p1574_canvas_partner_story_requests.md) (canvas link, carries the canvas half), [P1055](p1055_norm_measurement_instrument.md), [P1559](p1559_follow_through_record.md)
