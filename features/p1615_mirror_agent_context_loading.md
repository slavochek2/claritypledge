---
status: week
type: comment
rank: 93
workstream: clarity-chat
created_date: '2026-11-04'
tags: [mirror-agent, context, cost, privacy]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1615: How the mirror agent loads context

## Problem

**Situation:** The mirror agent gets up to 50,000 tokens on every message. It reads only its own chat, or the main messages of one channel when asked there (P1547). It cannot reach anything else the person can read unless they copy it in first.

**Complication:** Worst-case cost per reply stays at 50,000 tokens however small the question. From 1 January that reply costs $0.084. P1604's draft interim limit goes further. A Clarified transcript stays among the messages offered on later replies until 300,000 characters of newer messages push it out, so each follow-up can re-send 100,000 tokens for $0.18, even when the subject has changed. The per-person daily cap in `_mirror_limits()` then allows about 3 replies a day. Real use is still small and far below the 50,000 bound (figures kept private), so the risk is the bound and the near future, not today's bill.

**Question:** How does the agent reach everything the person can read or forward, without sending it all on every message?

> Founder, 2026-11-04: "everything should be inside for a reference when I talk about it. But maybe not every chat."

"Not every chat" has two readings: not on every message, or not every chat room. The brief says "without sending it all on every message", so this spec takes the first and leaves the second open as Decision 1.

## Founder rulings, 2026-11-04

These replace anything below that disagrees.

> "What do you mean you name a source? I mean it has to be user-friendly. When people just chat, we need to be flexible."

Shown the plain version of the rest, the founder answered "ok".

- **The problem is right:** the agent re-reads too much of what it was given, and cannot reach the rest.
- **Nobody names a source.** Option B is dropped, as a trial and as a layer. People just chat.
- **What you reply to, forward or Clarify is read in full.** While the talk stays on it, it stays in view. After that it folds to one line and the agent reopens it when it comes up (A1).
- **The agent looks things up by itself,** across all the chats and transcripts the person can read, when a question needs it. Each answer says what it read. The policy announces this first.
- **Live search first (H or C), tested on made-up chats.** Embeddings wait: they go in the test and are added only if live search misses too much on things said in different words. Google's File Search is out.
- **Isolation is structural.** The model only requests a search. Server code takes the owner from the job and limits every read to that person's chats from their access date, re-checked on each read. A test that tries to read another person's chat must return nothing.

**Still open:** the window (2), the P1604 interim limit (6), the daily cap (7). Decision 1 is settled by these rulings, and 3 (no stored memory for now) with them. Defaults stand unless the founder objects: 5 replies before folding, answers that read other chats stay out of later context, deleting one message does not blank answers, chats and transcripts first.

The Recommendation and Founder decisions below are the state before these rulings.

## Approved plan, founder 2026-11-04

Approved: "ok approve". No further research round. Decisions: keep the 50,000-token window for now (2); ship P1604's interim limit only together with folding (6); keep the daily cap for now, and announce cross-chat reads in the policy before they ship (7).

Order, each its own build spec:
1. **Stop re-sending:** folding in SQL selection and reservation, dates, the omission note, the ledger reading cached tokens.
2. **The test** on made-up chats, retrieval stage first; the tool loop stays an arm.
3. **Search by the agent** with the approach that wins, including every item under the third review.

## Third review: security and usability of the ruled design

Gemini 4 Argon and Codex, 2 of 2 reports. Both keep automatic live search and deferred embeddings, and neither found a better whole design. Codex: revise before implementation. Code claims checked by read; live attacks, races and latency are unrun.

**Required before any build:**
1. **Follow-ups must work.** Keeping cross-chat answers out of context breaks "how should I reply to her?". Keep a short-lived server pointer to the sources and last answer (ids only), re-checked on each read, and resolve the follow-up against recent talk before searching. This replaces the default of folding after a fixed 5 replies, and the default on answers needs revisiting.
2. **Search only when the question needs it.** "I'm tired today" must not pull an old argument into the reply. Prefer the current conversation before widening; show dates; never turn an old remark into a trait.
3. **Access is re-checked before the answer is posted,** not only on read. Today only channel asks do this (`20261022160000:599`).
4. **Provenance accumulates across every read in an attempt.** Today one assignment replaces it (`20261027120600:626`). Nothing is read before the job has registered its people.
5. **Search excludes the agent's own answers.** `search_my_messages` has no such filter, so an excluded answer could return as evidence.
6. **The "what I read" note comes from the server's record of reads,** never from the model, and says partial when partial. "Read in full" must be defined for a source larger than the window.
7. **Strip bare domains, emails and phone numbers.** Chat renders plain text, so no automatic exfiltration was found, but an attacker can still persuade the owner, or plant a false accusation. Test on the whole pipeline.
8. **Bound the work:** query size, result bytes, calls, total time, with a truthful "looking through your conversations" state.

