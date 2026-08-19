---
status: rejected
type: comment
rank: 4
workstream: content
created_date: '2026-08-18'
tags: [ingestion, points, stories, mcp, provenance]
delivery_stage: create-spec
pipeline_ran: [create-spec]
superseded_by: p1096
rejected: '2026-08-19'
rejection_reason: >-
  Absorbed. Its central argument — the shared layer is the filing step, not the
  extraction step — became open question 7 of P1096 within 24h of filing. Its
  claimed unique gap (no reader for the founder's own notes) was false: sifter-story
  Mode 1 already reads a brain dump. The one finding that survived was a stale doc
  claim, fixed directly on 2026-08-19 rather than tracked here.
driver: heuristic
---

# P1101: Any input → filed artifact — direction note

> **REJECTED / ABSORBED 2026-08-19 — superseded by [P1096](../../p1096_public_multisource_point_pipeline.md).**
> Filed 2026-08-18 as a direction note. Within a day, every part of it had a better home:
>
> - **The architecture conclusion** (*holism at the output boundary — one filing contract, N extraction adapters*) is now **P1096 open question 7**: *"What builds and owns `/points-publish`?"* — created 2026-08-19, and the reason `points-prepare` v0.4.0 names a pairing skill that does not exist.
> - **B1 (visibility)** does not bind P1096 at all — that pipeline uses public material and files public points. It binds only the private-transcript path, which is [P1089](../../p1089_audience_scoped_point_list.md), parked on purpose.
> - **B2 (a trigger cannot name a room)** is already a rule inside `points-prepare`, added after the 2026-08-17 run that asserted its own room.
> - **B3 (the doc claimed the mirror agent was live)** was the one finding nothing else covered. **Fixed 2026-08-19** in `definitions.md`; rationale in [decisions.md](../../../docs/decisions.md) 2026-08-19 [product] "The mirror agent is a design, not a shipped surface". It did not need a spec.
> - **The "missing own-notes adapter" was wrong.** `/slava:content:sifter-story` Mode 1 opens with *"Paste your brain dump — messy thoughts, any length."* The adapter exists; what it cannot do is publish — which is open question 7 again, not a separate gap.
> - **The three founder decisions** (autonomy, third-party access, provenance) are answered or owned elsewhere: P1096 Q5/Q6 settled operator-confirms-before-creation and test-before-prod on 2026-08-19; provenance is [P1104](../../p1104_agents_must_be_visually_distinguishable.md). Third-party MCP access has prior art — [P143](../p143_mcp_server.md) was rejected 2026-02-12 as *"overengineered… not testing any documented hypothesis."*
>
> **Kept for one reason:** the five-input map below records which reader handles which input, and the reasoning behind the output-boundary split. Do not re-derive it; do not re-open it as a build.


> **Placeholder. Filed to fix the direction, not to be built.** Nothing here is
> scoped, and three founder decisions are open. The purpose is that a future
> session does not re-derive the map below or re-litigate the architecture
> question, which already has a recorded answer for one half of it.
>
> **Hard dependency: [P1089](../../p1089_audience_scoped_point_list.md), which is itself parked on purpose.**
> Read §Blockers before proposing any build.

## Problem

**Situation:** Five paths already turn recorded material into Points and Stories.
None of them is reachable by anyone but an agent operating this repo, and only two
of them write to prod.

| Input | Path | Output | Writes to prod? |
|---|---|---|---|
| YouTube / public transcript **+ a named room** | `/slava:content:points-prepare` v0.3.0 | Points with inference chain, verbatim quotes, sealed split prediction | **No** — *"NOT for filing anything to prod"* |
| Private 1:1 transcript | same skill, or `/slava:content:create-letter-from-transcript` | Points, or a Doc-shaped letter | letter path: yes |
| A finished first-person Story | `/slava:content:sifter-story` → `/slava:content:sifter-point` | Points | no |
| A record of one person's misalignment | `/align-detect` → `/align-decompose` → `/align-create-letter` | anti-point → reverse-story → point triple, sealed as a letter | **yes** — the only align skill that writes |
| Typed text, in-product | `/create` (`create-story-page.tsx`) | Story | yes |
| **Founder's own notes, thoughts, or Claude conversations** | **— none —** | — | — |

**Complication:** Three things changed the shape of the gap.

1. `/points-prepare` shipped 2026-08-17 and works on *any* transcript,
   including private ones — so extraction is no longer the missing piece.
2. The 2026-08-17 run on a private 2h20m two-person transcript produced six points
   both participants could take ±3 positions on, and **P1089 recorded why that does
   not generalise**: the points worked because both people had been in the room.
3. The remaining input class the founder actually generates daily — own notes, own
   brain dumps, own Claude conversations — has no adapter at all.

**Question:** What is the shape of a system where *any* input reaches a filed
artifact — and which parts of it are genuinely shared versus deliberately not?

## Approach

### The architectural conclusion (load-bearing; do not re-derive)

The instinct is "one function, many input types, exposed over MCP/CLI/REST." **Half
of that is already recorded as excluded.** [decisions.md](../../../docs/decisions.md)
2026-08-06 [process], verbatim:

> *"eliciting from a live human (can ask a follow-up), a recording (cannot — hence
> `align.md:220` disables overshoot on async), a chat archive (can grep, cannot
> ask), and a brain dump are different procedures by necessity. Forcing one shared
> procedure makes each worse."*

