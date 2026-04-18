---
status: rejected
type: story
rank: 0.587
created_date: '2026-04-06'
tags:
  - letters
  - live
  - interleave
  - verification
superseded_by: p703
---

# P663: Letter–Live Interleave — Per-Story Jump to /live

**Related:** P581 (letters — `source_letter_id` on sessions, D26), P624 (understanding grid — letter vs live dots), P660 (letters navigation), P562 (live simplification)

---

## Problem

**Situation:** Letters collect async understanding data (receiver rates, author predicts, gap revealed). /live collects real-time verified understanding (paraphrase protocol). P581 connects them only at the END — a "Ready for /live?" CTA on the completion summary, after ALL stories are done.

**Complication:** In workshops and partner sessions, both people are co-present. The natural rhythm is: read a story → see the gap → talk about it NOW → move to next story. Forcing "finish all stories first, then /live" breaks this rhythm. The gap is freshest right after reveal — that's when the conversation should happen.

**Question:** How do we let people jump from a letter story directly into /live for that story, then return to the letter for the next one?

## Appetite

Medium blast radius (touches letter reading flow + /live session initialization). Medium reversibility (new entry point into /live, but /live itself unchanged). Low decision density — roles and stories are already determined by the letter context.

## Solution

After each per-story gap reveal in the letter reading flow, show a "Go live on this" button alongside the existing "Next story" button. Tapping it opens a /live session pre-loaded with:
- **The story** — no selection step needed
- **Roles** — letter author = speaker, letter receiver = listener (matching /live's explain→paraphrase protocol)
- **Source tracking** — `source_letter_id` + `story_id` on the session (D26 hook, already in schema)

After the /live verification round completes (or is skipped/ended), the user returns to the letter at the next story in sequence.

**Role swap within a story:** After the initial round (author explains, receiver paraphrases), a "Switch roles" button lets the receiver become speaker to explain their interpretation. The author then paraphrases back. This produces two `story_verifications` rows — same story, swapped `speaker_id`/`listener_id`. The data model already supports this.

**Letter ratings as pre-verification:** The letter's sealed-bid ratings (prediction + self-rating) become the "pre" data point. /live produces the "post-discussion" data point. D21 in P581 already designed this: dashed dot (letter) → solid dot (live) → arrow = movement.

## Risks / Non-Goals

### Risks
- **Co-presence required.** This only works when both people are present. If receiver is reading alone, the button should not appear (or should be disabled with explanation). Detection: check if a /live session with the letter's author is active or if both users are online.
- **Session lifecycle complexity.** Starting/ending mini /live sessions per story vs. one long session. Simpler: one /live session stays open, letter navigates which story is active within it.

### Non-Goals
- Do NOT change the existing end-of-letter "Ready for /live?" CTA — it stays for the async-then-live flow
- Do NOT modify /live's core paraphrase protocol — only the entry point changes
- Do NOT build async signaling ("I'm ready for /live on story 3, join me") — co-present only for V1
- Do NOT change letter reading sequence or rating mechanics
- Do NOT add role swap to regular /live sessions (only letter-initiated ones for now)

## Done-When

- [ ] "Go live" button appears after each per-story gap reveal in letter reading flow
- [ ] Tapping it enters /live with story pre-selected and roles pre-assigned (no selection/claiming step)
- [ ] /live session records `source_letter_id` linking back to the letter
- [ ] After /live round completes, user returns to letter at next story
- [ ] Letter ratings persist as pre-verification; /live produces post-verification data points
- [ ] Role swap button available within a letter-initiated /live round
- [ ] Button hidden/disabled when the other person is not co-present
- [ ] Existing end-of-letter /live CTA still works unchanged

## UX Notes

**Happy path:** Person B reads story 1 in letter → rates → gap revealed → taps "Go live" → both enter /live → author explains → receiver paraphrases → sealed-bid → reveal → optionally swap roles → "Back to letter" → story 2 begins.

**Skip path:** Person B sees gap, doesn't want to discuss now → taps "Next story" as usual. /live button is optional, not blocking.

**Co-present detection:** [FOUNDER DECISION: How do we know both people are present? Options: (a) letter author is in an active /live session — receiver joins it, (b) simple "invite to join" button that creates a session and shows a join code, (c) always show the button, let it fail gracefully if partner isn't there.]

## Acceptance Criteria

- [ ] Letter reading flow shows "Go live on this" after each story's gap reveal
- [ ] /live session starts with correct story and roles without manual selection
- [ ] Two `story_verifications` rows created when roles swap (same story, swapped speaker/listener)
- [ ] Pre-verification (letter) and post-verification (live) data points coexist for same story
- [ ] Navigation back to letter resumes at correct position
- [ ] Works in workshop scenario (facilitator + participant) and partner scenario (A + B)
