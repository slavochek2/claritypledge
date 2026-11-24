---
status: in-progress
type: task
rank: 328
workstream: clarity-canvas
created_date: '2026-11-10'
tags: [clarity-canvas, points, mirror, prompt]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev, dev.2]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 102a9aaf288d987d67bc77d9fe30233a87d393091d2f783c6b4e727509e58f13
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
- All seven P1536 global rules stay (`GLOBAL_RULES` in canvas-box-definitions.ts); only voice, shape and examples per box change. One founder-approved exception (2026-11-23, Revision 3): "Statement type per box" is scoped to the boxes that carry state (Milestone, Challenge, Hypotheses), because Solution, Offers and Go-to-market describe the intended model with no status.
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
   - **Ranked lead point.** Customer Segments, Problem, Offers & Pricing, My next milestone and My current biggest challenge (the five ranked boxes) each open with one point that names the owner's choice against an alternative: "the <first|best> customers are X, <ahead of|not> Y", "the <first|biggest> problem for X is A, <ahead of|not> B", "the offer to sell first is X, <ahead of|not> Y", "the next milestone is X (target), ahead of Y" (v8: "ahead of" only, a later goal is never turned down), "the <chosen|biggest> challenge is X, <ahead of|not> Y". A later option is "ahead of Y"; an option the owner dropped or turned down is ", not Y" ("ahead of" would say it comes later). Both are in every lead template as the slot `<ahead of|not>`, so the dropped form is there to copy (fix round 3). No lead uses "before". The lead shapes write the choice word as a slot (`<first|biggest>`), never a bare "best" or "biggest", because the model copies a template's words (fix round, 2026-11-18). The lead is the box's first point and counts toward `MAX_POINTS_PER_BOX` (3). It keeps the box's required parts: price, unit and cadence for an offer, "(target)" for a milestone. Its other points keep their shapes. An offer lead keeps its price out of the contrast clause, because `canvas-price.ts` strips terms on a same-clause contrast (Known limitations).
   - **The ranking must be the owner's.** The chosen X, the alternative Y and the ranking itself each trace to the owner's words: the owner says X comes first, matters most, or is chosen over a named Y, or rejects Y for X. Order of mention, effort spent, or "the owner is pursuing X" alone ground nothing. "Best" or "biggest" is written only when the owner ranked. When the owner chose without ranking, the lead says "first" or "chosen" ("the first customer is X, not Y"). A lead never invents a Y. When nothing grounds a ranking, the box has no lead point (round 1 review: invented "costliest"). Each ranked box asks for the ranking in two places. Its `gap` question asks for the missing part of the box and the ranking (the gap is shown when the box is empty or only partly supported). Its `empty` question asks for the core fact and the ranking together. Example: "Who exactly is the customer, and which kind is best to start with, ahead of which other?"
   - **No "I", "we", "my", "our", "us", "me" or "you" in any point.** Every point is written in third person. When the business is the one acting, the point says "the business", never the business's or the owner's name: the names filter (`canvas-names.ts`) drops a point carrying a capitalised two-word name learned from an uploaded file, so a business name would lose points. Boxes whose subject is the customer or the offer keep that subject. This applies to Solution, Go-to-market, Biggest challenge and Hypotheses I've falsified. Stances stay stances: "The business sells X first, not Y"; "The business does not sell hand-run sessions". A plan stays a plan ("The business plans not to sell hand-run sessions"); there is no rule against "will not", because `withoutHelpers` in `canvas-support.ts` already strips "will" before "not", and forcing "does not" would turn a plan into a present fact (fix round, 2026-11-18). Write ", not Y" only when the owner's words drop, turn down or deny Y (negation parity); a later option is "ahead of Y". The challenge box has no uncertainty marker: its obstacle is written only as the owner states it, and otherwise the gap question asks for it (fix round: "probably", the third-person form of "I think", let the engine keep an invented cause, against Grounding). "The owner believes" is never used. Point-model stance points are first person because a reader adopts them as their own rule. A canvas point describes one business, so it does not use "I". The rule texts and the Copy prompt head stay in the owner's voice ("my", "you"). The Copy prompt adds one line: the rules may say "I" or "you", but a point never says "I", "we", "my", "our", "us", "me" or "you" (the same list as the agent's rule). Box titles ("My next milestone", "Hypotheses I've falsified") are labels and stay unchanged. Every changed box gets new `voice`, `shape`, `good`, `not`, `gap` and `empty` text.
   - **v8 (founder, 2026-11-19, reading his own Copy-prompt run v7).** The run put a problem and its trigger into Customer Segments ("Teams … stuck in a disagreement they feel today are the customers"), the team package and the free mastermind into Solution, a Problem lead with only A, the label "Lead:" into four points, and "not" in front of a later milestone. Changes:
     - **Customer Segments is who the customer is, never their problem.** A point names a role plus at least two of industry, company size, place (for consumers: age, life stage), values, attitudes, and what they buy or use today. The problem, its trigger and its cost go in Problem. The definition and shape no longer mention them ("people who have the problem" and "<do X today> <when trigger>" are gone). The lead, the role points (now "without 'are the customers'" in the same sentence) and the "not" lookalike stay.
     - **A box never holds another box's point.** A shared rule in the drafting prompt's "For all boxes:" block (not a global rule). The drafting agent gets the map: who the customer is goes in Customer Segments, the pain in Problem, how it is solved in Solution, how the business reaches them in Go-to-market strategy, and what is sold and for how much in Offers & Pricing. The Copy prompt gets only the founder's sentence, "A heading never holds another heading's point.", because the 1100-word cap leaves no room for the map. Each heading's definition right below already says what it holds (decision, 2026-11-19).
     - **Solution is the customer's path in up to five steps.** Each step is what happens for the customer, from the problem to what they want. It is a stance a reader can hold the business to, with planned, piloted or live. It holds no package, price or channel, and leaves out why. The "The business does not <Y>" stance form stays.
     - **The Problem lead keeps A with its cost, B and the obstacle:** "The <first|biggest> problem for <customer> is <A + cost>, <ahead of|not> <other problem>; they want <B>, but <obstacle>."
     - **"Lead:" only marks the template.** It is never written into a point (lead rule and Copy prompt line).
     - **The milestone lead uses "ahead of" only.**
     - **Material that is already a canvas is placed by the routing rule, not its own headings** (v8e, `CANVAS_MATERIAL_RULE`, right after the routing rule in the drafting prompt; not in the Copy prompt).
     - **Words paid for in the Copy prompt** (no grounding or scope sentence cut):
       - voice written "third-person";
       - the clarity-canvas.md attach clause;
       - "in its heading's voice";
       - Problem's second form written as "Others open …";
       - small rewordings.
   - **Revision 3 / v9 (founder, 2026-11-23, reading his own Copy-prompt run `~/Desktop/v8.md`).** Every box still carried content that belongs elsewhere. Founder's words: "a solution describes a solution and not the state of the solution"; "Install 4,500 euro once … but for what? It doesn't describe the offer"; "these things until and when … go-to-market strategy is what i plan and how i plan"; "I falsified so many hypotheses … it just shows one". Changes:
     - **Supersedes:**
       - Risks row 1 ("keep … the owner's modality (considering, planned, piloted)") for these three boxes.
       - The v8 Solution bullet's status and its "The business does not <Y>" form.
       - THIRD_PERSON_RULE's "a plan stays a plan" example.
       - Any gap or example that asks for or shows status or traction in Solution, Offers or Go-to-market: Offers' "has anyone paid it yet", Go-to-market's "result so far, or 'not tried yet'", "4 of its 6 clients came via…", "6 shops pay it today".
     - **Solution, Offers & Pricing and Go-to-market describe the business model the owner intends**, in the present tense, with no status ("planned", "untested", "considering", "not tried yet", "none sold") and no traction counts. Both prompts frame these three headings as the intended model, so a present-tense sentence there means "this is the model", never "this is happening". Where the business stands goes in two places:
       - My current biggest challenge: where it is now, including blockers ("invitations wait for a call that can run the Listening Game").
       - My next milestone: the next customer result, and its order against later goals ("ahead of").
       Grounding still applies in every box, so an untested assumption in Segments or Problem stays the owner's claim, never an invented fact. `[FOUNDER DECISION, taken 2026-11-23: "It's not a state. It doesn't matter if it's untested, planned or whatever. State is something else."]` This scopes GLOBAL_RULES "Statement type per box" to the boxes that carry state (Milestone, Challenge, Hypotheses), both `text` and `plain`. It is the one exception to the word-for-word invariant, and its test pin moves with it.
     - **Solution holds only the customer's path from the problem to what they want, in steps.**
       - No "The business does not <Y>" stances. "The business does not discuss paid support before the room shows adoption" (v8.md) is a rule the business keeps, not a solution. Such a rule goes to Guiding values only when the owner states it as an "X over Y" trade-off; otherwise it is left out (story material).
       - A supported outcome inside a disclaimer stays as a step. "Removes false confidence in agreement" from "does not claim to make a team correct … only to remove false confidence" is an example.
     - **Offers & Pricing names what the customer gets, then the price per unit per period** ("once" is a valid period). "Install: 4,500 EUR once" fails because it does not say what is installed. When the price is missing, the deliverable stays and the gap question asks for the terms (Partial beats empty).
     - **Go-to-market strategy is where and how the business reaches customers.**
       - A grounded channel exclusion stays ("not through paid ads").
       - Timing, waiting and conditions leave the box. A current blocker goes to My current biggest challenge, and an owner-stated sequence of customer goals goes to My next milestone as "ahead of". Incidental timing is dropped (story material).
       - The routing rule adds both destinations, in the drafting map and, within the word cap, the Copy prompt.
     - **Hypotheses I've falsified holds up to 3 falsified expectations** (the box cap).
       - Each one is an expectation, the contrary evidence (a test, an event, a prospect conversation), and the change when stated. The shape no longer demands a sample size or a change.
       - Selection when more qualify: the ones the owner gives most weight to, or failing that, those that most changed the current focus.
       - Whole dropped directions still go here (ONE_SALE_LOOP_PLAIN unchanged). A ruled-out option with no evidence story stays a "not" point in its own box.
       - Raising the cap is a separate founder decision.
     - **No label in any template.**
       - v8.md wrote "Lead:" into four points although the Copy prompt forbids it, because the shapes begin `Lead: "…" Others: "…"` and the model copies a template's words.
       - The five ranked boxes' shapes become plain sentences: "Open with "…" when the owner's words ground it; then "…"".
       - LEAD_POINT_RULE names the five boxes instead of keying on "Lead:", and keeps the milestone's "ahead of" restriction.
       - The 1100-word Copy-prompt cap stays; added words are paid by cuts that remove no grounding or scope sentence, each one reported.
     - **The builder runs the Copy prompt itself before the founder does.** Protocol:
       - Take the exact Copy-prompt text the app copies, saved to `.private/canvas-rules-test/` with the git sha.
       - A fresh Claude agent in this repo, at that sha, receives only that text, as the founder's Claude did for v7 and v8.
       - Sources allowed: `docs/lean-canvas.md`, `docs/goals.md`, `docs/decisions.md`. No specs, code or `.private/`.
       - Save the output next to the prompt.
       - Check every box against every rule: no status or traction in the three model boxes, Solution steps only, every offer names what is bought, no timing in Go-to-market, at most 3 falsified expectations, no "Lead:" or other template label, no first- or second-person pronoun, no reason inside a point, nothing from another box. Report any empty box.
       - Fix and rerun until it passes. This run is separate from the drafting A/B (which still runs, old against v9, with the existing metrics plus these checks) and from the founder's in-app test on TEST.
     - **Out of scope here: stories.** The reasons, history, waiting and status pulled out of points are story material: "a story is how I came to this point" (founder, 2026-11-19 and 2026-11-23). Drafting a story under each point, using the story definition in `docs/story-point-model.md`, goes in its own spec, because the draft would have to write stories, check them for evidence and show them. The v8.md leaks ("because revenue comes second", "under revisit", "invitations wait for…") are what that spec should absorb.
   - **No @mentions.** Points render URLs and Markdown links (`src/app/utils/linkify.ts`) but have no person mentions. This is a decision not to build any; no code changes for it.
   - **Measure.** The revision-2 draft comes from two places. One is the founder's own AI run of the Copy prompt on his material (Done-When item 2). The other is the internal A/B harness (old rules against revision 2, the same three packs, each side run twice). The founder marks "I can take a side" or "I can't" on one shuffled list that holds the points of v6 and of his revision-2 draft, with nothing saying which draft a point came from (voice still gives some away). Report both the count and the share of "can" points, so a draft cannot win by dropping hard points. Revision 2 is adopted only if its count of "can" points is at least v6's and its share is higher. The harness counts, per box, the lead points, and its headline is the strict count: the first point holds a choice word ("best", "biggest", "first", "chosen", "next") AND an alternative ("ahead of", ", not", "instead of", "rather than") in the same point; "before" counts as neither. A looser lexical count is reported as a secondary row. It also counts the "I", "we", "my", "our", "us" and "me" left in point text (titles excluded), and kept and dropped points per side, naming every dropped point with the engine's reason.
   - **Revision 4 (v10), from the founder's test of v9 (2026-11-24).** His Copy-prompt output is `~/Desktop/v10.md` (copy it to `.private/canvas-rules-test/founder-v10.md`). His verdict: points are generated and may be better, but:
     > "the language has to be also easier. It's like long sentences. It has to be short, as if possible clearer."
     > "solution is high level solution. Now it looks more like user journey … High level, not user journey."
     > "high level, it's just like, what is it? It's like software or specific kind of software, service or … physical product. So high level and then the category underneath … and then … how does solving look like."
     - **Short sentences, one idea per point.** v10.md example of the failure: "Change leads at organizations of about 100 to 1,000 people whose teams' throughput outgrew their coordination process and who have bought process, not a norm, are the customers, not community organizers." Rule: one claim per point, one sentence, no chained clauses; a second idea becomes its own point or is dropped. The builder picks a measurable form (for example a word cap per point plus at most one ", not <Y>") and the A/B reports it per box.
     - **Solution is what the product is, then what solving looks like.** v9's Solution definition ("the customer's path … up to five steps") produced the journey the founder rejects ("A champion supplies a topic, then colleagues join …, then …"). New shape: the first point names the kind of thing and its category (software, service, physical product, and the kind underneath, e.g. "online group-session software for teams"); further points say what solving the problem looks like for the customer, at a high level, never a "then … then" sequence of steps. This supersedes v9's "Solution only the customer's steps".
     - **Anchor each standard box on the Lean Canvas's own definition.** The box rules were written from scratch, and the Solution journey shows they can drift from what the box means. For each box that is a standard Lean Canvas box (Customer Segments, Problem, Solution, Go-to-market strategy as Channels, Offers & Pricing as Revenue Streams), the builder cites the Lean Canvas definition (Ash Maurya's, from a primary source read this session, not from memory) and checks the box rule against it; a difference is kept only with a stated reason. The canvas's own boxes (Guiding values, My next milestone, My current biggest challenge, Hypotheses I've falsified) keep their current definitions. The "a point is a claim you can take a side on" rule stays on top of every box.
     - **Stories stay out of this revision (P1720 is built separately, later).** The founder first asked to build both together ("they're connected … do both"), then reversed the same day: "maybe we do only 1658 … if we put stories, maybe it starts leaking private information that we don't want. But I still want to do it, but maybe it's a separate one." Revision 4 changes point wording only.
     - The 1100-word Copy-prompt cap still holds; the new rules are paid for by cuts, each reported.
     - **Pinned by the spec review (Gemini, GLM, 2026-11-24; 2 of 2 received).** Builder's calls, made from the founder's words and the cited source:
       - **The measure, one rule for both prompts:** a point is one sentence of at most 20 words (`MAX_POINT_WORDS`). It has no ";", no " then " and at most one contrast (", not <Y>" or "ahead of <Y>"). It holds at most one clause marker (who, whose, which, where, while, but, if, unless, even when). The Copy prompt's "at most 300 characters" becomes the word cap. `MAX_STATEMENT_CHARS` (300) stays as the engine's backstop. The harness reports per box: points, mean and max words, points over 20 words, and chained points (any ";", " then ", a second contrast or a second clause marker). The builder's own run passes with 0 over the cap and 0 chained, after a human reads each hit. The A/B passes when revision 4 lowers both counts against v9 on every pack and keeps at least 80% of v9's kept points. All earlier measure rows (strict leads, pronouns, kept and dropped, the v9 checks) still run.
       - **Every multi-idea shape splits or loses its second idea.** This supersedes the v8 Problem lead bullet and these v9 shapes:
         - Problem: "…; they want <B>, but <obstacle>". The lead names the problem and its rival; another point names an existing alternative and what it leaves broken (Lean Canvas, below); B leaves the box. decisions.md 2026-08-06 already calls the A→B→obstacle bundle story material.
         - Offers & Pricing: the lead's "; <price>". The lead names the offer and its rival; the price is its own point.
         - My next milestone: "; if missed, <change>". A stated change becomes its own point.
         - My current biggest challenge: "at <A> and wants <B>; the obstacle is <barrier>". One idea per point.
         - Hypotheses I've falsified: "; so it <change>". A point is the expectation and the evidence against it; the change is story material.
         - Guiding values: keeps "X over Y[, even when <cost>]", since "even when" is the one allowed clause marker.
       - **Solution, as a claim:** the first point is "The product is <kind> for <customer>[, not <other kind>]." <kind> names software, a service or a physical product, plus the specific kind under it ("online group-session software"). It is never a bare category ("a platform"), so GLOBAL_RULES "Specificity" still holds. Up to two more points each say what solving one listed problem looks like for the customer, as one outcome. `ROUTING_RULE` loses "as does a step order inside Solution". Solution's `type`, `definition`, `shape`, `good`, `not`, `gap` and `empty` lose all step wording, as do the harness's v9 checklist and the test pins.
       - **Where the Copy prompt carries it:** the per-point line ("up to 3 points, each one short sentence …") states the word cap and the no-";" rule. The Solution rule sits in Solution's own definition and shape. Cuts paying for added words are listed in `.private/canvas-rules-test/v10-copy-word-budget.md`.
       - **Lean Canvas check (source: Ash Maurya, "What is a Lean Canvas?", leanspark.ai/learn/what-is-lean-canvas, read 2026-11-24; text saved at `.private/canvas-rules-test/lean-canvas-source-leanspark-2026-11-24.txt`).** Every quote below was matched verbatim against that text. A reviewer's claims about the book (early adopters defined by triggers, "top 3 features", gross margin in Revenue Streams) are not on the page and were not used.

         | Box (Lean Canvas name) | Maurya, verbatim | Revision 4 rule | Difference, and why kept |
         |---|---|---|---|
         | Customer Segments | "A customer is someone who pays for your product. A user does not." · "Your objective is to define an early adopter, not a mainstream customer." | The lead names the first customers ahead of later ones (the early adopters); Pays:/Uses:/Approves: points for roles. | No total-market (TAM) point: a size the owner never stated would break Grounding. |
         | Problem | "list the specific problems you will tackle" · "prioritize the top 1-3 problems" · existing alternatives: "Document how you think your early adopters currently address these problems today." | Up to 3 points: the ranked problem, another problem, or an existing alternative and what it leaves broken. | Each problem keeps its cost (the founder's "so what?" UAT complaint). B and the obstacle leave the box. |
         | Solution | "sketch out the simplest thing you could build to address each problem" · "Bind a solution to your problem as late as possible." | "The product is <kind> for <customer>", then what solving one listed problem looks like. | The kind-and-category point is not in Maurya's box. It is the founder's 2026-11-24 decision (2). Maurya's "less than one-ninth of the entire canvas" backs keeping it high level. |
         | Channels (Go-to-market strategy) | "Failing to build a clear path to customers is among the top reasons startups fail." · "relying on any channels that get you in front of potential customers is OK." | Where and how the business reaches the segment, with no timing. | None. Scalable channels are a later choice and need no rule. |
         | Revenue Streams (Offers & Pricing) | "Price is part of the product." · "Many startups defer the 'pricing question' to a later stage, but this is a mistake." | What is bought, then its price; the deliverable stays when no price is stated. | The page's Revenue Streams section names no lifetime value or margin, so the box asks for none. |

       - **Built and measured (2026-11-24).** Copy prompt `79861bfa83cc`, 1099 words, within the cap. Every cut is listed in `.private/canvas-rules-test/v10-copy-word-budget.md`: the first build; the fix round after the first `/finish` review, which cut 15 words and added 15; and the second review round, which saved 1.
         - **The per-point rule is the same in both prompts:**
           - one sentence of at most 20 words
           - no ";" or "then"
           - at most one ", not" or "ahead of"
           - at most one of who, whose, which, where, while, but, if, unless, even when

           The Copy prompt now carries the clause-marker limit too.
         - **The fix round changed five things:**
           - **Solution:** the kind is what sort of product it is. What is bought (a package, a workshop) goes in Offers & Pricing, and the drafting prompt's routing rule says so. Outcomes must be ones the owner claims. The optional contrast is `<ruled-out kind>`, grounded like every other "not".
           - **Customer Segments:** "what they buy or use today" left the qualifier list and the gap question, because Problem already holds the existing alternative (Maurya). A qualifier that does not fit the 20 words is left out, never made a point of its own.
           - **The A/B harness:** it now flags a falsified hypothesis that states the change it made (`falsified-change`), and a Solution kind that names what is bought (a package, bundle, workshop or sessions) or repeats the offer (`solution-offer`).
           - **The contrast measure:** narrowed to ", not" and "ahead of", in the harness and the tests alike.
           - **The tests:** they pin each branch of the measure with a real-example control. One comment edit had silently dropped a box from a coverage map, and that is now guarded.
         - **"Open with" was not applied to Solution's kind point.** In the Copy prompt "Open with" means "skip it if no other option exists", so the kind point would drop whenever nothing is ruled out. Grounding (rule 1) covers the kind instead.
         - **Second review round** (Gemini, GLM, Opus; Codex skipped by the founder). It found the harness blind to the commonest real hit, so the earlier A/B counts were too low; they are corrected below. Fixed:
           - `solution-offer` now reads "the kind names what is bought" (package, bundle, workshop, sessions; a negated "…, not a package" does not fire), and the tests pin it with controls.
           - `falsified-change` catches "so it now bills", "and therefore", "which led it to" and "and now sells"; a sentence that opens with a digit or currency counts as a second sentence, in the harness and the tests.
           - The routing rule's Solution clause scopes to the kind ("as its kind, Solution names what sort of product it is"); "names only" had forbidden the outcome points.
           - Segments' "at least two" qualifiers apply to each point that names the customers, not to Pays:/Uses:/Approves: role points. The Copy prompt's per-point line says "at most" for both limits.
           - Each run records a hash of the two rule files, and the compare table shows empty Solution and Offers counts.
         - **Third review round** (Gemini, GLM; a freshness check of the second round's fixes). Fixed, each with a control that fails when the fix is reverted:
           - `solution-offer` ignores a deliverable ruled out after "ahead of" as well as ", not", and a hyphenated word counts as its parts when an offer is compared with the kind.
           - `falsified-change` leaves "so now it could" alone and catches "and now only sells".
           - The sentence measure skips an abbreviation's full stop ("St. Paul") and counts a second sentence that opens with an accented capital or a baht sign, in the harness and the tests.
           - The harness's own controls now run in the test suite (`src/tests/p1658-harness-self-test.test.ts`), not only by hand.
           - Re-scoring every arm with these changes moved no count and no hit, so the numbers below stand.
         - **Builder's Copy-prompt run** (fresh agent, sources `docs/lean-canvas.md`, `docs/goals.md` and `docs/decisions.md` only): `.private/canvas-rules-test/v10-copy-run1-79861bfa83cc.md`.
           - On the revision-4 measure it scores 0 in every box: no point over 20 words, nothing chained. Solution opens "The product is a chat and call app with an AI mirror for change leads' teams, not facilitated training"; the package sits in Offers & Pricing.
           - Every sampled claim was found in the three sources by grep (0 of 765, fishbowl, the fewer-than-3 falsifier, 100 to 1,000, paid and bounded, the discovery call, weeks late).
           - Two v9-heuristic hits, both read as fine: a Uses: point with one "which", and the owner's own word "bounded".
           - The agent's notes: it turned the 3-of-10 falsifier into the milestone target, marked "(target)"; it wrote no Pays: point because no source names the payer; no prices, because the price ladder is marked carried.
         - **A/B, v9-final against revision 4, 4 packs × 3 runs.** v10c is the first fix round; v10d adds the second review round's wording (`.private/canvas-rules-test/summary-v9final-vs-v10d.md`, `summary-v10c-vs-v10d.md`). The Done-When asks it to report the per-point measure per box; it does, per box in those files.

           | Pack | Over 20 words, v9-final → v10c → v10d | Chained, v9-final → v10c → v10d |
           |---|---|---|
           | salesmastermind-v2 | 6 → 0 → 0 | 8 → 0 → 0 |
           | claritypledge-stories | 12 → 0 → 0 | 12 → 0 → 0 |
           | organisations | 12 → 0 → 0 | 13 → 2 → 2 |
           | founder-v6 | 28 → 0 → 1 | 29 → 0 → 1 |

           Mean words per point: 20.6 (v9-final), 13.0 (v10c), 13.4 (v10d). Revision-4 violations: 150, 6, 13. Kept points: 123, 143, 142. One v10d founder-v6 run failed on the network and that pack was rerun; the failed file is kept beside it.

           | Arm | Runs with Solution | Runs with Offers & Pricing | Kind names what is bought (`solution-offer`) | Solution does not open "The product is" |
           |---|---|---|---|---|
           | v10 (first build) | 12 | 6 | 6 | 2 |
           | v10b (definition fix) | 9 | 8 | 5 | 1 |
           | v10c (plus routing wording) | 11 | 9 | 4 | 0 |
           | v10d (second review round) | 11 | 9 | 6 | 3 |

           A human read every v10d hit:
           - `solution-offer`, 6 real: organisations names a workshop as the kind in 3 of 3 runs (also in v10c), salesmastermind once ("event workshops"), founder-v6 a transcript package twice.
           - `solution-kind`, 3: all claritypledge-stories, where Solution opens with the outcome. A controlled rerun of that pack (3 runs each, only the routing clause differing) gave 2 kind points and 1 empty Solution with the new clause, and 0 Solutions of 3 with "names only", so the new clause is not the cause.
           - `chained`, 3: two organisations Go-to-market points with "who" and "where" that read as one idea, and one founder-v6 challenge with "who" and "but".
           - `point-words`, 1: a founder-v6 Problem point at 22 words.
           - Not caught by the measure: kinds that list the parts sold ("chat and meeting transcript service") and salesmastermind's "clarity sprint events" with Offers empty.

           At 3 runs per pack the v10c-to-v10d difference in `solution-offer` (4 to 6) is within run-to-run noise; the same packs produce it. When the owner's material describes the product only as a workshop or package, the drafting model names that as the kind, whatever the rule says. Whether a service business may name a workshop as its kind is a founder decision.
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
- v8: the routing rule is prompt-only. Nothing checks that a point landed in the right box: a problem written into Customer Segments, or a price into Solution, passes every engine check. In the Copy prompt the rule is the bare sentence without the map (word cap).
- v8: the eval's Segments lexicon (`canvas-eval-rules.ts`, `classifySegment`) scores industry, size, demographics and psychographics. It has no dimension for "what they buy or use today", so a segment named by role plus that and one other variable is flagged by the eval although the rule allows it.
- v9 (review, five rounds): the price engine (`canvas-price.ts`, older than v9) strips a period word it cannot tie to the stated price from an offer's name ("Weekly practice sessions" → "Practice sessions") and refuses "One coached session per week …: 295 EUR per month" outright. v9's "what is bought, then the price" shape makes such names likelier. An engine change, to build only if adopted.
- v9: in a round update, everyone's words are material, so a participant's suggested price reads as the owner's intended model. Before v9, rule 4's "considering" could mark it; the model boxes now carry no status.
- v9: nothing on the canvas page tells a reader that Solution, Offers & Pricing and Go-to-market strategy are the intended model, so a present-tense point there can read as current fact. Only the prompts carry the frame.
- v9: Offers & Pricing can sell to a group the same canvas's Customer Segments rules out (a founder-pack run: Segments "not owners who attend the free sales mastermind", Offers "Sales mastermind …: free"). The routing rule is prompt-only, and nothing checks consistency across boxes.
- v9: GLOBAL_RULES rule 2 ("Name observable actors, conditions, actions or terms") stays word for word under this spec's invariant, next to Offers' "no terms or conditions" and Go-to-market's "No waiting, conditions or dates". Copy-prompt run 4 obeyed the box rules; rewording rule 2 is a founder decision.
- v9: the Copy prompt sits at 1099 of its 1100 words. Any further rule needs a cut.
- v9: the engine drops a falsified point whose number the model reworded ("1.5 years" for "a year and a half": a number not in the material). The model wrote the organisations pack's falsified direction in 3 of 3 final runs; the engine kept 2.
- v9: the "up to 3 falsified expectations" change did not change v8.md, which already held 3. The founder's "it just shows one" was not reproduced from v8.md.
- v9: `--check-md` in `scripts/p1658-rules-ab-eval.ts` is a lexical filter for a human reader, not a judge. Known gaps found in review on synthetic shapes no run produced: "after", "before" or "provided" describing a deliverable fire `offer-filler`; a fenced block inside a box is parsed; trailing chatter after the last box reads as a point; the stance check looks only at "the business" as subject.

## Done-When

- [ ] New box rules drafted, shown to the founder side by side with the current ones.
- [ ] The founder has run the new Copy prompt on his own material; his output is saved in `.private/canvas-rules-test/` next to his current canvas.
- [ ] Revision 2 built: lead points in the five ranked boxes, grounded or left out; no "I", "we", "my", "our", "us", "me" or "you" in any point; the old/revision-2 A/B rerun with lead-point, pronoun and kept/dropped counts; the founder has run the revision-2 Copy prompt and marked the shuffled v6 + revision-2 list.
- [x] Revision 3 (v9) built: no status on Solution, Offers or Go-to-market points; Solution only the customer's steps; every offer names what is bought; no timing in Go-to-market; up to 3 falsified expectations; no "Lead:" in any template or output; the builder's own Copy-prompt run passes box by box before the founder runs it; deployed to TEST for the founder's in-app test.
- [x] At least two real canvases drafted with old and new rules, each side run twice; both runs of a side saved in one file, `.private/canvas-rules-test/<canvas>-old.md` and `-new.md`, and one side-by-side summary there that counts kept and dropped points per side.
- [ ] Revision 4 (v10) built: one idea per point in short sentences (measured per box in the A/B); Solution's first point names the kind of product and its category and the rest say what solving looks like, with no "then … then" steps; each standard box's rule checked against a cited Lean Canvas definition, differences reasoned; the builder's own Copy-prompt run passes box by box; the A/B (v9 against revision 4) reports the per-point sentence measure; deployed to the TEST lane for the founder's test, after the builder signs in there with Google and by email.
- [ ] The founder's decision recorded in `docs/decisions.md`: adopt, revise or drop; keep or move the reason in Solution and Guiding values; and what the falsified box becomes.
- [ ] If adopted, the drafting prompt, the Copy prompt and the empty-box questions all show the new rules (one text), and the canvas tests pass (including `src/tests/p1536-box-definitions.test.ts`, with its wording pins moved to the new wording).

## Related

P1508, P1536, P1529 (UAT where this came up), P1631, P1656 (scores), P1657 (owner positions; blocked by this) · `docs/story-point-model.md`.
