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
spec_review_hash: 7d69d36fd85a2e885e438cc544f2036399e47b5885f873117c3e2ed8761a5825
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
1b. **Revision 2 (founder, 2026-11-18): ranked points, no "I".** The founder read the new-rules canvas (v6) against the old one (v3) and found little difference. Half the points still read as descriptions ("Change leads … are the customers"), and "I" is ambiguous on a page someone else reads: does it mean the reader or the owner? A blind model judge was no help. It rated about 95% of all points "a reader can disagree", including a plain-description control ("Owners of independent cafés are the customers."). It cannot tell the versions apart, so it is not the test. The test is the founder's UAT complaint: *"maybe true, but I don't know if it's the best problem"*. A point that states which option it beats can be taken a side on. A point that leaves the reader to supply "best" cannot. Changes:
   - **Supersedes:** for every box, this revision replaces step 1's voices (Solution and Go-to-market stop being first person), its "challenge unchanged" default, the Risks row that ACCEPTs the challenge box resisting the claim form, and, for canvas points only, the point-model prior ruling that stance points are first person.
   - **Ranked lead point.** Customer Segments, Problem, Offers & Pricing, My next milestone and My current biggest challenge (the five ranked boxes) each open with one point that names the owner's choice against an alternative: "the <first|best> customers are X, <ahead of|not> Y", "the <first|biggest> problem for X is A, <ahead of|not> B", "the offer to sell first is X, <ahead of|not> Y", "the next milestone is X (target), <ahead of|not> Y", "the <chosen|biggest> challenge is X, <ahead of|not> Y". A later option is "ahead of Y"; an option the owner dropped or turned down is ", not Y" ("ahead of" would say it comes later). Both are in every lead template as the slot `<ahead of|not>`, so the dropped form is there to copy (fix round 3). No lead uses "before". The lead shapes write the choice word as a slot (`<first|biggest>`), never a bare "best" or "biggest", because the model copies a template's words (fix round, 2026-11-18). The lead is the box's first point and counts toward `MAX_POINTS_PER_BOX` (3). It keeps the box's required parts: price, unit and cadence for an offer, "(target)" for a milestone. Its other points keep their shapes. An offer lead keeps its price out of the contrast clause, because `canvas-price.ts` strips terms on a same-clause contrast (Known limitations).
   - **The ranking must be the owner's.** The chosen X, the alternative Y and the ranking itself each trace to the owner's words: the owner says X comes first, matters most, or is chosen over a named Y, or rejects Y for X. Order of mention, effort spent, or "the owner is pursuing X" alone ground nothing. "Best" or "biggest" is written only when the owner ranked. When the owner chose without ranking, the lead says "first" or "chosen" ("the first customer is X, not Y"). A lead never invents a Y. When nothing grounds a ranking, the box has no lead point (round 1 review: invented "costliest"). Each ranked box asks for the ranking in two places. Its `gap` question asks for the missing part of the box and the ranking (the gap is shown when the box is empty or only partly supported). Its `empty` question asks for the core fact and the ranking together. Example: "Who exactly is the customer, and which kind is best to start with, ahead of which other?"
   - **No "I", "we", "my", "our", "us", "me" or "you" in any point.** Every point is written in third person. When the business is the one acting, the point says "the business", never the business's or the owner's name: the names filter (`canvas-names.ts`) drops a point carrying a capitalised two-word name learned from an uploaded file, so a business name would lose points. Boxes whose subject is the customer or the offer keep that subject. This applies to Solution, Go-to-market, Biggest challenge and Hypotheses I've falsified. Stances stay stances: "The business sells X first, not Y"; "The business does not sell hand-run sessions". A plan stays a plan ("The business plans not to sell hand-run sessions"); there is no rule against "will not", because `withoutHelpers` in `canvas-support.ts` already strips "will" before "not", and forcing "does not" would turn a plan into a present fact (fix round, 2026-11-18). Write ", not Y" only when the owner's words drop, turn down or deny Y (negation parity); a later option is "ahead of Y". The challenge box has no uncertainty marker: its obstacle is written only as the owner states it, and otherwise the gap question asks for it (fix round: "probably", the third-person form of "I think", let the engine keep an invented cause, against Grounding). "The owner believes" is never used. Point-model stance points are first person because a reader adopts them as their own rule. A canvas point describes one business, so it does not use "I". The rule texts and the Copy prompt head stay in the owner's voice ("my", "you"). The Copy prompt adds one line: the rules may say "I" or "you", but a point never says "I", "we", "my", "our", "us", "me" or "you" (the same list as the agent's rule). Box titles ("My next milestone", "Hypotheses I've falsified") are labels and stay unchanged. Every changed box gets new `voice`, `shape`, `good`, `not`, `gap` and `empty` text.
   - **No @mentions.** Points render URLs and Markdown links (`src/app/utils/linkify.ts`) but have no person mentions. This is a decision not to build any; no code changes for it.
   - **Measure.** The revision-2 draft comes from two places. One is the founder's own AI run of the Copy prompt on his material (Done-When item 2). The other is the internal A/B harness (old rules against revision 2, the same three packs, each side run twice). The founder marks "I can take a side" or "I can't" on one shuffled list that holds the points of v6 and of his revision-2 draft, with nothing saying which draft a point came from (voice still gives some away). Report both the count and the share of "can" points, so a draft cannot win by dropping hard points. Revision 2 is adopted only if its count of "can" points is at least v6's and its share is higher. The harness counts, per box, the lead points, and its headline is the strict count: the first point holds a choice word ("best", "biggest", "first", "chosen", "next") AND an alternative ("ahead of", ", not", "instead of", "rather than") in the same point; "before" counts as neither. A looser lexical count is reported as a secondary row. It also counts the "I", "we", "my", "our", "us" and "me" left in point text (titles excluded), and kept and dropped points per side, naming every dropped point with the engine's reason.
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
- Revision 2 (A/B, 2026-11-18): an invented ranking passes every engine check, like an unstated "not" half. In 2 of 6 final runs the model wrote a "best" or "biggest" lead the owner never ranked. Only the prompt guards it. A post-model check would refuse a lead ("best", "biggest", "ahead of") unless its quote holds a ranking word.
- Revision 2 (fix-round review): an invented alternative Y passes every check. "The first customers are owners of 1-3 independent cafés …, ahead of bakery owners" is kept even when the material never mentions bakeries, because the quote rule only needs two shared words, which X supplies. Any future guard must require Y's own content words to appear in the owner's words, not only a ranking word in the quote.
- Revision 2: a weakly matched best guess (P1625) whose subject is "the business" is refused unless the owner typed "business", because "business" is not a FRAMING word. Points with a proper quote are unaffected; it cost no drop in the A/B.
- Revision 2: an invented currency ("0 EUR" for a free offer) passes, because `canvas-price.ts` checks unit and cadence, not currency. Seen in the early wordings, not in the final runs.
- Revision 2: every lead offers `<ahead of|not>`, so the model can write ", not <Y>" for an option the owner only put later ("Payroll comes later" becomes "…, not payroll"). The engine keeps it, because the point quotes X and the strong match never checks negation parity. Only the prompt guards it, as with an unstated "not" half. A guard would refuse a lead's ", not <Y>" unless the owner's sentence about Y says not, dropped, stopped or turned down.
- Revision 2: in a round update, the lead rule still says "the owner's words" while that mode counts everyone's words. Left this way on purpose: a ranking should be the owner's.

