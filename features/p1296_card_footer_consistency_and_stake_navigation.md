---
status: week
type: task
rank: 91
workstream: E1
created_date: '2026-09-10'
tags: [feed, stake, cards, consistency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1296: Feed cards drift from profile cards, and /stake cannot be linked to or navigated out of

## Problem

**Situation:** The same two components, `FeedStoryCard` and `FeedPointCard`, render on `/feed`, on `/stake/:tag` and (as a different component, `StoryCardFull`) on profile pages. `/stake` already imports the feed components directly — verified 2026-09-10 by reading `src/app/pages/stake-page.tsx:32-33` — so this is not a rebuild problem.

**Complication:** The card footers have drifted apart, and `/stake` has no way in or out. On the stories feed the share icon floats *above* the footer divider, orphaned, while on a profile the same control sits *inside* the footer row beside "1 point" and an open-in-new icon that feed cards do not have at all. `/stake/:tag?tab=stories` is ignored, because the tab is component state (`useState`, `stake-page.tsx:56`) and not URL state, so the stories view cannot be linked. And `/stake` offers no way back except a control at the very top of the page.

**Question:** Bring the three surfaces onto one footer contract, and make `/stake` addressable and escapable.

Founder framing, verbatim:

> "the sharing button is like floating and there is a line... it should have the same, reuse the same components as in slash feed"

> "at the bottom of the page put back button as a CTA. Go back. That's cool because otherwise people feel stuck and the only CTA is at the top."

**This has a live falsifier already on record.** `docs/decisions.md` (§ stake surface) predicted exactly this: *"if an attendee lands on a stake page and cannot reach the next destination without pressing Back, the param is not being carried and the design has failed on its one requirement."* It was marked UNTESTED, waiting on the first live event. The founder hit it while preparing that event.

## Appetite

Blast radius: medium — two shared card components render on three surfaces, so a footer change touches everything at once. Reversibility: high, presentational plus one piece of URL state. Decision density: low; one founder call on which left-edge alignment is canonical.

## Solution

**One footer contract for story and point cards, applied on every surface that renders them.** The footer is a single row below the divider containing, in order: the expand affordance and its count ("1 point"), then the action icons right-aligned — share, and open-in-new. No control floats outside that row. Feed cards gain the open-in-new icon they currently lack.

**`/stake` tab state moves into the URL.** `?tab=stories` and `?tab=points` select the tab on load and update as the user switches, so a stories view can be linked directly. Default stays `points`. The existing rule that a tab only renders when it has content is unchanged — it is a prior founder ruling recorded in `decisions.md` and implemented at `stake-page.tsx:111-121`.

**`/stake` gains a bottom back CTA**, mirroring the existing top control, so the page can be left from where reading ends rather than only from where it started.

`[FOUNDER DECISION: card left edge. Profile and feed cards start at different horizontal offsets — the founder reports the profile card is "a bit shifted to the right". Which is canonical is a look call, not a technical one, and both are cheap. Name the winner and the other moves to match.]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Footer change lands on three surfaces at once | MITIGATE | Screenshot all three at desktop, 375px and 320px before and after |
| Conflicts with rulings from P1212 / P1270, which shipped card and footer work more recently | MITIGATE | Read both before editing; this spec did not audit their rulings and does not assume compatibility |
| URL tab state breaks existing links to `/stake/:tag` with no param | MITIGATE | Absent param must behave exactly as today, defaulting to points |
| Bottom back CTA duplicates the top control | ACCEPT | Duplication is the point; a long page needs an exit where reading ends |

**Non-Goals**
- Do NOT extract a shared card component. P500 explicitly rejected that path on type-signature grounds; this is an in-place style convergence.
- Do NOT change the tab-visibility rule.
- Do NOT touch position buttons, the position menu, or anything in the `useRemovePositionGuard` path.
- Do NOT redesign the feed page or the stake page beyond the footer, the tab param, and the bottom CTA.

## Done-When

- [ ] The share icon sits inside the footer row on `/feed`, on `/stake/:tag` and on a profile page, in the same position relative to the divider on all three
- [ ] Feed story and point cards render an open-in-new icon, matching profile cards
- [ ] `/stake/aisafety1?tab=stories` loads showing the Stories tab; switching tabs updates the URL; `/stake/aisafety1` with no param still opens on Points
- [ ] A back CTA is reachable at the bottom of `/stake/:tag` without scrolling up
- [ ] Card left edges match across feed and profile, per the founder decision above
- [ ] Screenshots at desktop, 375px and 320px for all three surfaces, before and after
- [ ] No console errors on any of the three surfaces

## Related

- **P500 `feed_card_harmonization` — SUPERSEDED, recommend rejecting.** Filed 2026-03-13, status backlog, rank 16. It specified this same footer work ("add border-t footer row with share/copy icons (matching profile pattern)") and sat unimplemented for six months while P1212 and P1270 shipped overlapping card and footer changes around it. Founder 2026-09-10: *"I think 13 March is outdated, so we probably can reject that one."* Its non-goal about not extracting a shared component is carried forward above.
- **P1212** — shipped "the founder's two footer rulings" plus two adversarial review rounds. **Not audited by this spec.** Read before editing.
- **P1270** — shipped "one nested-card pattern in both directions".

## Open Questions

1. Do P1212's footer rulings already define a contract this spec should adopt verbatim rather than restate? Not checked; the greps surfaced the commits but the rulings were not read.
2. Is the left-edge difference a deliberate profile-page choice or drift? Not investigated.
