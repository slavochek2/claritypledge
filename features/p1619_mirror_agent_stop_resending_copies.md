---
status: in-progress
type: story
rank: 95
workstream: clarity-chat
created_date: '2026-11-05'
tags: [mirror-agent, context, cost, privacy]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1619: The mirror agent stops re-sending copies once the talk moves on

Step 1 of the plan the founder approved in [P1615](p1615_mirror_agent_context_loading.md). It adds no new reach.

## Problem

**Situation:** P1604 is on prod. A Clarified transcript session lands in the main mirror chat and gets a larger profile: up to 100,000 tokens in, 4,000 out, reserved at $0.225.

**Complication:** That profile applies to every later reply while the copy is among the offered rows, until it leaves the offered rows: the first pass offers 150,000 characters, and a session among them widens the offer to 300,000. An unrelated question can re-send the transcript, at $0.18 from 1 January. At $0.18 each, the $5.00 shared reply cap fits about 27 such replies a day, if nothing else spends from it. Separately, no message time reaches the model, the main chat prompt never says what it left out, the ledger ignores cached tokens, and the privacy policy says a copy holds "up to 100 replies" while a session copy holds 720 lines.

**Question:** How does a copy stay fully available while people talk about it, and stop re-sending it once they do not?

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
2. **When it is open.** Always when just sent, and in its own thread. In the main chat, while the talk stays on it, as the founder ruled, not after a fixed count alone. Founder decision 2026-11-05: it stays open for the next 5 owner messages, and each message naming its speakers, title or date restarts that count. No model call decides this.
3. **Reopening.** A later message naming the speakers, title or date reopens it for that reply, with the full reservation, recorded in `derived_refs`. A pronoun with nothing to match does not reopen it; the agent says what it has set aside and asks. Full follow-up memory arrives with search in step 3.
4. **Dates.** Every item carries its time; a copied thread carries its replies' original times, never the copy time as theirs. The instruction gives today's date with a stated time zone. The time zone is UTC: the server has no reader's zone (`readableSessionBody` already says this; `profiles` has no zone column).
5. **The omission note.** The main chat prompt says how much it left out, as the thread scope already does.
6. **The ledger** charges cached tokens at the cached rate. The reservation does not change.
7. **Privacy line.** Founder decision 2026-11-05: "The copy holds the author's name, the text, the time, the name of the chat it came from, and the replies in its thread that you can read: up to 100, or up to 720 lines for a transcript session." No terms notice. Committed ahead of the build because the live page is false.

### Build contract (from the spec review, 2026-11-05)

**Which copies.** Every `kind` `clarify` or `forward` row with a snapshot, as P1615 ruled ("reply to, forward or Clarify").

**One decision per attempt.** `_mirror_begin_job` computes `v_open` (ids of copies that stay open) once, before the offer passes, and uses it for row cost, payload, refs and profile. A retry recomputes it from the same trigger. Nothing reopens after the reservation. Lock order is unchanged.

**The count.** Eligible messages: author is the owner, `kind = 'message'`, not deleted, `context_conversation_id IS NULL`, a voice note only with a done transcript, in the trigger's scope (main chat, or that thread), ordered by `(created_at, id)`, up to and including the trigger. Copies do not count. Take the last 6, ending with the trigger. A copy is open when any of them matches it, or, in the main chat, when it is newer than the sixth. So messages 1-5 after a copy keep it open and the sixth folds it, and a match keeps it open for that message and the next 5. The cost is bounded: six texts, whatever the history.

**Other scopes.** A copy's own thread (the trigger's root is the copy): always open. A question in an unrelated thread: a main-chat copy is open only by a match in that thread's last 6. An open copy in `outside` counts toward the profile, as today.

**The match.** Text is the owner's body or done transcript, never quoted payloads: `normalize` then `lower`, split on non-alphanumerics, so Cyrillic and other scripts work. Exact token matches:
- **Speakers:** tokens of 3 or more characters from the copy's `author_name` and its thread's `author_name`s. Never `deleted`, `user`, `mirror`, `agent`.
- **Title:** the source `conversation_title` as a whole phrase, without a trailing `· General`, at least 4 characters, never a generic title (`mirror`, `general`).
- **Date,** of the source in UTC: `2026-11-04`, `4 nov`, `nov 4`, `4 november`, `november 4`, `04.11`, `4.11`, `4/11`. `today`, `yesterday` and an English weekday name match only within the last 7 days (with the weekday, 8 days, so "last Tuesday" works). Dates in other languages do not match in this step; recorded limit.

**Refs.** Unchanged from today, so a folded copy keeps every thread author and the title ref. It names them, and over-clearing is the safe side. Accepted: erasing a speaker clears answers made while their folded copy was offered.

**Profile.** `session` is true only if an open session copy is offered. Profile and reservation come from that one flag. A folded session does not widen to 300,000.

**Folded item.** Structured, inside DATA through `quoteData`, never in the instruction: from, when, source chat, up to 8 speakers, line count, `not shown`. The owner's own note on a Clarify stays. A clipped copy keeps saying it is clipped.

**Times.** `_mirror_context_item`, `_mirror_copy_thread` and `clean` carry three separate fields: the row's own `at`, the source's original time, and each reply's original time. A missing old time is left out, never replaced by the copy time. The instruction gives today's date, UTC, from the handler's clock.

**Omission note.** The main chat says how many earlier messages it left out, counting both the SQL offer and the TypeScript trim.

**Ledger.** `costUsd` subtracts `cachedContentTokenCount`, clamped to 0..prompt, and charges it at $0.15 per 1M; absent means 0. No reservation changes.

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