## Done-When

- [ ] New box rules drafted, shown to the founder side by side with the current ones.
- [ ] The founder has run the new Copy prompt on his own material; his output is saved in `.private/canvas-rules-test/` next to his current canvas.
- [ ] Revision 2 built: lead points in the five ranked boxes, grounded or left out; no "I", "we", "my", "our", "us", "me" or "you" in any point; the old/revision-2 A/B rerun with lead-point, pronoun and kept/dropped counts; the founder has run the revision-2 Copy prompt and marked the shuffled v6 + revision-2 list.
- [x] At least two real canvases drafted with old and new rules, each side run twice; both runs of a side saved in one file, `.private/canvas-rules-test/<canvas>-old.md` and `-new.md`, and one side-by-side summary there that counts kept and dropped points per side.
- [ ] The founder's decision recorded in `docs/decisions.md`: adopt, revise or drop; keep or move the reason in Solution and Guiding values; and what the falsified box becomes.
- [ ] If adopted, the drafting prompt, the Copy prompt and the empty-box questions all show the new rules (one text), and the canvas tests pass (including `src/tests/p1536-box-definitions.test.ts`, with its wording pins moved to the new wording).

## Related

P1508, P1536, P1529 (UAT where this came up), P1631, P1656 (scores), P1657 (owner positions; blocked by this) · `docs/story-point-model.md`.
