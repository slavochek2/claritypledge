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
related: [p1181, p1215, p1182, p1331]
---

# P1320: Review page — read your drafted problem as the reader will, fix it, send it

## Problem

**Situation:** `/slava:problem:submit` drafts one story plus three claims with anti-points. Today the member
confirms in a terminal, then composes by hand: create a draft, paste the story, add six points with positions,
un-mark the lead point so the story renders first, open the preview, send — about fifteen minutes per letter,
with one step that fails silently.

**Complication:** The problem board now asks every member for one current problem a week (P1319). Founder,
verbatim (2026-09-15):

> "15-minute manual filing for every letter is a doomed idea. It will never work … It has to be less than
> one minute per problem. It's just like reading and approving … giving feedback and then it's submitted."

> "Nobody will ever use terminal but me for testing or maybe one more person who I teach."

**Question:** What is the smallest product page on which a member reads their drafted problem exactly as a reader
will, confirms it, corrects it, and sends it?

## Appetite

**Blast radius: medium-high** — a new page and a new server-side write path creating a doc, a story, six points,
their links and positions under the member's own session. **Reversibility: medium** — rows are ordinary drafts.
**Decision density: a few** — copy, send-time defaults, typed vs voice feedback.

## Invariants

- **The story leads.** `point_config.lead_count` defaults to 1 when unset, which renders the first point before
  the story for multi-point letters (decisions.md 2026-08-31, the paste-path entry;
  `src/app/utils/letter-reading-utils.ts`). The create path sets story-first itself, and the rendered page proves it.
- **The reading question is the default one** — *"how well did you understand the sender?"* Nothing here writes
  the reverse-story marker.
- **A person presses send.** No automated path sends, including a future agent path (P1215: agents never send,
  publish or invite).
- **Confirmation is against the anti-point, per claim, and happens here only** — P1319 moves it off the terminal;
  a member never confirms the same claim twice.
- **All or nothing.** Creating the draft never leaves a partial graph behind; a retry with the same draft id
  creates nothing new.
- **Identity comes from the session.** The write path derives author, sender and position owner from `auth.uid()`
  and rejects any caller-supplied identity.

## Solution

**Precondition:** the member is signed in with a **verified** account. Story, point and position inserts require
it (`supabase/migrations/20260809150000_p1032_bind_insert_author_predicates.sql`; point positions bind `user_id`
to `auth.uid()`). An unverified member sees how to verify, not a failing form.

1. **Bring the draft in.** v1: paste the block `/slava:problem:submit` emits. The page validates it against
   **P1319 §Problem Block Format** before anything else, and names the failing field if invalid. When P1215 phase 2
   exists, the member's agent creates the draft directly and this step disappears.
2. **Create the draft atomically** through **one new authenticated server-side function** that creates the doc,
   story (with the want sentence), six points, links, the member's positions and `lead_count = 0` in one
   transaction, keyed by `draft_id`. Existing client services create these in separate calls and cannot provide
   this guarantee (`docs-service`, `stories-service-real`, `points-service-real`, `letters-service`).
3. **Read it as the reader will**, using the same reading components as `/letter/:docId/preview`.
4. **Review:** rate the story 0–10 for "this is what I mean" — below 8 cannot be sent (the floor recorded for the
   review surface in the 2026-09-08/10 design sessions; carried in `docs/problem-board-process.md`); for each claim
   pick the point or the anti-point as yours, or rewrite the wording.
5. **Send** — sealing stays the existing, separate human action. Audience:
   - **one named person** (private) — works today;
   - **the member's community** — requires P1181; **this is the option the first event needs**;
   - **anyone with the link** — requires the story to be public, stated to the member at send time.
     *(Corrected 2026-09-17: the seal snapshots private stories for one-to-one letters **and** for
     community letters — P1181 widened that filter deliberately, which is what makes a community
     letter from a private problem draft possible at all. Public-link letters stay public-only.)*

   **The audience control is P1331's**, not this page's: the picker, the write that sets the audience
   on the draft, and the words naming who can read it. This page owns only where that control sits in
   the review flow. The send-time copy and the default-audience call are recorded as founder decisions
   **in P1331** and deliberately not duplicated here — two specs cannot each own the same default.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A network or policy failure leaves a half-built draft | MITIGATE | One transactional server function; idempotent on `draft_id` |
| A caller forges another member's identity through the new function | MITIGATE | Identities derived from `auth.uid()` only; tests with a second account |
| Members skip reading and send | ACCEPT | The 8-of-10 floor and per-claim choice are the brake; measure time on page |
| Paste step is still a context switch | DEFER | Removed by P1215 phase 2 |

**Non-Goals**
- Do NOT let the page call an AI to redraft wording in v1 — the member edits text directly.
- Do NOT implement voice input or transcription in v1 — the founder's stated direction, as a follow-up.
  `[FOUNDER DECISION: confirm typed-only for v1]`
- Do NOT change `/letter/:docId/preview` or the existing compose flow.
- Do NOT build community visibility here — P1181 owns the backend, and **P1331 owns the send-screen
  door** (the audience picker and the write path that sets it). Reuse P1331's picker and write path
  rather than building a second one; this page owns only how the audience is confirmed at send.
  *(Added 2026-09-17: P1331 did not exist when this spec was written, so this routing named only
  P1181 and the two specs pointed past each other — neither claimed the picker.)*
- Do NOT build agent drafting here — P1215.

## UX Notes

States: not signed in / not verified; empty (how to get a draft); invalid block (failing field named, nothing
written); reviewing; send blocked (story below 8, or a claim without a choice); sent (link to the letter as sent).

## Acceptance Criteria

- [ ] A verified member pastes a valid block and sees the problem rendered story-first, as a reader will
- [ ] An invalid block is rejected with the failing field named, and no row is written
- [ ] A failure injected after the first insert leaves no draft rows; re-submitting the same `draft_id` creates no duplicate
- [ ] A second account cannot create rows attributed to the first through the new function
- [ ] Sending is impossible until the story is rated 8 or higher and each claim has a choice
- [ ] A sent letter, opened by its recipient, shows the story first and asks "how well did you understand the sender?"
- [ ] Review and send of a prepared draft takes a member under one minute, measured on two real members
- [ ] Existing compose and preview flows behave as before (their tests pass)

## Open Questions

1. Does rewriting a claim on the page re-trigger its anti-point choice?
2. Where does a member land from the event — straight into this page, or via their letters list?

## Related

- P1319 — owns the block format this page parses (blocked by)
- P1181 — adds the community audience; required for the first event, not for this page's v1
- P1215 — replaces the paste step with agent drafts
- P1182 — reads what this page sends
- [docs/problem-board-process.md](../docs/problem-board-process.md)