Those four are almost exactly the four inputs under discussion. The same entry
states that **definitions and a shared acceptance contract *are* shareable**
(they already are — `story-point-model.md`, read by five consumers).

**Therefore: the holism belongs at the output boundary, not the input boundary.**

- **Shared:** one filing contract, one provenance schema, one approval gate, one
  transport. These are declarative output properties — the shareable kind.
- **Not shared:** the extraction procedure. N adapters, each inlining its own
  elicitation, is the recorded architecture, not an accident of packaging.

A single `ingest(anything)` entry point re-litigates a 12-day-old decision and
degrades the brain-dump path in order to make the transcript path exist.

### What each layer would be

**Adapters (N, each its own procedure).** Four exist in some form; one is missing
(own notes / own Claude conversations / brain dump). The missing one is the
cheapest useful increment and the only one with a daily-recurring input.

**Filing contract (1).** Whatever an adapter produces enters prod through one
path with one provenance record. Open questions in §Founder Decisions.

**Transport (packaging, not new infrastructure).** `/align-create-letter` already
files story + point + anti-point + doc + letter to prod *"sealed by the agent's own
authenticated session."* Programmatic filing exists and is exercised. MCP / CLI /
REST would wrap an existing write path. **The transport is the easy part; the
approval gate and the provenance schema are the hard parts, and they are the parts
that are not built.**

**Frontend.** Deferred, and see the doc-vs-reality gap below before designing it.

## Blockers

**B1 — P1089 (audience-scoped visibility). Hard blocker for the private-transcript
path.** Point visibility is `public` or mine, immutable after creation, enforced by
trigger. P1089's finding, from the real 2026-08-17 run: *"The blocker is not privacy
— it is whether the audience can retrieve the context."* Published to strangers, the
points from a private conversation lose their referents, and the author reported he
would hedge them — which un-points them. **Today a private transcript has exactly one
valid destination: a one-recipient sealed letter.** Any ingestion pipeline built
ahead of P1089 produces artifacts that are unanswerable or hedged. P1089 is parked
until one event has actually run; that ordering is deliberate and this spec does not
override it.

**B2 — triggers cannot supply a room.** `/points-prepare` refuses to run
without a named audience and treats silence as refusal, because a 2026-08-17 run
asserted its own room and every predicted percentage downstream inherited the
unchecked assumption. Every load-bearing filter and every split prediction is
*relative to* that room. An automatic trigger ("recorder stops → extract") cannot
name one. **Either the trigger halts for a human, or the filter that makes points
load-bearing is dropped. Not both.** Any trigger design must state which it chose.

**B3 — doc-vs-reality gap on the in-product interface.**
[definitions.md](../../../docs/definitions.md) §Mirror Agent describes it as *"the
story-filing interface (active now, in `/chat`)."* Reality: `clarity-chat-page.tsx:6`
— *"NOT ROUTED — /clarity-chat was reverted from prod"*; `/chat` and `/clarity-chat`
redirect to `/create` (P486); `create-story-page.tsx` is a plain 10 000-char
textarea with no AI in it. Any frontend work here starts by either building the
mirror agent or correcting definitions.md. Per CHARTER's one-fact-one-home, the doc
is currently asserting a capability that does not exist.

**B4 — untrusted input hardens from principle to practice.**
`/points-prepare` already states transcripts are data and never
instructions, and deliberately restates it rather than inheriting it. Exposed over
MCP to third parties, that input is adversarial in practice, not just untrusted in
principle — and it would reach a path that writes to prod under an authenticated
session. This is the single largest difference between a private skill and a public
endpoint.

## Founder Decisions

