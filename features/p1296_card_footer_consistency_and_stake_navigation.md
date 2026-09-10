---
status: week
type: task
rank: 91
workstream: E1
created_date: '2026-09-10'
tags: [feed, stake, cards, consistency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, adversarial-review]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1296: The card action footer has no contract, and /stake renders none of it

> **Rewritten 2026-09-10 after adversarial review returned VERDICT: No.** The first draft claimed this was a styling drift on top of already-shared components. That was false in two ways, both recorded below as B1 and B2. Findings B1–B5, W3–W6 and N5 are folded in.

## Problem

**Situation:** `FeedStoryCard` and `FeedPointCard` render on `/feed` and on `/stake/:tag`; profile pages render their own `StoryCardFull`. The founder, preparing the first live event, found the share control floating above a divider on the feed while the profile keeps it inside a footer row alongside a count and an open-in-new icon that feed cards lack entirely.

**Complication:** The obvious reading — same components, so just align the styles — is wrong.

- **`/stake` renders no footer at all.** Both components gate the whole footer block on a prop `/stake` never passes: `feed-story-card.tsx:338` on `linkedPoints !== undefined`, `feed-point-card.tsx:251` on `linkedStories !== undefined`. `stake-page.tsx:219-227` passes neither, while `feed-page.tsx:510-525` passes both plus `currentUserId`. There is nothing on `/stake` to align.
- **`feed-point-card` has no divider to align to.** `grep -n "border-t border-border" src/app/components/feed/feed-point-card.tsx` returns nothing. Its share control sits in the same flex row as `PositionButtons` (`:211-240`). The founder's complaint describes the *story* card only.
- **`/stake` passes no `currentUserId` to `FeedStoryCard`**, whose own docstring (`feed-story-card.tsx:48-54`) records the P1212 finding verbatim: *"Omitting it is why the feed rendered a read-only slab where the profile rendered an interactive card, from the same component."* `/stake`'s Stories tab is now that slab.
- **No contract exists upstream to inherit.** P1212's footer is the agent-disclosure footer and it left footer coverage open as an unresolved founder decision (`p1212_agent_story_card_contract_drift_across_surfaces.md:597-604`). P1270 standardises nested cards and rules nothing here. Neither mentions `/stake`. The only statement of intent is a code comment, `feed-story-card.tsx:336-337`, and it is **already false**: feed is `flex flex-col px-4 py-2.5`, profile is `flex items-center justify-between pl-4 sm:pl-[68px] pr-4 py-3`.

**Question:** State the action-footer contract for the first time, and decide whether `/stake` joins it.

Founder framing, verbatim:

> "the sharing button is like floating and there is a line... it should have the same, reuse the same components as in slash feed"

> "at the bottom of the page put back button as a CTA. Go back. That's cool because otherwise people feel stuck and the only CTA is at the top."

**A falsifier already on record fired here.** `docs/decisions.md` (§ stake surface) predicted: *"if an attendee lands on a stake page and cannot reach the next destination without pressing Back, the param is not being carried and the design has failed on its one requirement."* Marked UNTESTED, waiting on the first live event. The founder hit it preparing that event.

## Appetite

Blast radius: **high**, raised from the first draft. Two shared components across three surfaces, plus a page-level data fetch on `/stake` if it joins the contract. Reversibility: high for presentation, medium for the fetch. Decision density: **two founder calls**, both below.

## Solution

**1. State the action-footer contract.** Nothing upstream defines it, so this spec is the definition. A single row below a divider: expand affordance and count on the left, action icons right-aligned in the order share, open-in-new. Feed cards gain the open-in-new icon they lack.

Two structural facts make this more than moving icons (W5): the feed footer is a **column** that contains the expanded list, while the profile footer is a **row** with the list as a sibling. Converging them is a restructure. And `feed-point-card` has no divider and no separate footer at all.

`[FOUNDER DECISION: does the contract cover point cards? Applying it there means lifting the share control out of the PositionButtons flex row. That is the row this spec otherwise refuses to touch, and your complaint was about story cards. Recommend story cards only for now; say if you want both.]`

**2. Decide whether `/stake` joins.** Giving `/stake` a footer requires it to fetch linked stories and points — a page-level data change, not styling.

`[FOUNDER DECISION: does /stake get the footer? Yes means /stake fetches linked content, share and open-in-new work there, and appetite grows. No means /stake keeps bare cards and this spec covers feed and profile only. You called /stake the event surface, which argues yes.]`

**3. Fix the `/stake` story card regardless of 2.** Pass `currentUserId`. This is the P1212 defect recurring on a third surface and is independent of the footer.

**4. `/stake` tab state moves into the URL.** Copy `feed-page.tsx:61`, which already derives the tab from `?tab=` — that also makes `stake-page.tsx:119-121` dead. Two constraints the naive version gets wrong:

