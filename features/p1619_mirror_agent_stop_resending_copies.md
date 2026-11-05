---
status: week
type: story
rank: 95
workstream: clarity-chat
created_date: '2026-11-05'
tags: [mirror-agent, context, cost, privacy]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1619: The mirror agent stops re-sending copies once the talk moves on

Step 1 of the plan the founder approved in [P1615](p1615_mirror_agent_context_loading.md). It adds no new reach.

## Problem

**Situation:** P1604 is on prod. A Clarified transcript session lands in the main mirror chat and gets a larger profile: up to 100,000 tokens in, 4,000 out, reserved at $0.225.

**Complication:** That profile applies to every later reply while the copy is among the offered rows, until 300,000 characters of newer messages push it out. An unrelated question can re-send the transcript, at $0.18 from 1 January. The shared reply cap then runs out after about 27 such replies a day. Separately, no message time reaches the model, the main chat prompt never says what it left out, the ledger ignores cached tokens, and the privacy policy says a copy holds "up to 100 replies" while a session copy holds 720 lines.

**Question:** How does a copy stay fully available while people talk about it, and stop costing anything once they do not?

> Founder, 2026-11-04: "For example, I forward something and clarify whatever I'm sending has to be read."
>
> Founder, 2026-11-04: "everything should be inside for a reference when I talk about it. But maybe not every chat."

## Appetite

Blast radius: every mirror reply, and the reservation. Reversibility: high; no stored data changes, and SQL and code can revert. Decision density: two founder calls, below.

## Invariants

The P1615 invariants apply. In particular:
- A deleted original is not sent; a copy keeps its text; a folded line is still a copy's content, so anyone named on it is in `derived_refs` (P1544, P1546).
- Spend is reserved before the call and never lowered on the hope of a cache hit (P1547).
- The agent never claims to have read a folded copy. A clipped copy never reads as complete.
- People do not name sources (P1615 ruling).

## Solution

1. **Folding, decided in SQL.** Offer selection and the reservation both use the fold state, so a folded copy neither crowds out older messages nor keeps the $0.225 reservation. A folded copy is one line: who, when, how long, "not shown".
2. **When it is open.** Always when just sent, and in its own thread. In the main chat, while the talk stays on it, as the founder ruled, not after a fixed count alone. [FOUNDER DECISION: the fallback count. Recommend it stays open for the next 5 owner messages, and each message naming its speakers, title or date restarts that count. No model call decides this.]
3. **Reopening.** A later message naming the speakers, title or date reopens it for that reply, with the full reservation, recorded in `derived_refs`. A pronoun with nothing to match does not reopen it; the agent says what it has set aside and asks. Full follow-up memory arrives with search in step 3.
4. **Dates.** Every item carries its time; a copied thread carries its replies' original times, never the copy time as theirs. The instruction gives today's date with a stated time zone. [`/dev`: whose time zone, from what exists.]
5. **The omission note.** The main chat prompt says how much it left out, as the thread scope already does.
6. **The ledger** charges cached tokens at the cached rate. The reservation does not change.
7. **Privacy line.** [FOUNDER DECISION: wording. Draft: "The copy holds the author's name, the text, the time, the name of the chat it came from, and the replies in its thread that you can read: up to 100, or up to 720 lines for a transcript session."] Whether this needs a terms notice is a founder call; the draft changes a number, not a kind of data.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fold too early: "what did Bob say at the end?" gets no answer | MITIGATE | Naming reopens it; the line says it is set aside; AC below |
| Word match reopens a large copy by accident, costing a full reply | ACCEPT | Bounded by the existing reservation and caps; measure before tuning |
| Fold state changes which rows reach the model, so `derived_refs` could drift | MITIGATE | Refs follow what is offered, with an erasure test on a folded copy |
| A pronoun-only follow-up after folding feels forgetful | DEFER | Step 3 of the P1615 plan owns the source pointer |
| Hostile text in a copy's title on the folded line | MITIGATE | Quoted like other user-set fields |

**Non-Goals**
- Do NOT change the prompt into several turns or add a model turn for caching (A2). It is held until injection tests and hit rates exist.
- Do NOT add search, tools, a router, embeddings or stored summaries.
- Do NOT change the window, the daily caps or who can read what.
- Do NOT change Clarify's snapshot behaviour.

## Acceptance Criteria

- [ ] After Clarifying a session and asking about it, the agent answers from the whole transcript.
- [ ] A follow-up in the main chat a few messages later still answers from it.
- [ ] Once the talk has moved on, an unrelated question does not send the transcript and reserves the standard amount, shown on test by the request and the ledger.
- [ ] Asking again by a speaker's name or the session's date reopens it and gets a correct answer.
- [ ] Older messages crowded out by the copy before folding now reach the model after it folds.
- [ ] "What did she say last Tuesday?" answers with the right date, including for a reply inside a copied thread.
- [ ] When history is cut, the agent can say it did not see all of it.
- [ ] Erasing a person named on a folded line clears answers built on it, including during a starting job.
- [ ] The extended red-team suite passes on the changed prompt, with its positive control.
- [ ] The privacy page matches what is stored. `[post-deploy]` re-read it on prod.

## Cost Budget

Registry: the Gemini row in `docs/technical/metered-services.md`. Prices from 1 January: $1.50 in, $7.50 out, per 1M.

| Measure | Per reply | Per user per day | Per test run |
|---|---|---|---|
| Unrelated reply with a session copy, today | 100,000 × $1.50/M + 4,000 × $7.50/M = $0.18 | Set by the private caps | n/a |
| Same, folded | At most 50,000 × $1.50/M + 1,200 × $7.50/M = $0.084; real histories far less | Same caps | n/a |
| Reply about the session | Unchanged, $0.18 | Same caps | n/a |
| Integration test on test | n/a | n/a | About 6 model replies × at most $0.09 at today's price = $0.54 |

Supabase requests per reply and log lines: unchanged. No new trigger or per-row call beyond the existing selection.

1. **Fits the plan limit today?** Yes; it only lowers spend.
2. **Fits at 10×?** The caps refuse further replies first, and later than today.
3. **If either answer is no:** nothing here raises cost, so no change.

## Related

**Duplicate check:** RELATED: P1615, P1604, P1547, P1546, P1544. No duplicate; searched "fold, re-send, session_thread, reply_session_max". PRIVATE LOG: searched.

**Rulings carried:** P1615 founder rulings and approved plan 2026-11-04 · decisions 2026-10-23 (P1547) · 2026-10-22 (P1544, P1546) · 2026-11-04 AI features rule.

[P1615](p1615_mirror_agent_context_loading.md) · [P1604](done/2026-06-10/p1604_transcription_belongs_to_a_chat.md) · [P1547](done/2026-06-10/p1547_mirror_memory_token_budget.md)
