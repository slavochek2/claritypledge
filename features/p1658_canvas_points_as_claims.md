---
status: week
type: task
rank: 328
workstream: clarity-canvas
created_date: '2026-11-10'
tags: [clarity-canvas, points, mirror, prompt]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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
   - Claim boxes (Customer Segments, Problem, Offers & Pricing, My next milestone): third-person, falsifiable claims, no "I", no "because". Comparative and "not" forms allowed ("Our first buyer is X, not Y").
   - Action boxes (Solution, Go-to-market strategy): first-person stance points about what the owner does.
   - A "not" point per box where the owner's material contains a falsified hypothesis. Test the founder's idea of retiring or repurposing "Hypotheses I've falsified" `[FOUNDER DECISION: what that box becomes]`.
   - Reasons leave the point: today's Solution shape ("I <do X>, which removes <obstacle> so they reach <B>") and Guiding values shape ("X over Y, because Z") carry reasons inside the point. The test tries both with the reason moved out `[FOUNDER DECISION: keep or move the reason in these two boxes]`.
   - Each box's `good` and `not` examples rewritten to match.
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

**Non-Goals**
- Do NOT rewrite published canvases.
- Do NOT add scoring (P1656) or the publish review (P1657).
- Do NOT change the number of boxes in this spec; a repurposed falsified box is a decision recorded here and built separately if it changes the schema.

## Done-When

- [ ] New box rules drafted, shown to the founder side by side with the current ones.
- [ ] The founder has run the new Copy prompt on his own material; his output is saved in `.private/canvas-rules-test/` next to his current canvas.
- [ ] At least two real canvases drafted with old and new rules, each output saved in `.private/canvas-rules-test/<canvas>-old.md` and `-new.md`, and one side-by-side summary there.
- [ ] The founder's decision recorded: adopt, revise or drop; and what the falsified box becomes.
- [ ] If adopted, the drafting prompt, the Copy prompt and the empty-box questions all show the new rules (one text), and the existing canvas tests pass (including `src/tests/p1536-box-definitions.test.ts`; a renamed falsified box updates its pinned title).

## Related

P1508, P1536, P1529 (UAT where this came up), P1631, P1656 (scores), P1657 (owner positions; blocked by this) · `docs/story-point-model.md`.
