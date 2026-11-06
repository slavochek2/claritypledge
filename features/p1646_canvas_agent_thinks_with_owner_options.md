---
status: week
type: story
rank: 110
workstream: canvas
created_date: '2026-11-06'
tags: [canvas, mirror-agent]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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

High blast radius: it changes every canvas chat reply that meets a conflict, and the model's instructions for all drafts. Reversible: code and prompt only, no migration expected (UNVERIFIED: pending options may need storing between turns). A few founder decisions: the reply wording and which options exist.

## Solution

1. **The owner's statement about their own canvas is evidence.** A statement in the owner's thread may replace or add a point even when older material says otherwise. Nothing is added without showing the owner's words (decision 2026-11-05, P1625).
2. **A conflict gets options, not a refusal.** When the owner's message conflicts with points on the canvas, the agent replies in this order, and changes nothing until the owner picks:
   - what it conflicts with, naming the current points;
   - its recommendation, and why;
   - each option and what choosing it would mean for the canvas (for example: replace it, so Solution and Revenue should follow; add it beside the current point; keep the canvas as it is);
   - "Confirm A, B or C", with the recommended one marked.
3. **The owner's pick is acted on.** A reply naming an option ("A", "go with B") applies it, with the usual note of what changed and from which words.
4. **No facts still writes nothing, but always gives a next step.** "Make it a Dropbox canvas from memory" writes nothing, and the reply says what the owner could tell it instead. Never a bare refusal.

[FOUNDER DECISION: exact reply wording, including the lead-in (founder's draft: "I'm not sure this is good, it contradicts..."), the option labels and how the recommendation is marked.]
[FOUNDER DECISION: which options are offered, and whether the agent may offer more than three.]

## Invariants

- The model never invents facts about the owner's business. Owner statements are evidence; the model's own knowledge is not (P1536, as amended 2026-11-05).
- A pending choice never changes the canvas until the owner picks.
- Points carrying numbers the owner never said stay refused (P1536).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The agent offers options for things that are not conflicts, so every reply becomes a question | MITIGATE | Options only on a named conflict with a current point; a plain new point is just added |
| A pick ("A") is read against the wrong pending choice | MITIGATE | The pick applies only to the latest open choice in that thread |
| A correction or pick uses up one of the draft's 5 runs | ACCEPT | Unchanged cap; raise only if owners hit it (decision 2026-11-05) |
| A wrong option is published unread | ACCEPT | Same as best guess: the owner sees the change and its words |

**Non-Goals**
- Do NOT add buttons or chips for the options in this spec; options are text the owner answers in chat.
- Do NOT change publishing, sharing or the run cap.
- Do NOT change the two-word evidence rule or the best-guess check (P1625, P1639).

## Acceptance Criteria

- [ ] On a canvas whose Problem says one thing, the owner stating a conflicting problem gets a reply naming the current point, a recommendation, options with their consequences and "confirm A, B or C"; the canvas is unchanged
- [ ] Replying with an option applies it, and the reply says what changed and from which words
- [ ] "Make it more about organizations that waste money on other tools" on the founder's test canvas replaces or adds the point (after the owner's pick) instead of "Nothing changed"
- [ ] "Make it a Dropbox canvas from memory" writes nothing and the reply gives a next step
- [ ] Measured with the real model on TEST, recorded in the spec
- [ ] Existing canvas suites pass

## Related

P1625 · P1639 · P1536 (conflict notes and tensions already exist in the draft engine: UNVERIFIED how they map to this) · P1621 (cards by hand)
