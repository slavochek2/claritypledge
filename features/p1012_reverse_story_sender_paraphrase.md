---
status: week
type: story
rank: 1000952.0
workstream: letters
created_date: '2026-07-30'
tags:
  - letters
  - verification
  - stories
  - calibration
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1012: Reverse Story — sender paraphrases the receiver's position, receiver scores it

## Problem

**Situation:** Every story in the product has one author who owns both the *text* and the
*lived experience* behind it. A letter runs one direction: the sender authors stories, the
receiver rates how well they understood them. Where a receiver is asked to supply their own
reasoning, the field is empty — "explain why."

**Complication:** There is no way to state someone *else's* position back to them. When you
want to say "here is my understanding of why you hold that view," the text is authored by you
but the experience belongs to them — and no entity supports that split. The empty
"explain why" field also loads the work onto the other person, which is the friction that
stalls adoption: a draft they can correct costs them less than a blank they must fill, and
being mis-stated in a specific way provokes far more correction than being asked a question.
Correction volume is the signal we want.

**Question:** Can a sender author a paraphrase of the receiver's position, have the receiver
score it on **author-side comprehension** ("does this capture my intended meaning?"), and —
above threshold — adopt or amend it as their own story?

## Appetite

**Medium blast radius** — touches the story authorship model (a definitional section in
`docs/story-point-model.md`) and the letter reading flow. **Reversible** — additive entity;
the existing sender-story → receiver-rating path is untouched. **Low-medium decision
density** — the two live decisions are already made (adoption threshold ≥8 for consistency
with the existing Verification Threshold; sender's predicted *position* never shown). The
rest is mechanical.

Gated on evidence: this is motivated by a specific need (deconstructing a two-party transcript
into positions and stories). The markdown-only version runs first. Build only if the paraphrase
actually provokes correction.

## Solution

A **reverse story**: a story artifact whose *text author* and *experience owner* differ.

- The **sender** authors a paraphrase of the receiver's position — their lived reasoning as
  the sender understands it.
- In the letter, the receiver sees it explicitly labeled as the sender's attempt to state
  *their* position — never as an anonymous draft.
- The receiver answers one question: **"How well does this capture your intended meaning? 0–10."**
  This is the *author-side* score — the half that cannot be self-certified, and the half the
  letter does not currently capture (today's letter rates receiver-side only).
- At **≥8** the receiver may **adopt** it as their own story, with an edit pass before adopting.
  A paraphrase they amend is a stronger signal than one accepted verbatim.
- The sender's **predicted position** (agree/disagree on the associated point) is recorded
  privately as a calibration record scored later against the receiver's actual answer. It is
  **never rendered to the receiver.**

**Anchoring guard:** the paraphrase surfaces only *after* the receiver has committed their own
position. Showing it earlier contaminates the measurement for the same reason letters are
sealed-bid.

## Risks / Non-Goals

### Risks

- **Anchoring.** A paraphrase shown before the receiver states their own position tells them
  what to think. *Mitigation:* hard-gate rendering behind the receiver's own position commit;
  cover with a test that asserts non-render in the pre-commit state.
- **Acquiescence.** A draft that is too good gets passively accepted and measures nothing.
  *Mitigation:* require edit-or-explain at adoption; track adopt-verbatim rate as a quality
  signal — a high rate is suspicious, not successful.
- **Model extension, not just UI.** `docs/story-point-model.md` defines a Story as having *an*
  author. Splitting text-authorship from experience-ownership modifies a section marked
  **stable**. *Mitigation:* route the definitional change through
  `/slava:maintain:docs-strategy-update` before editing; do not let the implementation silently
  redefine the model.
- **Duplicate build with P949.** P949 (author scores the receiver's paraphrase) is the same
  mechanic mirrored — in both, the experience-owner scores someone else's paraphrase.
  *Mitigation:* at expansion, read P949 and P904's "Deferred Ideas" first and reuse the scoring
  and sealed-reveal machinery rather than building a parallel path.

### Non-Goals

- Do NOT show the sender's predicted **position** to the receiver, under any condition
- Do NOT surface the paraphrase in the generic "new story" flow — a draft with no provenance is
  both confusing and anchoring
- Do NOT build on `story_explain_backs` — it is the opposite direction (receiver explains the
  sender's story), audio, and unrated
- Do NOT change the existing sender-story → receiver-rating path
- Do NOT design doc-side clustering or sections (separate spec)
- Do NOT introduce a second verification threshold — reuse ≥8

## Done-When

- [ ] Receiver sees a sender-authored paraphrase of their own position, explicitly attributed
      to the sender
- [ ] Paraphrase does not render until the receiver has committed their own position
- [ ] Receiver can score it 0–10 on "captures my intended meaning"
- [ ] At ≥8 the receiver can adopt it as their own story, with an edit pass available first
- [ ] Sender's predicted position is never present in any payload reaching the receiver
      (verified at the RPC/response level, not just the UI)
- [ ] Adopt-verbatim rate is observable

## UX Notes

- **Attribution is the first thing read.** "This is how {sender} understands your position" —
  before the text, not after.
- **States:** not-yet-unlocked (receiver hasn't committed their position) · unlocked-unrated ·
  rated-below-threshold · rated-at-threshold (adopt offered) · adopted.
- **Adoption is an edit surface, not a button.** Opening adoption opens the text for amendment.
- The receiver must be able to score low without that reading as a rejection of the sender —
  a low score is the product working, and the copy should say so.

## Acceptance Criteria

- [ ] A sender can attach a paraphrase of the receiver's position to a point in a letter
- [ ] The receiver rates author-side comprehension and the score is recorded
- [ ] Adoption produces a story owned by the receiver, distinct from the sender's original text
- [ ] Sealed-bid property of the existing letter is preserved and covered by a regression test

## Alternatives Considered

- **Extend `story_explain_backs`** — rejected. Opposite direction (receiver → sender's story),
  audio medium, and no rating exists in v0. Nothing load-bearing is reusable.
- **Reuse P949's scoring path** — not rejected; preferred if P949 ships first. Same
  experience-owner-scores-a-paraphrase mechanic, mirrored. Revisit at expansion.
- **Leave the "explain why" field empty** — the status quo. Rejected on the friction argument:
  a blank asks the receiver for unpaid work; a wrong draft asks only for a correction, and the
  correction is the signal.
