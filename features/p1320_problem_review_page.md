---
status: week
type: story
rank: 104
workstream: problem-board
created_date: '2026-09-15'
tags: [problem-board, letters, review, preview]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
blocked_by: [p1319]
blocks: []
related: [p1181, p1215, p1182]
---

# P1320: Review page — read your drafted problem as the reader will, fix it, send it

## Problem

**Situation:** `/slava:problem:submit` drafts one story plus three claims with anti-points. Today the
member reviews it in a terminal, then composes it by hand in the letters UI: create a draft, paste the
story, add six points one by one with positions, un-mark the lead point so the story renders first,
open the preview, and send — about fifteen minutes per letter, with one step that fails silently.

**Complication:** The problem board now asks every member for one current problem a week (P1319). Founder,
verbatim (2026-09-15):

> "15-minute manual filing for every letter is a doomed idea. It will never work … It has to be less than
> one minute per problem. It's just like reading and approving … giving feedback and then it's submitted."

> "Nobody will ever use terminal but me for testing or maybe one more person who I teach."

**Question:** What is the smallest product page on which a member reads their drafted problem exactly as
a reader will, corrects it, and sends it — without the manual compose steps?

## Appetite

**Blast radius: medium** — a new page plus a write path that creates a story, six points and positions
under the member's own session; the existing compose and preview flows must keep working.
**Reversibility: medium** — rows it writes are ordinary drafts and letters. **Decision density: a few** —
copy, feedback input mode, and the send-time visibility options (below).

## Invariants

- **The story leads.** The page must never produce a letter whose first rendered element is a point.
  `point_config.lead_count` defaults to 1 when unset, which renders the first point before the story
  (decisions.md 2026-08-31, the paste-path entry). The page sets story-first itself and the preview proves it.
- **The reading question is the default one** — *"how well did you understand the sender?"* — never the
  reverse-story question. Nothing on this page writes the reverse-story marker.
- **A person presses send.** No automated path sends, including a future agent path (P1215 non-goal:
  agents never send, publish or invite).
- **Confirmation is against the anti-point, per claim** — carried from P1180 / P1319. A single
  "looks good" does not approve three claims.
- **Nothing is sent that the member did not see rendered** in the reading flow on this page.

## Solution

One page reached from a drafted problem:

1. **Bring the draft in.** v1: the member pastes one block that `/slava:problem:submit` prints (story +
   three claims + anti-points + labels). The page validates it and shows exactly what failed if the block is
   malformed. When P1215 phase 2 exists, the member's agent creates the draft directly and this step disappears.
2. **Read it as the reader will**, using the same reading components as `/letter/:docId/preview`.
3. **Review, per part:** rate the story 0–10 for "this is what I mean" (below 8 cannot be sent); for each
   claim pick the point or the anti-point as yours, or rewrite the wording in place.
4. **Send**, choosing who can read it: one named person (private), or anyone with the link (public).
   A **group** option appears only when P1181 lands. `[FOUNDER DECISION: send-time copy, and which option is the default]`

Voice feedback through the existing transcription infrastructure is the founder's stated direction
(*"he talks, talks, talks and then it's transcribed"*) and is a follow-up, not v1.
`[FOUNDER DECISION: confirm typed-only for v1]`

**UNVERIFIED — check at /architect:** whether one submit can create story, six points and positions in a
single step through existing services, or needs a new server function. `createLetter`
(`src/app/data/letters-service.ts:59`) exists; no single-call story+points+positions creator was found by grep.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A malformed pasted block creates half a draft | MITIGATE | Validate the whole block before any write; one atomic create |
| Members skip reading and send | ACCEPT | The 8-of-10 floor and per-claim choice are the brake; measure send-time-on-page |
| Link-shared letters need a public story (seal rule for one-to-many) | ACCEPT | Stated to the member at send time; group-only waits for P1181 |
| Paste step still costs a context switch | DEFER | Removed by P1215 phase 2 agent drafts |

**Non-Goals**
- Do NOT let the page call an AI to redraft wording in v1 — the member edits text directly.
- Do NOT change `/letter/:docId/preview` or the existing compose flow.
- Do NOT add group visibility here — that is P1181.
- Do NOT build agent drafting here — that is P1215.

## UX Notes

States: empty (no draft yet — show how to get one), invalid paste (name the failing part), reviewing,
blocked send (story rated below 8, or a claim without a choice), sent (link to the letter as sent).

## Acceptance Criteria

- [ ] A member pastes the block from problem-submit and sees their problem rendered story-first, as a reader will
- [ ] A malformed block is rejected with the failing part named, and nothing is written
- [ ] Sending is impossible until the story is rated 8 or higher and each claim has a choice
- [ ] Editing a claim's wording on the page changes what the reader sees
- [ ] A sent letter, opened by its recipient, shows the story first and asks "how well did you understand the sender?"
- [ ] From paste to sent takes a member under 3 minutes on a prepared draft, measured on two real members
- [ ] Existing compose and preview flows behave as before (their tests pass)

## Open Questions

1. Should rewriting a claim on the page re-trigger the anti-point choice, or keep it?
2. Where does a member land from the event page — straight into this page, or via their letters list?

## Related

- P1319 — produces the block this page reads (blocked by)
- P1181 — adds the group send option
- P1215 — replaces the paste step with agent drafts
- P1182 — reads what this page sends
- [docs/problem-board-process.md](../docs/problem-board-process.md)