- [x] After Clarifying a session and asking about it, the agent answers from the whole transcript.
- [x] Owner messages 1-5 after a copy keep it open, message 6 folds it, and a naming message opens it for that reply and the next 5: asserted on the request for each boundary, with voice notes, copies and channel asks not counted.
- [x] Once the talk has moved on, an unrelated question does not send the transcript and reserves the standard amount, shown on test by the request and the ledger.
- [x] Asking again by a speaker's name (including a Cyrillic one), the title or the date reopens it with the full reservation and a correct answer on a synthetic fact; "mirror", "general" or "user" do not reopen it; a pronoun alone does not, and the agent says what it set aside.
- [x] Profile and reservation always agree: tested for one open copy, a folded one, several, and an open copy in `outside`; an unrelated thread with an open main-chat copy reserves the standard amount.
- [x] A folded copy's request holds no transcript text, and an instruction-like title stays inside DATA, with a positive control.
- [x] `costUsd` charges cached tokens at the cached rate; absent or oversized counts are handled.
- [x] Older messages crowded out by the copy before folding now reach the model after it folds.
- [x] With a fixed clock, "What did she say last Tuesday?" answers with the right UTC date, including for a reply inside a copied thread, and a copy's replies never carry its copy time.
- [x] When history is cut, the main-chat prompt states how many earlier messages were left out.
- [x] Erasing a person named on a folded line clears answers built on it: erase before the lock pass, with a skipped copy row, after reservation, and on a restart with a changed fold state.
- [x] The extended red-team suite passes on the changed prompt, with its positive control.
- [ ] The privacy page matches what is stored. `[post-deploy]` re-read it on prod.

## Cost Budget

Registry: the Gemini row in `docs/technical/metered-services.md`. Prices from 1 January: $1.50 in, $7.50 out, per 1M.

| Measure | Per reply | Per user per day | Per test run |
|---|---|---|---|
| Unrelated reply with a session copy, today | 100,000 × $1.50/M + 4,000 × $7.50/M = $0.18 | Set by the private caps | n/a |
| Same, folded | At most 50,000 × $1.50/M + 1,200 × $7.50/M = $0.084; real histories far less | Same caps | n/a |
| Reply about the session | Unchanged, $0.18 | Same caps | n/a |
| Integration test on test | n/a | n/a | About 6 model replies × at most $0.09 at today's price = $0.54 |

Test traffic per run of `p1619-mirror-fold-copies.spec.ts`: about 30 two-person scenes, so about 60 users created and deleted, on the self-hosted test server, which has no user quota. The live spec makes 5 model replies. Supabase requests per reply and log lines: unchanged. No new trigger or per-row call beyond the existing selection.

1. **Fits the plan limit today?** Yes; it only lowers spend.
2. **Fits at 10×?** The caps refuse further replies first, and later than today.
3. **If either answer is no:** nothing here raises cost, so no change.

## Reviews

Gemini 4 Argon and Codex (gpt-6.1-sol, low), 2 of 2 reports, 2026-11-05. Verdicts: both blocked the spec as written. Claims checked against the code this session; concurrency and live model behaviour are unrun.

**Accepted, folded into the Build contract:** undefined count and match (both); fold state must be one decision per attempt (Codex); dropped times at `_mirror_copy_thread`, `quoted` and `clean` (both); unrelated-thread scope (Gemini); forwards omitted despite the P1615 ruling (Gemini); folded line through `quoteData` (Codex); vague ACs and the two-pass window in Problem (Codex); UTC (Codex).
**Rejected:** Gemini's "nothing is implemented": this review ran before the build. Codex's "repo does not prove P1604 is on prod": `supabase/deploy-manifest.json` lists `20261104150000` under prod.
**Decided, not rejected:** Gemini's over-clearing of refs on folded copies is accepted as the safe side.

**End of build.** Gemini, GLM, Codex, Opus adversary, 4 of 4. Fixed: copies past the 2,000 cap sent in full; a skipped session copy holding the larger reservation; a false "Deleted user" author; lost reply count; repeated tokenising under the statement timeout; ask-path forwards without a time; emoji glued to names; an impossible date aborting a job; model-level and held-lock tests.
**Set aside:** GLM's fold read before the lock pass: one decision per attempt is the contract, and refs still follow locked rows. A thread's `outside` trim states no count: the spec covers the main chat. Non-ISO snapshot times: server writers store real timestamps.

**Known limits.** Names match exact words, so Russian case endings ("Алисы" for "Алиса") do not reopen a copy. Dates match in English and numeric forms; "version 4.11" can reopen a copy dated 4 Nov. A copy past the offer window cannot be reopened by name; search in step 3 owns that. Prod's database locale is unchecked; the Cyrillic test ran on test's `en_US.UTF-8`.

**Ship order.** Deploy functions before the migration. Old edge code drops the folded item, so a folded copy would vanish with no "not shown" line.

## Related

**Duplicate check:** RELATED: P1615, P1604, P1547, P1546, P1544. No duplicate; searched "fold, re-send, session_thread, reply_session_max". PRIVATE LOG: searched.

**Rulings carried:** P1615 founder rulings and approved plan 2026-11-04 · decisions 2026-10-23 (P1547) · 2026-10-22 (P1544, P1546) · 2026-11-04 AI features rule.

[P1615](p1615_mirror_agent_context_loading.md) · [P1604](done/2026-06-10/p1604_transcription_belongs_to_a_chat.md) · [P1547](done/2026-06-10/p1547_mirror_memory_token_budget.md)