**Changes the options:**
- C should not send a catalog: every person in it would join `derived_refs`, so anyone's erasure blanks unrelated answers, and titles can steer it. The router sees only the recent talk and question, returns whether to search plus names, terms and dates, and SQL matches them.
- H alone will often miss: names live in `profiles`, not `body`, and natural questions share few words with the source. The test includes this class; expect C without a catalog to lead.
- That router also reserves the worst case on every reply, or needs a stated two-stage reservation. To settle in the build spec.

Rejected: nothing material; Gemini's "90% of interpersonal chat" figure for H's misses has no source and is not relied on.

## Appetite

Blast radius: every mirror reply, plus erasure and the privacy promise if reach widens. Reversibility: high for folding and dates; medium for reach (people get used to it, and the policy changes); low for anything stored about other people. Decision density: seven founder calls, listed below.

## Invariants

These hold whichever option is chosen.

- **Access is checked when reading,** with the existing rules (`_chat_access_since`, the sealed-bid rule on letter predictions), never when indexing. P1547: "Do NOT change who can read what."
- **Everyone whose words reach the model is recorded first.** `derived_refs` holds person hashes, not rows, and includes what is offered and later trimmed. A new read records its people in a locked pass, in today's lock order: rows `FOR SHARE SKIP LOCKED`, then the context lock (try, never wait), then the job row (P1520, P1547). Titles and names in a catalog count as words that reached the model.
- **Account erasure reaches every copy and every answer** (decisions 2026-10-22, P1544). `delete_chat_message` and erase step 2 are updates, so `ON DELETE CASCADE` never fires for a chat message. Any new store needs a trigger or a validity check at read time.
- **Deleting one message has four separate cases, and none may silently change:**
  1. The original is not sent for later questions (the policy promises this).
  2. A copy made before the delete keeps its text and is still sent (the policy says so).
  3. An answer built on it survives and can re-enter context (today's behaviour; the policy is silent).
  4. Account erasure removes all of them.
- **Anything that copies or summarises a thread** leaves out agent answers and private asks, or carries their `derived_refs` (decisions 2026-10-22, P1546).
- **Spend is reserved before the first model call** and every send is bounded by `countTokens` or the byte bound. Code and SQL share one test (decisions 2026-10-23, P1547). A cache discount lowers what is charged, never what is reserved: no hit is guaranteed.
- **The agent can say what it read and did not read.** It never claims more than it covered.
- **A model that has read other people's words has no way to write or send,** and replies go to the owner only. Links are weaker than this: `parseReply` strips only `http(s)://` and `www.`, and a bare domain or email survives (run this session). Whether chat renders them clickable is UNVERIFIED.
- **A new provider, kind of data or purpose is announced before it starts** (decisions 2026-11-04, `privacy.md:303`). Copy says "mirror agent". Logs carry no content.

## What was found

### In the code (each read or run this session)

1. **No message time reaches the model.** `clean()` drops `at`, and no instruction gives today's date (`mirror-agent.ts:156-169`, `:322-345`). Dates typed inside a message survive, nothing else. A copied thread also omits its replies' original times (`mirror-context-fields.ts`). So "last Tuesday" and "what is it now" rest on guesswork under any option. Labelling a copy with its copy time alone would give wrong chronology, and today's date needs a time zone.
2. **A Clarify copy lands in the main mirror chat,** with no thread, so it is in scope for later main replies and for the main messages a thread question also reads (`_mirror_begin_job`, `_mirror_in_scope`).
3. **Search already exists.** `search_my_messages` searches every chat the person can read from their access date. It takes `auth.uid()`, so the voice path (no user token) cannot call it. It searches `body` only, not transcripts or copies, has no text index and returns 30 rows.
4. **Answers inherit `derived_refs`.** Each job adds the refs of agent answers in its context (`20261027120600:595`), and erasure blanks every agent row holding a ref (`20261103010000:962-964`). Keeping even one earlier answer that read beyond the mirror carries its people forward indefinitely, so one erasure can blank a chain of unrelated answers. Channel asks avoid this today because `context_conversation_id` keeps them out of later context.
5. **The prompt shape defeats Gemini's automatic cache.** `generateContent` on `gemini-3.8-flash`, synthetic text, `usageMetadata.cachedContentTokenCount`. One run per row, from the review key's project, not the mirror's:

| Request shape | Size | Cached |
|---|---|---|
| Byte-identical repeat (known good) | 32,000 | 94% |
| One user turn, history appended (today's shape) | 32,000 | 0% |
| One user turn, stable history as its own part, later part grows | 32,000 | 0% |
| One user turn, oldest messages dropped (today, over budget) | 32,000 | 0% |
| Two consecutive user turns, later turn grows | 12,000, 32,000 | 0% |
| Stable history, then a fixed model turn, then a later user turn that grows | 32,000 | 93%, 89% |
| Same | 20,000 | 89%, 82% |
| Same | 12,000 | 82%, then 0% |
| Same | 6,000 growing to 8,000 | 0%, then 51% |
| Unrelated text; a changed start (known bad) | 32,000 | 0% |

Reading it: only the shape with a fixed model turn hits, and it hits unreliably, as Google warns. The first probe run, at 10,000 tokens, returned 0% throughout, but it used only shapes that also miss at 32,000. An explicit-cache control proved the field was readable. Not yet tested: hit rate after a gap of minutes to hours, a window moving in steps, and whether the fixed model turn is safe against injection.

6. **`costUsd` ignores cached tokens** (`mirror-agent.ts:62-74`), so the spend ledger would overcharge after any hit.
7. **The main-chat prompt never says what it omitted.** Only the thread scope has "last N of M" (`:334`, `:344`).
8. **Folding cannot live only in the prompt.** In the P1604 draft, SQL decides the offer window and the $0.225 reservation from the copy's presence (`20261104150000`, draft). Folding only at the edge would keep that reservation and let the copy crowd older messages out of the offer.

### Outside (full notes and sources below)

- **Full context does well on Flash, but those numbers do not carry over to a 50,000-token window.** Gemini 2.5 Flash: 70.0 full context against 56.0 RAG (n=100). Gemini-3-Flash on 1M multi-party tokens: 72.61 full context against 52.12-59.27 for memory systems, though the paper's memory arms answer with another model unless noted. Neither tested 3.8 Flash, and the ranking reverses by model across a 45-point range. Those arms received the whole corpus. Our window holds a tenth of the long persona's history.
- **Evidence-only beats full context.** Multi-hop across speakers went from 26.51 with full context to 88.37 given only the evidence (Gemini-3-Flash). GPT-4o: 0.606 against 0.870. So sending the right 15,000 tokens can beat sending everything, if they can be found.
- **Summaries lose detail and do not fix stale facts.** LongMemEval measured a loss except on multi-session questions. On updates, 44.4% of failures answered from a superseded fact even with perfect evidence. The strong counter-case is a vendor's: append-only dated notes, 84.23 against 60.20.
- **Agent search is competitive at our size and costs more tokens, not fewer.** 39 times the query tokens of BM25 at the smallest tier, with the crossover near 10M tokens. Keyword against vector depends on the query: 79.2 vs 11.7 on keyword queries, 23.0 vs 36.1 on low word overlap.
- **Multi-author products read live and keep answers disposable.** Slack fetches with the asker's ACLs, keeps summaries ephemeral and invalidates them when a source is tombstoned. Copilot and Glean filter at query time. Single-author products (Claude memory) let memory outlive the deleted chat, which P1544 forbids.
- **Treat embeddings and summaries as personal data.** The German DSK treats vector entries as deletable personal data, and one study recovers 92% of 32-token inputs from embeddings under its attacker conditions. No regulator source found says otherwise.

## Options

These are layers, not rivals. A person gets one choice from each.

| Layer | Choices |
|---|---|
| **1. What stops being re-sent** | A1 folded copies, plus dates, an omission note and a correct ledger |
| **2. The price of what is sent** | A2 cache-shaped prompt · G explicit Gemini cache · neither |
| **3. How a source gets chosen** | B the person names it · H search by code · C plan, read, answer · D tool loop · E vectors added to H or C |
| **4. Stored memory** | F rolling summaries or visible notes · none |

**What each one is**
- **A1.** Outside its own reply window or thread, a copy becomes one line in SQL selection and reservation ("a copied session, 720 lines, Tuesday, not shown").
- **A2.** Stable history in its own earlier turn, a fixed model turn, history moving in steps.
- **G.** A cache object at Google holding the stable window, per person.
- **B.** `@` a source, read live, shown as chips. Clarify stays today's snapshot.
- **H.** Code takes terms and names from the question and searches a text index, inside the one existing transaction, with one model call.
- **C.** A flash-lite call turns the question and a catalog into who, where, when and terms; SQL reads; the answer model has no tools. A long session adds a flash-lite reader that returns checked quotes, so three model calls.
- **D.** The answer model searches and opens, 3 calls at most.
- **E.** Vectors for chunks of what the person can read.
- **F.** A paraphrase per chat, or a visible agent note in the mirror chat.

### Complete configurations

Cost per reply at the 1 January price ($1.50 in, $7.50 out, $0.15 cached read), output at its 1,200 bound ($0.009). Personas: short (5,000 tokens of history), long (500,000), transcript-heavy (three 60,000-token sessions plus 100,000 of chat). Accuracy is unmeasured here, for every row.

**The cost limit is set by the window.** The limit, 40% of today's worst reply, is $0.0336. That allows 16,400 input tokens without a cache hit: ($0.0336 − $0.009) ÷ $1.50 per 1M. So every row under it, except a hit in row 2, cuts the 50,000-token window the founder approved in P1547. Decision 2.

| Configuration | Window | Short | Long, usual | Long, worst | Transcript-heavy | Model calls | New stores of other people's words |
|---|---|---|---|---|---|---|---|
| Today | 50,000 | $0.0165 | $0.084 | $0.084 | $0.084; sees 10,000 tokens of a session | 1 | None |
| P1604 interim | 50,000; 100,000 with a session | $0.0165 | $0.084 | $0.084 | $0.18 per follow-up | 1 | None |
| 1. A1 | 50,000 | $0.0165 | $0.084 | $0.084 | Chat $0.084; in a session $0.18 | 1 | None |
| 2. A1 + A2 | 50,000 | $0.0165 | $0.023 on a hit | $0.084 | In a session $0.0585 on a hit | 1 | None. Needs 83% hits to meet the limit |
| 3. A1 + B | 14,500 | $0.0165 | $0.0308 | $0.0308 | $0.0308; $0.1088 with a session open | 1 | None |
| 4. A1 + B + H | 14,500 | $0.0165 | $0.0308 | $0.0308 | $0.0308 | 1 | A text index on existing rows; follows updates and deletes |
| 5. A1 + B + C | 14,500 | $0.0165 | $0.0318 | $0.0418 reading a session | $0.0318; $0.0418 | 2-3 | None |
| 6. A1 + B + D | 14,500 | $0.0165 | $0.0293 | $0.0488 | Same | 2-3 | None; index optional |
| 7. Row 4 or 5 + E | 14,500 | $0.0165 | $0.0308, plus $0.075-0.10 once | $0.0418 | Plus $0.042-0.056 once | 2-3 | **A vector per chunk, about 2,500 for long** |
| 8. A1 + F | 12,000 + notes | $0.0165 | $0.027, plus $0.144 once | $0.027 | $0.0315 | 1, plus writes | **A paraphrase per chat** |
| 9. A1 + G | 50,000 | n/a | $0.023, plus $0.0675 to create and $0.045 an hour | $0.084 on expiry | Same | 1 | **A full copy at Google, at rest, until TTL or delete** |

Arithmetic: row 2 long 45,000 × $0.15/M + 5,000 × $1.50/M + $0.009 = $0.02325; in a session 90,000 × $0.15/M + 10,000 × $1.50/M + 4,000 × $7.50/M = $0.0585. Row 3 14,500 × $1.50/M + $0.009 = $0.0308. Row 5 router 3,000 × $0.25/M + 200 × $1.50/M = $0.00105; session reader 60,000 × $0.25/M + 1,200 × $1.50/M = $0.0168; answer over 10,000 = $0.024; total $0.04185, reserved at × 1.25 = $0.053. Row 6 worst 25,500 in, 1,400 out = $0.04875; usual two calls 13,000 in, 1,300 out = $0.02925. Row 8 12,000 in = $0.027; once 500,000 × $0.25/M + 12,500 × $1.50/M = $0.144. Row 9 caches 45,000: create 45,000 × $1.50/M, storage 45,000 × $1.00/M an hour; 500,000 would be $0.75 and $0.50 an hour.

**Evidence and privacy per layer**
- **Named (B):** closest to the evidence-only arm when the person names the right source; finds nothing when they do not. Sends only what was named.
- **Search by code (H):** keyword evidence; weak on paraphrase and across languages. The index is a derivative inside our own table. No router, so no catalog goes to Google.
- **Plan (C):** term expansion may help paraphrase; untested. Titles and names reach Google on every planned reply. Needs a new step before `_mirror_begin_job`, because the reservation must come before the router. Its transaction design against erasure and retries is UNVERIFIED.
- **Tool loop (D):** Letta 74.0 (vendor). A model that has read other people's text chooses the next read. Each round needs its own recorded read.
- **Vectors (E):** 56.0 against 70.0 on Flash; Cursor +12.5% added to grep (vendor). Eager indexing contradicts the policy's "when they ask", and needs a delete trigger.
- **Summaries (F):** loss on single facts, gain on multi-session. Any paraphrase, in a table or in the chat, survives a single-message delete unless invalidated, and a visible note gets no special treatment. A note on another chat also carries its people's `derived_refs` into the erasure chain unless kept out of later context.
- **Explicit cache (G):** no reach and no accuracy change. Set aside until Google's purge time and the delete path are shown, since it stores at rest where implicit caching holds in RAM.

Eighteen designs were generated and three reviewers scored them. Set aside: self-escalation (a model that has read content decides what to read, $0.0473 worst), a fact ledger (stores a model's reading of a person as fact, which collides with the rule to keep fact and reading apart), and owner-words-only memory (a mirror's job is the other person).

### Scores

Sum of the 7 ranked criteria, each 1-5, out of 35. Unweighted, and accuracy in them is judgement. Scored independently on the first draft; H came later.

| Choice | Creative agent | Gemini 4 Argon | Codex |
|---|---|---|---|
| A (fold and cache) | 25 | 26 | 21 |
| **B named** | **30** | **32** | **28** |
| C plan | 28 | 23 | 23 |
| D tool loop | 22 | 19 | 18 |
| E vectors | 18 | 19 | 21 |
| F summaries | 20 | 17 | 17 |
| G explicit cache | 14 | 18 | 14 |

## Recommendation

**Measure before choosing automatic search. The other pieces can be decided without the test, and each is its own change.** The rule set in advance cannot pick automatic search, because nothing is measured. Gemini and Codex both called "measure first" honest for that choice and a dodge if used to hold up the rest.

1. **A1 next, on your OK.** Dates with original times, folding in SQL selection and reservation, the omission note, the ledger reading cached tokens. Recommend A1 over the P1604 interim because of user outcome: replies that have nothing to do with a transcript stop reserving $0.225 and stop paying $0.18. This does not widen reach, so it alone does not meet the requirement.

2. **A2 held until two checks pass.** Injection tests on the new shape, since two user turns in a row never hit and it therefore needs a fixed model turn. And hit rate at real reply gaps: a long reply needs 83% hits to meet the limit: ($0.084 − $0.0336) ÷ ($0.084 − $0.02325). If either fails, drop it. A1 does not depend on it. With a working cache, follow-ups in a session rise from about 3 a day to about 5 under the cap, counting the first full read.

3. **B as a trial, without waiting for the test. This is an exception to the rule set in advance, and it is yours to reject.** The rule requires measured accuracy, and B has none: the test can only measure it with the right source already supplied, which leaves out whether people can find the source or bother to. Recommend the trial over automatic search because of security: a stranger's message enters a private reply only when the owner named that source, and because of user outcome: the owner sees exactly what was read. Measure in the trial how often people use it, how often the agent says it cannot see what they meant, and whether they find the source. All three scorers ranked it first. It needs Decision 2 (window), Decision 5 (sources) and the policy line in Decision 7. The alternative is A1 alone until the test has run.

4. **The test decides automatic search: H, C, D, with E added to the better of them.** Provisional bet, to be overturned: H first, since it adds no model call and no catalog at Google. Add C only if term expansion earns its call on paraphrase. Recommend C over D because of security: retrieved text cannot choose the next read, though titles and the question itself can still influence the plan; and cost: $0.0418 worst against $0.0488.

5. **No stored memory now.** Recommend against F because of correctness and privacy: the peer-reviewed measure shows a loss on single facts, and it adds a paraphrase that survives a single-message delete. Revisit if people keep asking about the same long session. Decision 3.

6. **P1604 interim:** ship it only with A1's folding in the same change, or accept 3 replies a day on a Clarified session until A1 lands. Decision 6.

### The case for doing less

Real use is small and well below the bound. A1 alone may be enough for a long time on cost. Reach is a product bet, not a cost fix: judge it on whether people ask for things outside the mirror chat, which today they cannot.

### What the agent reaches

| Source | Today | With B, then search |
|---|---|---|
| 1 Own mirror chat, threads | Yes | Yes |
| 2 Readable group, event and direct chats, threads | Main messages of one channel, only when asked there | Live read from the access date |
| 3 Transcripts: chat session threads, round threads, personal history including plain `/transcribe` | Only when Clarified | Live read. Plain rooms need their own reader, and P1604 is not on `main` yet |
| 4 Voice notes | Transcript in scope | Yes; `search_my_messages` does not search transcripts yet |
| 5 Forwarded and Clarified copies | Yes, re-sent | Yes, folded; still a snapshot |
| 6 Attachments | Kind only | Kind only, Decision 5 |
| 7 Letters sent and received | No | Reader with the sealed-bid rule; a parity test is required |
| 8 Canvases, drafts, uploaded material | No | Reader. Open drafts have no expiry; material kept for offers lasts 30 days after Publish |
| 9 Stories, points, positions | No | Reader |
| 10 Practice sessions | No | Reader |
| 11 Public events calendar | No | Reader; P1577 owns whether to offer it |

## Founder decisions

1. **[FOUNDER DECISION: automatic or named reach.]** When someone asks in the mirror chat without naming a source, may the agent look through their other chats on its own? Three answers: A1 alone for now; named reach as a trial; or automatic. Recommend the named trial now, and automatic only if the test passes, with a receipt saying what it read. Against automatic: a quote from a months-old letter can feel intrusive, and search lets a stranger's planted words enter a private reply.
2. **[FOUNDER DECISION: the window.]** You approved 50,000 tokens in P1547 after calling 30 messages "very, very little". Hitting the cost limit means about 14,500 (about 10,000 words) once sources can be reached by name. Recommend keeping 50,000 until B ships, since real histories are below it and the daily caps bound spend, then deciding from real use. The limit itself was set by this spec, not by you, and may be the wrong one.
3. **[FOUNDER DECISION: stored memory.]** Keep P1547's "Do NOT store summaries or memory outside the conversation"? Recommend keep.
4. **[FOUNDER DECISION: when a copy folds, and earlier answers.]** Candidates for folding: when its own thread is left; after N replies; after time. Recommend: stays open for the next 5 replies in the main chat and always in its own thread, because people ask follow-ups in the main chat. To be checked against how you actually use Clarify. Answers that read beyond the mirror: recommend they never re-enter later context, the way channel asks already stay out. That is the only rule that stops the erasure chain, and its price is that "what did you mean earlier?" must open the old answer.
5. **[FOUNDER DECISION: scope of "anything".]** All eleven sources, or fewer first? Recommend chats and transcripts first (2, 3, 4), since they carry the conversations the agent exists to help with. Attachment contents stay out until decided. Deleting one message: should it also blank answers built on it? Recommend no, since otherwise anyone could blank another person's answer.
6. **[FOUNDER DECISION: P1604.]** Hold its interim limit for A1's folding, or ship and accept about 3 replies a day on a Clarified session?
7. **[FOUNDER DECISION: daily cap and policy wording.]** Keep the per-person cap as reach grows? Is a read across chats covered by "when they ask it about the chat", or announced first? Recommend announcing before B ships. The policy's "up to 100 replies" on a Clarify copy must change if P1604's 720 lines ship.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A fixed model turn weakens the injection defence | MITIGATE | A2 ships only after the red-team suite passes on it. `<<DATA>>` then sits on both sides of a model turn |
| Cache hit rate at real reply gaps is far below the probe | MITIGATE | Measure at minutes and hours; A1 does not depend on it |
| Search misses paraphrase | MITIGATE | The test has a no-shared-words class; E is the fallback |
| One erasure blanks a chain of answers once reach is wide | MITIGATE | Decision 4 |
| A bare domain or reference-style link survives `URL_RE` | MITIGATE | Reach raises the stakes; adversarial test before B |
| The planner reads titles anyone can set | MITIGATE | C only. `quoteField` handles them today; test planner manipulation separately |
| Naming a source may be too much work, or people may not find it | MITIGATE | Measured in the B trial before any wider rollout; Decision 1 |
| A new Gemini project logs prompts by default | MITIGATE | Logging is on by default for projects created on or after 2026-10-26. The mirror's project predates it. Do not move the mirror to a new project or to the Interactions API without turning it off |
| Google keeps prompts 55 days for abuse checks, with no erase by prompt | ACCEPT | Same as today; the policy names Gemini |

**Non-Goals**
- Do NOT build anything under this spec. The founder decides first.
- Do NOT evaluate on real messages. Fixtures are synthetic.
- Do NOT change P1604's session rules or transcription. Only how the agent reads the result.
- Do NOT change the model or the provider.

## Research Questions

1. Which approaches are proven for private, multi-author history? *Answered above.*
2. What do cost, accuracy and privacy look like for each here? *Cost and privacy answered. Accuracy needs question 3.*
3. On gemini-3.8-flash and a synthetic fixture, which search finds and answers best per class, against an independent oracle?
4. How often does the automatic cache hit at real reply gaps, on a window moving in steps?

## Decision Criteria

Written before the research ran. The rule below is unchanged; the review found two terms it left undefined, and their meanings are stated here rather than chosen quietly.

**Gates, fail one and it is out:** access re-checked when reading; every derivative and answer reachable by erasure; worst-case spend reserved before the first call, with any loop hard-limited; the agent can say what it read.

**Then, in rank order:** user outcome, correctness, security and privacy, stability, cost, sustainability, runtime complexity.

**Rule:** among those passing, prefer the fewest new stored copies whose accuracy is within 5 points of the best and whose long-persona cost is at most $0.0336, which is 40% of the $0.084 list-price worst reply.

If nothing qualifies on measured accuracy, recommend the measurement and say so.

**Terms, defined after review:**
- *Long-persona cost* means the expected cost on the measured mix. Worst case is shown beside it, and the reservation covers it. So D and A2 are not out on cost alone, and A2 needs its 83%.
- *Fewest new stored copies* is ranked by kind, not by count: none, then an index inside the row's own table, then a separate table of ours, then a copy at a third party.

**If the test is inconclusive:** a difference inside the paired margin of error is a tie, and a tie goes to the config with fewer new stored copies, then fewer model calls.

## Approach

**The test, proposed for after the founder's decisions.** It decides automatic search only.
- **Fixture:** synthetic, sized to the three personas. Eight chats and three sessions, at least two languages, facts that change, two people sharing a first name.
- **Oracle:** about 150 questions with hand-written answers and answer rows, written before any arm runs. At 60 questions, 5 points is three answers; at 150 it is about seven. Classes: old fact, changed fact, date, across sessions, across speakers, no shared words, nothing to find (must abstain), what did I miss, deleted source, lost access, did you actually read X. A sample of labels is re-checked against the fixture.
- **Two stages, so answer calls are only paid for what can still win.** First, retrieval only: are the answer rows in the read set? Then answers, for arms still in range, two runs each (the figure in the Cost Budget is the ceiling, with every arm still in range), graded current, superseded or other, never by agreement with today's context. Questions needing several rows count only when all are found. Abstaining correctly counts as right.
- **Safety is a pass or fail, never averaged:** deleted source, lost access and false coverage claims.
- **Controls, same metric:** empty and random arms (known bad), evidence-only (known good). If known bad and known good score alike, the test is blind and is thrown out.
- **Arms:** today, A1, H, C, D, and E added to the better of H and C. Named reach is measured apart, given the right source, because handing it the source is information the search arms must find. Any per-class routing between arms must be held out.

## Time Box

Research and review: this session. The test: two runs per arm at the answer stage. A further round needs a stated reason.

## Deliverable

This spec, for the founder's seven decisions. Build specs follow from them; this one builds nothing.

## Alternatives Considered

The founder's own framing rules out sending everything always, and reaching nothing (today) is the baseline it asked to change. Gemini Argon argued the requirement may only be "don't re-send a transcript": that is why A1 stands alone as a first step and Decision 1 is open. GBrain was rejected in 2026-08 for the decision log because retrieval improves finding, not currency; the external evidence supports the same warning here.

## Cost Budget

Registry: the Gemini API row in `docs/technical/metered-services.md`, confirmed against the pricing page on 2026-11-04. It lacks the cached rate ($0.15 per 1M) and storage ($1.00 per 1M per hour); add them when this is built.

| Measure | Per reply | Per user per day | Per test run |
|---|---|---|---|
| Row 1 or 2, long, no hit | $0.084 | The cap holds it to about 6 | n/a |
| Row 2, long, hit | $0.02325 | 30 replies × $0.02325 = $0.70; the cap holds it lower | n/a |
| Row 3 or 4, long | $0.0308, reserved at $0.0385 | About 19 | n/a |
| Row 5, long | $0.0318, reserved at $0.053 | About 18 | n/a |
| P1604 interim, follow-up | $0.18, reserved at $0.225 | About 3; about 5 with a working cache | n/a |
| Probes this session | n/a | n/a | Figure in `.private/docs/usage/`; on the review key |
| Test, retrieval stage | n/a | n/a | 150 router calls × $0.00105 + embedding 300,000 × $0.15/M = about $0.20 |
| Test, answer stage, all arms | n/a | n/a | $0.171 a question and run × 150 × 2 = about $51 today, about $103 from January |

Per question and run: today $0.042 + A1 $0.042 + four search arms × $0.0153 + random $0.0153 + evidence-only $0.006 + empty $0.0045 = $0.171.

**Supabase requests per reply:** today 6. Row 5 adds one call before `_mirror_begin_job` for catalog and reservation, so 7. Row 6 adds one per read. Log lines unchanged.

1. **Fits the plan limit today?** Yes. Gemini has no plan cap, the budget-capped key and daily caps bound spend. The test should run before 1 January at half the price if it runs at all.
2. **Fits at 10×?** The caps refuse further replies first. Raising them is a founder call, with figures in `.private/`.
3. **If either answer is no:** keep folding on and hold reach at named sources.

## Reviews

Gemini 4 Argon and Codex (gpt-6.1-sol, high), each given the spec and code. Two rounds, 4 of 4 external reports received; 2 of 2 subagents reported, the research one after a chase for its truncated ending. Every finding below was checked by command or a read.

**Changed by review.** Codex's verdict on the first draft was "revise before the founder decides".
- The options were layers posing as rivals, and the draft committed to its first option "whatever comes after".
- `derived_refs` holds people, not rows.
- The deletion invariant ignored the policy's exception for copies.
- "Keep the last few answers" does not stop the erasure chain.
- "Cannot steer" was too strong for a planner that reads titles.
- 60 questions cannot resolve 5 points, and the test budget used a false upper bound.
- Folding must sit in SQL, not only in the prompt.
- Copied threads carry no original times.
- 30-day retention applies to offers, not open drafts.
- H came from Gemini's "no router" point and Codex's separate request for one.
- C's session reservation is $0.053, not $0.04.

**Second round, on the rewrite.** Gemini called it decision-ready. Codex said no: recommending B before the test broke the rule without saying so, and "named reach feels like work" accepted a product trade-off on the founder's behalf. Both are now open: B is a stated exception and a trial, and the risk is measured. Both caught the budget counting three search arms where the test has four.

**Partly right.** Gemini said "3 to 7 replies a day" ignored reservations. The figure already counted them, but it assumed a warm cache; with one full first read it is 5. Gemini said the ask branch's `derived_refs` has a bug: the code comment shows a channel ask sends only authors and forwards, so it is not a bug today, but any new reader must compute refs for what it sends.

**Rejected, with evidence.** Gemini said the cache never works between 5,000 and 30,000 tokens: the probe measured 82-89% at 12,000-20,000. Gemini said C breaks the lock order: no lock is held across a model call, and the plan runs before `_mirror_begin_job`. Its underlying point, that C needs a new step and an unproven transaction design, stands and is recorded.

**Found in revision, not by a reviewer.** Every config under the cost limit cuts the 50,000-token window the founder approved. Decision 2.

**Not verified by anyone here:** accuracy on 3.8 Flash; live erasure races for C and D; hit rate at real gaps.

## Done-When

- [x] Duplicate search and prior rulings recorded (below).
- [x] Proven approaches researched with sources, and options compared by cost, accuracy and privacy.
- [x] Decision criteria written before the research ran.
- [x] Gemini 4 Argon and Codex reviewed this spec, with each finding checked by command.
- [x] The founder's decisions recorded here.

## Sources

Read 2026-11-04. **✓** = the quote or number was re-checked by command against the source this session. The rest were read by the research agent only. (V) = the author sells the thing measured.

**Gemini.** ✓ [pricing](https://aistudio.google.com/docs/pricing.md) · ✓ [caching: 4,096 minimum, "similar prefix"](https://ai.google.dev/gemini-api/docs/caching.md.txt) · ✓ [zero data retention: implicit cache in RAM, 24 h; explicit cache stored](https://aistudio.google.com/docs/zdr.md) · ✓ [logging default from 2026-10-26](https://aistudio.google.com/docs/logs-policy.md) · ✓ [55-day abuse log](https://aistudio.google.com/docs/usage-policies.md) · ✓ [File Search: stored indefinitely](https://ai.google.dev/gemini-api/docs/file-search.md.txt) · [function calling](https://ai.google.dev/gemini-api/docs/function-calling.md.txt) · [embeddings](https://ai.google.dev/gemini-api/docs/embeddings.md.txt)

**Accuracy.** ✓ [MemDelta](https://arxiv.org/abs/2606.29914) · ✓ [EverMemBench](https://arxiv.org/abs/2602.01313) (V; its abstract's "26% with oracle evidence" contradicts its own table, and the table is used here) · ✓ [LongMemEval](https://arxiv.org/abs/2410.10813) · ✓ [BM25 Wins at Scale](https://arxiv.org/abs/2607.26497) · [StateMemBench](https://arxiv.org/abs/2608.19652) · [LoCoMo](https://arxiv.org/abs/2402.17753) · [Mastra notes](https://mastra.ai/research/observational-memory) (V) · [Beyond the Context Window](https://arxiv.org/html/2603.04814v1) · [Zep rerun of Mem0](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/) (V) · [Mem0 audit](https://github.com/mem0ai/mem0/issues/4573)

**Retrieval and tools.** [Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval) · [Azure hybrid search](https://techcommunity.microsoft.com/t5/azure-ai-foundry-blog/azure-ai-search-outperforming-vector-search-with-hybrid/ba-p/3929167) (V) · [Cursor](https://cursor.com/blog/semsearch) (V) · [Claude Code on agentic search](https://www.latent.space/p/claude-code) · [Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory) (V) · [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Anthropic compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) · [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction) · [pgvector](https://github.com/pgvector/pgvector)

**Products.** ✓ [Slack AI](https://slack.engineering/how-we-built-slack-ai-to-be-secure-and-private/) · ✓ [Claude project RAG](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects) · [Slack retention](https://slack.com/help/articles/28310650165907-Security-for-AI-features-in-Slack) · [Claude memory](https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context) · [Microsoft 365 Copilot](https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-privacy) · [Glean](https://developers.glean.com/libraries/indexing-sdk/permissions). ChatGPT's help pages refused the fetcher, so nothing here relies on them.

**Injection and privacy.** [Slack AI exfiltration](https://www.promptarmor.com/resources/data-exfiltration-from-slack-ai-via-indirect-prompt-injection) · [EchoLeak](https://arxiv.org/abs/2509.10540) · [Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/) · [design patterns](https://arxiv.org/html/2506.08837v3) · [DSK on RAG](https://www.datenschutzkonferenz-online.de/media/oh/DSK_OH_RAG.pdf) · [embedding inversion](https://arxiv.org/abs/2310.06816) · [GDPR Art. 19](https://gdpr-info.eu/art-19-gdpr/)

Full research notes, the 18 designs, the probes and usage figures: `.private/docs/p1615/`.

## Related

**Duplicate check:** RELATED: P1547, P1544, P1546, P1604, P1577, P1431. No duplicate; searched "mirror memory, retrieval, summary", "cachedContent, context cache", "chat search, full text". PRIVATE LOG: searched.

**Rulings carried:** decisions 2026-10-23 (P1547) token budget and its non-goals · 2026-10-22 (P1544) erasure and "no partial operator deletions" · 2026-10-22 (P1546) summarising a thread · 2026-11-04 (P1536) AI features rule · 2026-08-15 retrieval against currency · P1431 and P1503 D17 drafts stay private until sent · P1577 events in the agent, tool or digest left to `/dev`.

[P1547](done/2026-06-10/p1547_mirror_memory_token_budget.md) · [P1604](p1604_transcription_belongs_to_a_chat.md) · [P1577](p1577_mirror_agent_cm_events.md) · [P1431](p1431_mirror_agent_letter_chat.md)
