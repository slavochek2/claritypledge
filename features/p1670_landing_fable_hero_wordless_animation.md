---
status: week
type: story
rank: 332
workstream: website
created_date: '2026-11-12'
tags: [landing, design, animation, prototype]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1670: Landing fable hero: a near-wordless animation instead of the text card

## Problem

**Situation:** Both `/tree/landing-fable` (builders) and `/tree/landing-fable-change` (change managers) show the hero example as a text card on the right of the headline (`AgreedGraphic`, P1667): the sentence, the names who agreed, one line per person, a punchline. It was made quieter in P1667's last commit.
**Complication:** It is still a block of text competing with the headline, and it tells the same story the "What your team didn't say" section tells better further down. Founder, verbatim:

> "still so much text ... we have below a much better version of that ... if there is anything there on the right, then it has to be a visualization or something visual ... something moving"

**Question:** Can the right side carry the example as a picture that reads in about two seconds, on both pages?

## Appetite

Blast radius: low. Two dev-only `/tree` routes, one shared component, not reachable in prod. Reversibility: git revert. Decision density: low. The founder chose option B (a wordless animation built on the existing stack) over removing the card (A) or three.js (C) on 2026-11-12.

## Invariants

Founder-approved rewrite 2026-11-12 (after round 3 and review): the two invariants filed with this spec were removed with the founder's OK. They were (1) "the visual must carry short labels" (from the P1665 reader test, 2026-11-11) and (2) "each person's `outcome` decides their motion". The founder replaced both with "same yes, different understanding, almost no text". The P1665 risk now sits in Risks as a founder-judged MITIGATE.

- **The story comes from the data**, never hard-coded per page: one figure per person in the page's `AgreedExample`, and each person's `picture` decides the shape in their head. Two people with the same picture get the same shape.
- **The full story stays available to screen readers** (the sentence, who agreed, each person's `did`, the punchline) while the drawing itself is hidden from them.

## Solution

Replace the text card with one wordless drawing built from SVG and framer-motion, which are already dependencies. One line-drawn person per person in the example, with no card frame. Each gets an identical blue speech bubble with a white tick (the same yes), the only blue in the picture. Then a different solid grey shape fades in inside each head (a different understanding). No visible words at all: no sentence, names, count, punchline or "Illustration" marker.

The drawing plays once when it comes into view (about 4.5 seconds) and then holds the final frame for good: no loop (WCAG 2.2.2, and a looping version showed a visible rewind). Under `prefers-reduced-motion` the final frame is shown from the first paint and no timer is set. Meaningful parts keep at least 3:1 contrast on the page (measured: outlines 3.7:1, shapes 5.2:1, bubble 5.0:1). No new copy: the screen-reader text uses existing `AgreedExample` fields.

[FOUNDER DECISION: a line under the picture, or none. Proposals are in the session; the current recommendation is none, since the headline already says it.]

## Founder feedback, round 2 (2026-11-12)

> "The animation says, what changed? As if it's clear what it means, changed ... it's not about one changed, it's about the other [ones] didn't understand ... And why does it say illustration? That's weird."

Re-brief: the visual must show **same yes, different understanding**, not who complied. Build 2 or 3 concepts switchable by `?v=` on both pages, default to the strongest; remove the "Illustration" label. The punchline wording is unclear to the founder: `[FOUNDER DECISION: punchline for each page, from proposals]`. The page keeps the current punchline until then.

## Founder feedback, round 3 (2026-11-12)

> "it's too much text, too many icons, it's not clear and one has to read five of I've said yes and so on ... is there not like something more simpler with almost no text"

Superseded the `?v=` variants brief. Fable 5.2 gets a loose brief: one concept, people agree yet don't mean the same thing, near-zero visible text, calm and premium. Hard limits unchanged (no new package, plays once then holds, reduced motion static, screen-reader story kept, greys and blue only, 3:1 contrast, no overflow).

## Alternatives Considered

- **A. Remove the card** and let the headline stand alone. No risk, but no visual. Kept as the fallback if B does not read.
- **C. three.js or a 3D scene.** Rejected: a new package of several hundred KB on a landing page, with the same "what am I looking at" risk as the P1665 drawing.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A wordless drawing is as undecodable as the P1665 drawing | MITIGATE | One idea only (same tick, different shape), next to a headline that states it. Founder judges; fallback is A |
| Motion distracts from the headline | MITIGATE | Plays once in about 4.5s, then still; greys plus a single blue accent |
| Turning reduced motion off mid-visit replays the drawing once | ACCEPT | Rare, harmless (review round 4) |
| A sixth person would reuse the first shape | ACCEPT | Both examples have five people or fewer |

**Non-Goals**
- Do NOT add a dependency (no three.js, Lottie or Rive).
- Do NOT change headline, CTA, the sections below, or any `AgreedExample` copy (a non-visible `picture` field per person is allowed).
- Do NOT touch the production `/builders` or `/change-managers` pages.

## Acceptance Criteria

- [x] On both `/tree/landing-fable` and `/tree/landing-fable-change`, the right side shows one figure per person with the same blue yes and a different shape each, and no visible words (screenshots at desktop and 375px)
- [x] The drawing plays once and then holds; nothing loops (unit test; a mutation restoring the loop fails it)
- [x] With reduced motion turned on, the final frame shows and nothing animates
- [x] A screen reader still gets the sentence, who agreed, what each person did, and the punchline
- [x] No horizontal overflow at 320px, 375px or desktop
- [x] No new package, and no visible copy added
- [ ] Founder views both pages and judges whether the visual reads; the verdict is recorded in this spec

## Known limitations

- The unit tests assert phases, shapes and the screen-reader text through data attributes and DOM text, not the rendered SVG opacity or scale, and `useInView` is mocked (review rounds 2 and 4). The rendered drawing and final frame were checked by browser screenshots instead.

## Related

- P1667 (closed): introduced the text card this replaces
- P1665 (closed): the earlier drawing that readers could not decode; decisions.md 2026-11-11 [product]
