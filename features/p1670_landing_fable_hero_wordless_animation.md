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

- **Readable without decoding** (ruling 2026-11-11, P1665): an unlabelled drawing of one line splitting into five was not understood by an outside reader, and the founder needed time to read it. The visual must carry short labels saying what it shows. Abstract shape alone fails this.
- **The story comes from the data**, never hard-coded per page. Each person's `outcome` in `AgreedExample` (`stalled` / `diverged` / `changed`) decides their motion, so the builders page (4 agree, 4 ship different things) and the change page (5 say yes, 1 changes) each tell their own story.

## Solution

Replace the card's body with an animated figure built from SVG and framer-motion, which are already dependencies:

1. **Agreement beat.** One figure per person in a row, each showing a thumbs-up. Label: `example.agreed` (existing copy, e.g. "5 of 5 said yes").
2. **Later beat.** Label: `example.later`. Each figure moves by its outcome: `changed` keeps moving forward in blue, `stalled` stops and fades to grey, `diverged` drifts off in its own direction. Names appear as small labels on the figures.
3. **Close.** `example.punchline` in the existing bold closing line.

The animation loops slowly with a pause on the final frame. Under `prefers-reduced-motion`, only the final frame is shown and nothing moves. The "Illustration" marker stays. Screen readers get the same facts as text: the sentence, who agreed, what each person did, and the punchline. The sentence and the per-person `did` lines are no longer visible text but stay available to screen readers.

No new copy: every visible word is an existing `AgreedExample` field.

## Alternatives Considered

- **A. Remove the card** and let the headline stand alone. No risk, but no visual. Kept as the fallback if B does not read.
- **C. three.js or a 3D scene.** Rejected: a new package of several hundred KB on a landing page, with the same "what am I looking at" risk as the P1665 drawing.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The animation is as undecodable as the P1665 drawing | MITIGATE | Labels on each beat. Founder judges at review; fallback is A |
| Motion distracts from the headline, the same failure as the black box | MITIGATE | Slow, low-contrast, one pass then a long pause; only the `changed` figure keeps colour |
| Builders "diverged" reads as random scatter | ACCEPT | Founder judges at review; the per-person `did` stays available to screen readers |

**Non-Goals**
- Do NOT add a dependency (no three.js, Lottie or Rive).
- Do NOT change headline, CTA, the sections below, or any `AgreedExample` copy.
- Do NOT touch the production `/builders` or `/change-managers` pages.

## Acceptance Criteria

- [ ] On both `/tree/landing-fable` and `/tree/landing-fable-change`, the right side shows figures and short labels, with no per-person sentences visible
- [ ] The change page shows 5 figures agreeing, then 4 stopping and greying and 1 moving forward; the builders page shows 4 figures agreeing, then each drifting a different way
- [ ] Every visible word comes from the page's `AgreedExample`, with no new copy
- [ ] With reduced motion turned on, the final frame shows and nothing animates
- [ ] A screen reader still gets the sentence, who agreed, each person's outcome and the punchline
- [ ] No horizontal overflow at 320px, 375px or desktop
- [ ] Founder views both pages and judges whether the visual reads; the verdict is recorded in this spec

## Related

- P1667 (closed): introduced the text card this replaces
- P1665 (closed): the earlier drawing that readers could not decode; decisions.md 2026-11-11 [product]