- [ ] **[FOUNDER DECISION: autonomy]** May an agent file autonomously, or is
  human approval always required? Two skills chose non-filing *independently*
  (`/points-prepare`: "NOT for filing anything to prod"; `/align-decompose`:
  "performs NO network write… the skill boundary **is** the approval gate"). That is
  two deliberate gates, not one packaging accident. Removing them is a decision, not
  a refactor.
- [ ] **[FOUNDER DECISION: access]** Do third parties get MCP access at all — i.e.
  is this an internal tool or an acquisition surface? Determines whether B4 is a
  hardening task or a product boundary.
- [ ] **[FOUNDER DECISION: provenance/authorship]** Who authors a Point an agent
  extracted from a conversation between two other people? Points lock the moment an
  external user stakes a position, and a Story has a *private referent* — only the
  originator can certify a paraphrase. The align chain already names the case where
  author ≠ experience owner (*reverse story*); a brain dump where author = experience
  owner is a different case again. The schema needs to distinguish them.

## Risks / Non-Goals

### Risks

- **Building the transport before the destination.** Highest-probability failure:
  MCP/CLI ships, extraction works, and the output has nowhere valid to land (B1).
  **MITIGATE:** treat P1089 as a gate, not a nice-to-have. Do not start transport
  work while point visibility is public-or-mine.
- **Supply outruns the scarce side.** [philosophy.md](../../../docs/philosophy.md) puts
  error correction in positions and position shifts after story exposure. Cheap
  filing raises supply; nothing here raises the number of people taking positions.
  **MITIGATE:** any build increment must name which side of that ledger it moves,
  and a supply-side-only increment needs a reason.
- **The recorded procedure-split gets ignored under "holistic" framing.**
  **MITIGATE:** §Approach states the split explicitly and cites it; a reviewer can
  check any proposal against it in one read.

### Non-Goals

- Do NOT build anything from this spec. It is a direction note; it has no
  Acceptance Criteria on purpose.
- Do NOT build a single `ingest(anything)` entry point or a shared extraction
  procedure — see §Approach and decisions.md 2026-08-06 [process].
- Do NOT change point or story visibility semantics here. That is P1089.
- Do NOT modify `/points-prepare`, `/align-decompose`, or
  `/align-create-letter` to add a filing tail. The skill boundary is the gate.
- Do NOT design the frontend before B3 is resolved one way or the other.
- Do NOT expose any endpoint to third parties before the autonomy and access
  decisions are answered.

## Research Questions

1. Which single adapter is worth building first, and on what evidence? (Current
   read: own-notes / own-Claude-conversations — the only input class generated
   daily, and the only one with no path at all.)
2. Does a brain-dump adapter need a counterparty? `story-point-model.md` §counterparty
   condition says detection + decomposition has **standalone solo value** (layer 1);
   only comprehension verification (layer 2) needs a counterparty. If that holds, a
   solo brain-dump adapter is legitimate as a self-awareness log with no reader.
   *Its own falsifier is already recorded there: if solo layer-1 runs yield no durable
   value, the claim is overclaimed.*
3. What is the minimum provenance record that survives the point-locking rule?
4. Is there a filing shape between "sealed one-recipient letter" and "public", short
   of P1089's full audience-scoped state?
5. Does a trigger-driven path exist that satisfies B2, or is human-in-the-loop the
   only correct answer?

## Deliverable

A resolved direction — the three founder decisions answered, one adapter chosen with
a reason, and a filing contract sketched — at which point this spec is re-typed to
`task`/`story` and enters the normal pipeline. Not code.

## References

- [P1089](../../p1089_audience_scoped_point_list.md) — audience-scoped point list (hard blocker, parked on purpose)
- [P593](../../p593_post_session_clarity_pipeline.md) — post-session clarity pipeline (HELD; sifter extraction + `draft` visibility + mirror-agent letter)
- [P572](../../p572_ai_point_extraction.md) — AI point extraction from stories (backlog)
- [P1088](../../p1088_video_selector_for_point_extraction.md) — choosing which conversation to extract from
- [story-point-model.md](../../../docs/story-point-model.md) — §counterparty condition, §Considered and excluded, §How consumers use this
- [decisions.md](../../../docs/decisions.md) 2026-08-06 [process] — "Story/point primitives are reusable as definitions and acceptance criteria — never as procedure"
- [definitions.md](../../../docs/definitions.md) §Mirror Agent, §Stories vs Points, §Personal AI Calibration
- `.claude/commands/slava/content/points-prepare.md` · `.claude/commands/slava/think/align-create-letter.md`
- `src/app/pages/clarity-chat-page.tsx` (not routed) · `src/app/pages/create-story-page.tsx` · `src/App.tsx:723-725`
