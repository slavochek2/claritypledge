---
status: in-progress
type: task
rank: 328
workstream: clarity-canvas
created_date: '2026-11-10'
tags: [clarity-canvas, points, mirror, prompt]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 6af12ce52eb8ae22cbfa1d82dfeeb854ae88d88012daee8bb9f5608e6d73e00d
spec_review_vendors: [gemini, openrouter]
---

# P1658: Clarity Canvas points are written as claims people can take a position on

## Problem

**Situation:** The canvas mirror, the Copy prompt and the empty-box questions all read one set of box rules (`supabase/functions/_shared/canvas-box-definitions.ts`, shared by `src/app/pages/chat/canvas-thread-copy.ts`). The rules give each box a type, a voice and a shape. Customer Segments is a "Description … noun phrase about the customer" and "never starts with 'I', 'We' …"; Problem is an "Observation about the customer"; "Hypotheses I've falsified" is first-person past Evidence ("I expected X; I tested; result; so I changed").

**Complication:** Positions need claims. The project's point model says a point is something you take a position on (agree or disagree) and requires falsifiability; mechanism points are third person with no "I", stance points are first person (`docs/story-point-model.md`, "The two axes" and point types; `.claude/commands/slava/content/sifter-point.md` 86-93). The canvas rules were never checked against that model, and no decision says canvas points are descriptions on purpose (searched 2026-11-10). In the Sales Mastermind UAT the founder could not take a position on production canvas points:

> "It says customer segments, teams across sales, marketing, blah, blah, blah. I cannot disagree with that. And then problem. Today, teams spend work time searching for files … So what? You know, maybe true, but I don't know if it's the best problem."
> "Now in the Clarity Canvas, everything is a point. But it's not formulated as a point."

Founder's further framing (2026-11-10): a "because" turns a point into a story; "the owner believes X" cannot be disagreed with; a falsified hypothesis could live in each box as a "not" point ("it's not this kind of person … because"), which frees the "Hypotheses I've falsified" box for something else.

**Question:** Which box rules make every canvas point a claim a reader can take a position on, while staying grounded in the owner's material, and does the founder prefer the result on his own canvas?

## Appetite

Blast radius: medium. Every new canvas draft, every next version and the Copy prompt change; published canvases change only at their next version. Reversibility: high (rule text, git revert). Decision density: a few founder calls, settled by reading test output.

## Prior rulings

- decisions.md 2026-10-19 (P1508): the canvas is nine lean-canvas boxes plus three ikigai boxes, written by the owner's agent.
- All seven P1536 global rules stay (`GLOBAL_RULES` in canvas-box-definitions.ts); only voice, shape and examples per box change.
- Point model: mechanism points third person, stance points first person; a reason belongs to the story, not the point.
- P1529 D23: the round-update next version is the agent's reasoned better version; the new rules apply to it as to any draft.

## Invariants

- Grounding is unchanged: every factual clause traces to the owner's material (GLOBAL_RULES "Grounding").
- The Copy prompt, the drafting prompt and the empty-box questions keep reading one text.

## Solution

1. **Draft new box rules** following the point model:
   - Claim boxes (Customer Segments, Problem, Offers & Pricing, My next milestone): third-person, falsifiable claims, no "I", no "because". Comparative and "not" forms allowed ("The first buyer is X, not Y").
   - Action boxes (Solution, Go-to-market strategy): first-person stance points about what the owner does.
   - A "not" point per box where the owner's material contains a falsified hypothesis. Test the founder's idea of retiring or repurposing "Hypotheses I've falsified" `[FOUNDER DECISION: what that box becomes]`.
   - Reasons leave the point: today's Solution shape ("I <do X>, which removes <obstacle> so they reach <B>") and Guiding values shape ("X over Y, because Z") carry reasons inside the point. The test tries both with the reason moved out `[FOUNDER DECISION: keep or move the reason in these two boxes]`.
   - Each box's `good` and `not` examples rewritten to match.
   - **Scope of the rewrite (spec review 2026-11-17).** Per box, every field that contradicts the new voice and shape changes too: `type`, `definition`, `gap`, `empty`, not only voice, shape and examples. The Copy prompt shows title, definition, voice and shape and no examples (`copyPromptSection`), so a rewrite that only touches examples never reaches the founder's own-AI test. The seven `GLOBAL_RULES` texts and `ONE_SALE_LOOP_PLAIN` stay word for word.
   - **Box by box, the defaults for the test build:** My next milestone keeps its target modality in third person ("10 cafés pay monthly by 31 March 2027 (target)"), since a target stays a target. My current biggest challenge is unchanged unless the drafting test shows it needs the claim form. Solution and Go-to-market are stance points: what the owner does, will not do or requires; the "which removes … so …" mechanism half is the reason that moves out.
   - **"Not" points:** they count toward `MAX_POINTS_PER_BOX` (3), and the "not" half must trace to the owner's material like any other clause (Grounding); a "not" with nothing behind it is left out. A box-level falsified hypothesis becomes a "not" point in its box. A whole dropped direction still goes to "Hypotheses I've falsified", because `ONE_SALE_LOOP_PLAIN` routes it there and stays unchanged; the box keeps its title and tag in this build. Renaming or retiring it relabels every published canvas (titles come from `CANVAS_BOXES`), so that is the founder decision, built separately.