- **Preserve `?event=`.** `stake-page.tsx:46` destructures getter-only; `event-links.ts:90` builds `/stake/:tag?event=<slug>` and `e2e/p1179-links-navigation.spec.ts` asserts it is carried. A bare `setSearchParams({ tab })` drops it.
- **Tab switches must use `replace: true`.** `feed-page.tsx` pushes history on tab change. If `/stake` copies that, a reader who toggles Points → Stories → Points then presses the new bottom CTA walks back through their own tab switches instead of leaving. The back CTA and the tab param ship in the same spec and would break each other.

**5. `/stake` gains a bottom back CTA**, mirroring `handleBack` (`stake-page.tsx:141-144`).

**6. Absorb P500's two live requirements** before it is closed: `text-base` body type on both feed cards (`feed-story-card.tsx:245`, `feed-point-card.tsx:186` are `text-sm`; profile is `text-base` at `profile-page-v2.tsx:1930`), and tab counts "Points (N)" / "Stories (N)" (`feed-page.tsx:400-435` renders bare labels).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Converging share geometry forks behaviour | MITIGATE | Profile shares via modal (`ShareDialog.tsx:247`); feed copies the link and fires `analytics.track('feed_card_shared')`. Preserve that event or lose the metric (W3) |
| `ShareDialog.tsx:271` hardcodes `text-gray-400`/`hover:bg-gray-100` with no `dark:` variant | MITIGATE | Reusing it unstyled is a dark-mode regression (W4) |
| Done-When #5's left-edge target may name the wrong element | MITIGATE | The delta is *inside the footer* (`sm:pl-[68px]` vs `px-4`); page gutters run the opposite way (`feed-page.tsx:320` `lg:px-8` vs `:823`/`:162` `px-4`) (W6) |
| Footer change lands on three surfaces at once | MITIGATE | Screenshot all surfaces at desktop, 375px and 320px, before and after |
| Adding an icon changes keyboard focus order | MITIGATE | Tab through the footer on each surface; `decisions.md` 2026-05-20 [technical], "Portal-rendered menus require manual focus management" records a prior focus-order defect in this area |
| `decisions.md` 2026-05-20 [technical], "Portal-rendered menus require manual focus management", cites an `overflow:hidden` on `feed-point-card` that no longer exists | ACCEPT | Stale citation there, not load-bearing here (N2) |
| Empty state: a card with zero linked items | MITIGATE | Define whether the footer renders with "0 points" or is suppressed |

**Non-Goals**
- Do NOT extract a shared card component. P500 rejected that on type-signature grounds and the reasoning stands.
- Do NOT change the tab-visibility rule (`stake-page.tsx:111-121`), a prior founder ruling.
- Do NOT touch `PositionButtons`, the position menu, or the `useRemovePositionGuard` path — **unless** the founder answers yes to decision 1, which requires exactly that. Resolve the decision before implementing.
- Do NOT redesign feed or stake beyond the footer, the tab param, the bottom CTA, `currentUserId`, and P500's two absorbed items.

## Done-When

- [ ] The action-footer contract is written down in the spec and implemented identically on `/feed` and profile story cards
- [ ] Feed story cards render an open-in-new icon
- [ ] `feed_card_shared` still fires from the feed share control after convergence
- [ ] `/stake` passes `currentUserId`, and its Stories tab renders an interactive card rather than a read-only slab
- [ ] `/stake/aisafety1?tab=stories` opens on Stories; switching tabs updates the URL **without** adding history entries; `?event=` survives a tab switch, asserted by the existing `p1179` test
- [ ] Pressing the bottom back CTA after two tab switches leaves the page, not returns to a previous tab
- [ ] A back CTA is reachable at the bottom of `/stake/:tag` without scrolling up
- [ ] Feed card body type is `text-base`; feed tabs show counts
- [ ] Whichever surfaces the contract covers match at desktop, 375px and 320px, screenshotted before and after
- [ ] Footer keyboard focus order verified by tabbing on each covered surface
- [ ] Dark mode verified on every changed control
- [ ] No console errors on feed, stake or profile

## Related

- **P500 `feed_card_harmonization`** — 13 Mar, backlog. ~60% superseded (its "Show more" by P1259, its footer count by P1212 §5). **Close only after items in Solution 6 are absorbed here.** Founder: *"I think 13 March is outdated, so we probably can reject that one."* Correct, but not before the two live requirements move.
- **P1212** — agent-disclosure footer; left footer coverage OPEN. Does not define this contract.
- **P1270** — nested cards on `QuotedPointCard`; rules nothing about footers.

## Open Questions

1. Both founder decisions above.
2. `p1259-disclosure-route-on-every-surface.test.tsx:106` renders the `/stake` branch while labelling it "feed" — the P1270 census defect recurring. Out of scope; worth a note (N1).
3. Uncovered by this spec: RTL, `MobileTooltip` parity, the anon-feed branch (N7).

## Review

Adversarial review 2026-09-10, 1 of 1 reviewer reported. VERDICT on the first draft: **No, not safe to implement.** Five BLOCK findings, all confirmed by command against `ed26cc8c1`. Coverage stated by the reviewer: commands run for axes 1, 2, 3, 5 and most of 6; axis 4 reasoned from measured classes and props; RTL and all rendered visual behaviour reasoned about only, with no browser check performed.
