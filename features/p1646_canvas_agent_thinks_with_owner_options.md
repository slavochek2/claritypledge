---
status: in-progress
type: story
rank: 110
workstream: canvas
created_date: '2026-11-06'
tags: [canvas, mirror-agent]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 5af58fafd2e2f699ef486c98ddb597d37f378d13858a4ec0b2c8b161ab9c0aa8
spec_review_vendors: [codex, gemini, openrouter]
---

# P1646: Canvas agent thinks with the owner instead of refusing

## Problem

**Situation:** In a canvas thread the mirror agent writes points only from the owner's material, and when a message clashes with the canvas or is not supported it changes nothing and says why.
**Complication:** The founder's own prod test on a canvas holding Dropbox points:
- "Problem 'Today people do not like juice'" → `Nothing changed on the canvas. I noted: "The requested point about juice contradicts the supported offer material for Dropbox and lacks evidence."`
- "Problem make it more about orgnaizations that waste money on other tools" → `Nothing changed on the canvas. I noted: "The provided source material does not mention organizations wasting money on other tools, so the problem point was kept as supported."`

The owner is the source, yet the agent treats their statement as a claim to check against older material and refuses.
**Question:** How should the agent answer when the owner says something that conflicts with the canvas or has no support yet?

> Founder, verbatim: "it should be more helpful, like maybe with options... thinking with me. So if I say something contradictory, he would say, if you go with this, it would mean this and this and this. Do you accept version A, B, C... Not like so reluctant."
> "it should say I'm not sure this is good it contradicts this and this and this I would recommend that and that but if you want you can go with this and these options that would mean that and that please confirm ABC what you like and for example A recommended"

## Appetite

High blast radius: it changes every canvas chat reply that meets a conflict, and the model's instructions for all drafts. Reversible, but not prompt-only: the agent never sees its own earlier replies (`canvas-thread.ts` reads owner messages only, a P1536 rule), so an offered choice must be stored between turns, which needs a migration, and the model's response format needs an options field (today a one-sentence `note`, cut at 160 characters). A few founder decisions: the reply wording and which options exist.

## Solution

1. **The owner's statement about their own canvas is evidence.** A statement in the owner's thread may replace or add a point even when older material says otherwise. This is new: the prompt today tells the model to keep supported points. Nothing is added without showing the owner's words (decision 2026-11-05, P1625).
2. **A conflict gets options, not a refusal.** When the owner's message conflicts with points on the canvas, the agent replies in this order, and changes nothing until the owner picks:
   - what it conflicts with, naming the current points;
   - its recommendation, and why;
   - each option and what choosing it would mean for the canvas (for example: replace it, so Solution and Revenue should follow; add it beside the current point; keep the canvas as it is);
   - "Confirm A, B or C", with the recommended one marked.
3. **The offered choice is stored, then the owner's pick is acted on.** The run that offers options stores them with the draft (the option, its actions on current point ids, and the owner's quote). The server, not the model, refuses any write while a choice is open. A reply naming an option ("A", "go with B") applies it, with the usual note of what changed and from which words. "Keep" changes nothing and says so. A choice goes stale when the canvas changes before the pick; a stale or unknown pick is answered by offering the choice again.
4. **No facts still writes nothing, but always gives a next step.** "Make it a Dropbox canvas from memory" writes nothing, and the reply says what the owner could tell it instead. Never a bare refusal.

**Founder decisions, 2026-11-06:**
- **D1. An option changes only the box it names.** It may suggest other boxes to revisit ("Solution and Revenue may need updating, want me to?"), and acts on them only after the owner says so.
- **D2. Reply shape and wording**, approved from this draft (the agent fills the brackets):

  > I'm not sure about this. It contradicts your current [box], "[current point]". I'd recommend [X], because [reason].
  > A (recommended). [option and what it means for the canvas]
  > B. [option and what it means]
  > C. Keep the canvas as it is.
  > Reply A, B or C.

- **D3. At most three options.**
- **D4. Reverses P1625's "picking among versions is not built"**, at the founder's request.

## Invariants

- The model never invents facts about the owner's business. Owner statements are evidence; the model's own knowledge is not (P1536, as amended 2026-11-05).
- A pending choice never changes the canvas until the owner picks.
- Points carrying numbers the owner never said stay refused (P1536).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The agent offers options for things that are not conflicts, so every reply becomes a question | MITIGATE | Options only on a named conflict with a current point; a plain new point is just added |
| A pick ("A") is read against the wrong pending choice | MITIGATE | The pick applies only to the latest open choice in that thread |
| A conflict now costs two runs (offer, then pick) against the draft's 30-run cap | ACCEPT | Unchanged cap; raise only if owners hit it |
| A wrong option is published unread | ACCEPT | Same as best guess: the owner sees the change and its words |
| Unsupported is mistaken for conflicting, or the reverse | MITIGATE | Conflict = the message contradicts a current point; a statement with no current point to contradict is added as a best guess (P1625) |

**Non-Goals**
- Do NOT add buttons or chips for the options in this spec; options are text the owner answers in chat.
- Do NOT change publishing, sharing or the run cap.
- Do NOT change the two-word evidence rule or the best-guess check (P1625, P1639).

## Acceptance Criteria

- [ ] A fixture canvas whose Problem is "Teams lose files across devices": the owner sending "the problem is organisations waste money on other tools" gets a reply naming that point, a recommendation, at least two options each with one line of what it means for the canvas, and a request to confirm one; the canvas is unchanged and the choice is stored
- [ ] Replying with the letter of a replace or add option applies exactly that option, and the reply says what changed and from which words; "keep" changes nothing and says so
- [ ] A pick with no open choice, or after the canvas changed, is answered by offering the choice again; nothing is written
- [ ] A plain new point with nothing to contradict is added as before, with no question
- [ ] "Make it a Dropbox canvas from memory" writes nothing, and the reply asks for a fact the owner can give
- [ ] A number the owner never said stays refused when an option is applied
- [ ] Real model on TEST, 5 runs per case above, each case passing at least 4 of 5, recorded in the spec
- [ ] Existing canvas suites pass

## Related

P1625 · P1639 · P1536 (its `conflicts` and tensions plumbing is not used for this: tensions are no longer written, and nothing asks the model for `conflicts`) · P1621 (cards by hand)