2. **Test before shipping**, two ways:
   - The founder presses Copy prompt on a localhost branch build, runs it in his own AI with his own material, and compares the result with his current canvas.
   - The drafting agent runs on two or three real canvases with the old and new rules, side by side.
3. **The founder reads both and decides.** Only then do the rules change for everyone.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Claims invent certainty the owner never had | MITIGATE | Keep "Statement type per box" and the owner's modality (considering, planned, piloted) |
| Some boxes resist claim form (Guiding values, current biggest challenge) | ACCEPT | Leave those as they are if the test shows it; say so in the result |
| Drafts on TEST differ by model run | MITIGATE | Run each side at least twice |
| A model cost per test run | ACCEPT | A handful of runs at about 3 cents each (P1529 walk, 2026-11-09) |
| The engine's evidence checks drop the new forms (a "not" sentence read as a denial, P1625; a claim-shaped price missing its unit, `PRICE_GAP_QUESTION`) | MITIGATE | The old-vs-new run counts the points the engine kept and dropped per side, and names any dropped "not" point |
| Owners of published canvases get the new Copy prompt at once, in a form their published canvas does not use | ACCEPT | Only if adopted; the next version brings the canvas into the new form |
| Tests pin today's wording (`p1536-box-definitions.test.ts` pins "X over Y, because Z"; `canvas-eval-rules.ts` values-shape) | MITIGATE | The branch updates those pins to the new wording, because the wording itself is what this spec changes; every other test stays as it is |

**Non-Goals**
- Do NOT rewrite published canvases.
- Do NOT add scoring (P1656) or the publish review (P1657).
- Do NOT change the number of boxes in this spec; a repurposed falsified box is a decision recorded here and built separately if it changes the schema.

**Known limitations of the test build** (found in code review, 2026-11-17; to build only if the rules are adopted)
- A "not" half the owner never stated passes every engine check when the rest of the point matches its quote. Only the prompt guards it ("the owner named"). A post-model check would split the clause off and require it to share a word with the owner's material.
- `canvas-price.ts` strips the stated unit and cadence when a price contrast sits in the same clause ("per shop per month rather than per receipt"). The Offers & Pricing shape no longer asks for a contrast, so this only fires when the model writes one anyway.
- "(target)" alone marks a milestone as not yet reached. Nothing checks it is there.
- Best guesses (P1625) are refused more often under the new shapes: a Problem guess unless the owner typed "problem", a Guiding values guess with ", even when", and a Segments guess with a "not" half. Deliberate for Problem: exempting the word let a guess call something a problem the owner called easy.
- The model can still write a Segments point with no "not" half, which reads close to a description ("… are the customers").

## Done-When

- [ ] New box rules drafted, shown to the founder side by side with the current ones.
- [ ] The founder has run the new Copy prompt on his own material; his output is saved in `.private/canvas-rules-test/` next to his current canvas.
- [x] At least two real canvases drafted with old and new rules, each side run twice; both runs of a side saved in one file, `.private/canvas-rules-test/<canvas>-old.md` and `-new.md`, and one side-by-side summary there that counts kept and dropped points per side.
- [ ] The founder's decision recorded in `docs/decisions.md`: adopt, revise or drop; keep or move the reason in Solution and Guiding values; and what the falsified box becomes.
- [ ] If adopted, the drafting prompt, the Copy prompt and the empty-box questions all show the new rules (one text), and the canvas tests pass (including `src/tests/p1536-box-definitions.test.ts`, with its wording pins moved to the new wording).

## Related

P1508, P1536, P1529 (UAT where this came up), P1631, P1656 (scores), P1657 (owner positions; blocked by this) · `docs/story-point-model.md`.
