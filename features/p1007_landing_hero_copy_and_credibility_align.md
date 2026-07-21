---
status: qa
type: task
rank: 1000954.0
created_date: '2026-07-21'
tags: [landing, copy, credibility, hero, p1004-followup]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
---

# P1007: Main-landing hero copy rewrite + credibility-section alignment

## Problem

**Situation:** After P1004 (build-right-thing landing serves `/`) and P1005/P1006 (shared `<FounderCredibility>`), the founder reviewed the live main page. **Complication:** (a) the hero led with "AI helps you build the wrong features faster" — clever but buried the differentiated mechanism (misunderstanding); (b) the credibility section's two columns were vertically centered, so the text eyebrow sat 26px below the video's top edge (looked misaligned); (c) a stakes-section italic line and a closing-CTA headline needed rewording. **Question:** rework the hero + supporting copy to lead with the mechanism, and top-align the credibility columns.

## Appetite

Small, reversible. Copy edits on one page + a one-class alignment change in the shared component. No schema, no new component, no funnel change.

## Solution

Founder-decided copy (finalized this session — reflects what shipped):
- **Eyebrow:** "De-risk high-stakes decisions" (was "Locate and de-risk high-stakes decisions" — tightened).
- **Hero H1:** "You might be building **the wrong thing**." (keeps the blue blur-reveal on the payoff line "the wrong thing.")
- **Mechanism sub-headline:** "Hidden misunderstandings are the root cause." (single hero sub-line — replaced the prior two-line block)
- **Removed from hero:** the "#1 startup killer is building something nobody wants." context line + its ref 1. The market-failure claim now lives solely in the "1 in 3" stakes section (which retains ref 1 → CB Insights) one screen below — no hero echo, keeps the header tight.
- **Mid-page section header:** "Verify understanding **when stakes are high**" (blue on "when stakes are high"; dropped the trailing "before you commit").
- **Closing CTA headline:** "Stop building wrong features. Start catching hidden misunderstandings." (replaces "Your team nods. / Nobody verified you understand each other.")
- **Closing sub-line:** "Make understanding gaps easy to reveal and safe to bridge." (was "Make hidden misunderstandings…").
- **Deleted** the stakes italic line "The market didn't reject it. The team never verified they meant the same thing."
- **SEO description** updated to match the new hero.
- **Alignment:** `<FounderCredibility>` grid `items-center` → `items-start` (top-aligns the video + text columns on all four pages: `/`, `/coach`, `/founder`, `/hiring`).

CTA unchanged ("Book a free alignment audit" → /intro, 15-min). The "3-min diagnostic" framing belongs to P1003 (unbuilt), not this hero.

## Risks / Non-Goals

- Non-Goal: the 3-min diagnostic funnel — that is P1003 (`status: today`). This hero keeps the existing audit CTA.
- Non-Goal: repositioning `/` away from the product/founder wedge — kept sharp deliberately.
- ACCEPT — minor wording variance: hero says "the wrong thing", closing CTA says "wrong features" (founder's chosen phrasings).

## Done-When

- [x] Hero renders the new H1 ("You might be building / the wrong thing.") + single mechanism sub-line; blur-reveal animation intact
- [x] Eyebrow tightened; mid-page section header reworded; hero context line + ref 1 removed (ref 1 retained in stakes section, no dangling citation)
- [x] Stakes italic line removed; closing-CTA headline + sub-line updated
- [x] `<FounderCredibility>` columns top-aligned (video top == eyebrow top; verified offset 0, was 26px)
- [x] SEO description matches new hero
- [x] tsc + eslint clean; component tests 4/4; browser-verified at desktop + 320px (no overflow)