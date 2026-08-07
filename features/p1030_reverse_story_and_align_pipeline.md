---
status: today
type: story
rank: 0.125
workstream: letters
created_date: '2026-08-07'
tags:
  - letters
  - align
  - verification
  - stories
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
locked_at: '2026-08-07T09:16:07.671Z'
---

# P1030: Reverse Story — and the align pipeline that files one

## Problem

**Situation:** `/align`'s comprehension loop has never completed. Its detection half has run
seven times across a single corpus (`.private/logs/align-calibration.log` — seven
`stage:detect` lines, zero `stage:loop`). The one loop run that started died at the
enrichment→open-questions boundary on 2026-07-13 and was formally abandoned
([decisions.md](../docs/decisions.md) 2026-07-29 [process]). Steps 4–5 have run zero times;
steps 3b–5 are explicitly recorded as untested design.

**Complication:** Every comprehension score the product can currently produce is a score on
**the author's own story**. The author writes it, the reader rates their understanding of it,
and the author estimates the reader in advance. That shape cannot express the case this spec
exists for: **a story whose experience belongs to someone other than its author.** When an
agent paraphrases the founder's reasoning back to him, the agent is the *author* of the text
but the founder is the owner of the *experience* — and only the experience owner can say
whether it was captured. That is precisely what makes such a score impossible for the agent to
self-certify, and the product today has no way to record that the two differ.

**Question:** Can an agent file a paraphrase of the founder's reasoning as a first-class story
marked as *his* experience, delivered as a private letter, so the founder scores it in the
product — and does the resulting number tell him something his own reading of the transcript
would not?

## Appetite

**Medium blast radius, narrowly placed.** One nullable column on `stories`, one conditional
question string, one calibration-aggregate exclusion, one UI element, three skill files, and a
letter-write path that does not yet exist in any skill. **No change to the letter role
invariant** — see Resolved Decisions #3, which is what keeps this off the 13 SQL functions that
encode it.

**Reversible.** The column is nullable and defaults to the author, so every existing story is
unaffected. No RPC signature changes. Skill files revert by `git revert`.

**Medium decision density.** The design decisions are recorded in Resolved Decisions below.
Two remain open and are marked `[FOUNDER DECISION]`.

## Solution

### The entity

A **reverse story**: a story whose *experience owner* differs from its *author*. Add
`stories.experience_owner_id` (UUID, nullable, FK `profiles`; null ⟹ the author, so existing
rows are unchanged). When it is set and differs from `author_id`, two things follow:

1. **The rating question changes.** The experience owner is asked *"How well do you believe
   this story represents your intended meaning?"* instead of the existing receiver question.
2. **The reading view declares itself.** An attribution block above the story text (see UI
   Contract) — without it the letter reads as the agent's own story, which is the wrong frame
   for the number being asked for.

**The letter roles do not change.** The agent sends, the founder receives; `speaker_id` =
sender = agent and `listener_id` = receiver = founder, exactly as every other letter. Whose
*experience* a story is about is a fact about the **story**, and it is recorded on the story.
See Resolved Decisions #3 for why it is not recorded on the verification.

Three consequences fall out of that choice, all of them good:

- `reveal_prediction` works unchanged — it gates on `listener_id = auth.uid()`, and the founder
  is the listener.
- The `source='letter'` RLS branch works unchanged — it admits `speaker_id` or `listener_id`,
  and the founder is one of them.
- The `speaker_rating: 0` placeholder is no longer on the payload column. The founder's number
  lands in `listener_rating`, which the letter path already writes for real.

**`paraphrase_of_story_id` (nullable FK).** Present ⟹ a reply inside an exchange. Absent ⟹ a
cold paraphrase nobody requested, which is the agent case. Keeps the async exchange closable
later without a second entity; nothing else about the exchange is in scope.

### The pipeline that produces one

Three skills, each doing one thing.

1. **`/align-detect` (widen the existing skill).** Add a trigger: *a load-bearing item where a
   position was taken on the **validity** layer and the **meaning** layer was never visited.*
   Validity self-surfaces — people voice disagreement — so it needs no detector; meaning does
   not, which is why it is the asymmetric target. Add a **verification-rung** field per card
   (`none` / `one-sided restatement` / `confirmed-unnumbered` / `confirmed-numbered` /
   `predicted+scored` / `both-at-10`). Allow `SUBJECT` to be **the exchange** (both parties)
   with **per-quote attribution mandatory**. Keep the stake in time AND money and multiply it
   by low rung, so a high-stakes item at rung `none` outranks the same stake at `confirmed`.
   Keep the ranked brief and the pick-one step.

2. **`/align-decompose` (new).** Takes the picked item, produces story + point + anti-point on
   the current model ([story-point-model.md](../docs/story-point-model.md), rewritten
   2026-08-06). The paraphrase must carry the **reasoning**, not the conclusion — a recount has
   nothing to comprehend. The anti-point is a **pointer** to its canonical home, never restated
   (three homes have already diverged on four axes — [decisions.md](../docs/decisions.md)
   2026-07-29 [process]). Writes nothing to prod; re-runnable until the story reads right.

3. **`/align-create-letter` (new — separate skill, not a tail of `/align-decompose`).** Files
   the approved output as a private letter. Separate because the two differ in reversibility:
   decompose is re-runnable, filing writes to prod once per run. Making the approval gate a
   **skill boundary** means no prod write can occur in the same invocation that generated the
   text.

   **It must build a real letter write path.** `content/create-letter-from-transcript.md` files
   a **Doc**, not a letter — it writes `clarity_docs`/`stories`/`points`/`story_points`/
   `doc_stories` and nothing in `clarity_letters`, `letter_deliveries`, `letter_predictions`, or
   `letter_story_snapshots`, and its own default is Doc-only. What is genuinely liftable is its
   **prod-write mechanics**: owner lookup by email with assert-exactly-one-row, a single atomic
   `DO $$` block, curl rather than python (Cloudflare returns 1010 for python HTTP clients —
   quoted from that skill, not independently verified), prod ref derived from `.env.prod` only,
   REST fallback, and its Prod-write gate. Do **not** inherit its Emotion gate (an agent
   paraphrasing the founder's reasoning has no feelings to elicit) or its element table (the
   consumers sidecar registers that as deliberately diverged).

   **Author handling — confirm, don't ask.** Derive the author from the input (agent transcript
   ⟹ agent profile) and ask the founder to **confirm**, not supply. Prod writes stay
   ALWAYS-ASK; the gate is a one-key confirmation of a derived value. Silence is never
   confirmation and no flag skips it. Fall back to asking when the author cannot be derived.

   **On success** print the letter URL and open it in the browser.

### The agent profile

An ordinary profile named **"Slava's Agent"**. No schema flag, no registration flow, no
`is_agent` column. It needs an auth user, therefore a mailbox — and a real authenticated
session, because `seal_and_send_letter` raises unless `v_sender_id = auth.uid()`; a Management
API `DO $$` block has no `auth.uid()`. It must also address the founder **by email**, not by
profile id: `p878_relationship_scope` enumerates existing edges only, so a fresh profile has an
empty scope and the profile-id branch raises "Recipient is not in your relationship scope".

## Risks / Non-Goals

### Risks

- **The founder's listener-side calibration is polluted.** `calibration-service-real.ts:150`
  filters nulls but not the `speaker_rating: 0` placeholder, so a reverse-story rating enters
  his listener calibration as a bogus zero-gap row — mixing "did the agent capture me" into
  "how well I understand other people." **MITIGATE:** exclude reverse-story rows from the
  calibration aggregates. Required, not optional; without it the AC below is violated.
- **`accuracy_achieved` is `speaker_rating = 10`, not `>= 8`.** P272
  (`20260218_p272_accuracy_achieved_threshold.sql:16`) superseded the original definition.
  Because the letter path leaves `speaker_rating` at 0, the column is `false` on every letter
  rating row — harmless here, since the payload is `listener_rating`. **ACCEPT, documented.**
  Do not rename, re-derive, or "fix" this column in this spec.
- **The `ear` metric fires on the founder.** The P940 trigger increments `ears_count` and
  `verification_session_count` for `listener_id` — the founder, for rating a story about
  himself. **DEFER to /architect:** exclude, or accept and document. Not a blocker either way.
- **Widening `SUBJECT` to the exchange weakens `align-detect`'s strongest guard.**
  Cross-speaker attribution is the defect it is most graded on avoiding. **MITIGATE:** per-quote
  attribution becomes mandatory; a quote without attribution is dropped, exactly as an unquoted
  card is today.
- **The story is invisible on the founder's profile and in `/live`.** `getStoriesByAuthorWithPoints`
  filters `author_id = <user>` AND `visibility = 'public'`; a reverse story is neither.
  **ACCEPT** — it is reachable through the letter, which is the only surface in scope. Note this
  also means the `/live` guard the previous draft specified is unnecessary: a reverse story
  cannot reach `/live` selection in the first place.
- **`/live` derives speaker from session role, not authorship** (`clarity-live-page.tsx:2177`).
  Recorded to correct the previous draft's claim; no action follows from it.

### Non-Goals

- **Do NOT invert `speaker_id`/`listener_id`.** The letter role invariant is encoded in 13 SQL
  functions; the new fact belongs on `stories`. See Resolved Decisions #3.
- **Do NOT build a `/live` guard or `/live` experience for reverse stories.** They cannot reach
  `/live` selection. If that changes, it is a separate spec.
- **Do NOT re-specify async explain-back scoring.** `story_explain_backs` (P904) captures the
  receiver's words and **P949** owns scoring them — though P949 is a placeholder gated on the
  P904 CR. This spec scores a **story**, never an explain-back.
- **Do NOT build the adopt path.** "Score ≥8 ⟹ the experience owner adopts or amends it" stays
  out. **P1012 is re-scoped to own exactly that**, with a note that its reverse-story core moved
  here.
- **Do NOT build the async letter exchange.** `paraphrase_of_story_id` must exist so the loop is
  closable later; nothing else.
- **Do NOT change the min semantics, the oath, or `accuracy_achieved`.** Accepting the lower of
  two numbers stays a mental act with no interface or schema representation.
- **Do NOT add an `is_agent` column, agent registration, or any agent-specific product surface.**
- **Do NOT roll this out to other users.** Single-founder, single-agent, private letters only.
- **Do NOT hardcode any email, profile UUID, or person's name into a skill file.** This repo is
  public; resolve owners at runtime.

### Alternatives Considered

- **Invert the roles in `story_verifications`** (the previous draft) — rejected. See Resolved
  Decisions #3: 13 SQL sites, and `reveal_prediction` returns NULL silently under inversion.
- **Rewrite the 13 functions to be role-agnostic** — rejected. Replacing
  `listener_id = auth.uid()` with an OR widens behaviour for *normal* letters, letting a sender
  trip receiver-only branches. Changing a correct invariant to express an unrelated fact.
- **No marker at all — reword the question only** — rejected. The numbers would be captured but
  the model would not record whose experience the story is about, so every later read would have
  to infer it from context. It also leaves the reading view saying the story is the sender's.
- **A new `reverse_stories` table** — rejected. `stories` already has the author; one nullable
  column records the delta. A new table needs its own versioning, snapshotting and RLS and would
  not survive into the letter flow.
- **Extending `story_explain_backs` to allow a null `letter_id`** — rejected. Bound to a delivery
  and a snapshot, no version, no author semantics. The cold case is a story, not an attachment.
- **A separate skill for the agent case** — rejected. Detecting a load-bearing unverified
  assumption is the same job regardless of counterparty; only the remedy differs.

### Rollback Strategy

Drop `stories.experience_owner_id` and `stories.paraphrase_of_story_id` (both nullable, nothing
depends on either). Revert the conditional question string, the attribution block, and the
calibration exclusion. Skill files revert by `git revert`. Any filed reverse story becomes an
ordinary private story authored by the agent profile — inert, not corrupt. **No RPC or RLS
migration to reverse**, which is the point of Resolved Decisions #3.

## Done-When

- [ ] A reverse story exists in prod: authored by the agent profile, `experience_owner_id` set
      to the founder, delivered as a **private** letter
- [ ] The founder reads it in the product UI and submits a number — verified by querying
      `story_verifications` and seeing `listener_id` = founder, `speaker_id` = agent, and the
      founder's real number in `listener_rating`
- [ ] The agent's sealed estimate is in `letter_predictions` and `reveal_prediction` returns it
      **only after** the founder rates — verified by calling it before and after
- [ ] The reading view shows the attribution block, and the rating question reads *"How well do
      you believe this story represents your intended meaning?"*
- [ ] A normal (non-reverse) letter shows neither the attribution block nor the changed question
- [ ] The founder's calibration averages are numerically identical before and after the reverse
      story is rated — captured as two queries, not asserted
- [ ] Every existing letter flow behaves identically — regression suite green, and one existing
      letter rated end-to-end by hand
- [ ] `/align-detect` emits a verification rung per card and ranks a high-stakes `none`-rung item
      above an equal-stakes `confirmed`-rung item
- [ ] `/align-detect` cards drawn from both parties carry per-quote attribution; an unattributed
      quote is dropped and counted in the summary
- [ ] `/align-decompose` produces a story carrying the founder's **reasoning** — and its recount
      gate is **seen to fail** on a deliberate recount before it is trusted (epistemic gate 7)
- [ ] `/align-create-letter` derives the author, files only after explicit confirmation, and
      refuses on silence — with no flag that bypasses it
- [ ] `/align-create-letter` prints the letter URL and opens it
- [ ] Running `/align-decompose` alone writes nothing to prod
- [ ] `grep` over all three skill files returns no email address, profile UUID, or third-party name
- [ ] P1012 re-scoped to the adopt path, with the pointer to this spec
- [ ] `docs/story-point-model-consumers.md` updated — its own integrity check
      (`grep -rln "story-point-model" docs .claude features`) returns no file absent from its tables

## Acceptance Criteria

- [ ] An agent can state its understanding of the founder's reasoning and be scored on it
- [ ] The founder gives that score in the product rather than in a terminal
- [ ] The score cannot be self-certified by the agent
- [ ] No existing letter or `/live` behaviour changes, and no existing metric moves

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Attribution block | "⟲ About your experience — Written by the agent, about you" | Above story text, reverse story only |
| Experience-owner question | "How well do you believe this story represents your intended meaning?" | Replaces the receiver question, reverse story only |
| Normal-letter question | "How well do you believe you understand {firstName}'s intended meaning behind their story?" | Unchanged — `letter-flow-content.tsx:782` |
| Agent profile display name | "Slava's Agent" | Letter sender |

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] "the letter can only ask one of the two questions" is FALSE — it asks both (`letter-prediction-walk.tsx:116`, `letter-flow-content.tsx:782`, `calibration-verdict.tsx:33`) | Complication rewritten | The real gap is experience-owner ≠ author, not a missing question. The false claim was contradicted by the spec's own Solution. |
| 2 | /challenge-prd | [BLOCK] "four weeks of zero scores proves the founder won't type in a terminal" is CONFOUNDED — the loop died before the typing step | Claim removed | The founder's stated refusal stands as evidence on its own; the ledger does not corroborate it and no longer appears as support. |
| 3 | /challenge-prd | [BLOCK] The role inversion touches 13 SQL functions, and `reveal_prediction` (`p581:511`) returns NULL silently under it | **Marker on the story, roles untouched** | Whose experience a story is about is a fact about the *story*. Changing an invariant that 13 functions correctly encode, to express a fact belonging on another table, puts it in the wrong place — the silent `reveal_prediction` break is the symptom. |
| 4 | /challenge-prd | [BLOCK] `accuracy_achieved` is `= 10`, not `>= 8` (P272 superseded the quoted migration) | Corrected; risk re-reasoned | Under marker-only the placeholder is off the payload column, so the risk dissolves rather than needing mitigation. |
| 5 | /challenge-prd | [BLOCK] The lifted filing tail creates Docs, not letters | Scope corrected | Only the prod-write mechanics are liftable; the letter path must be built. Emotion gate dropped as inapplicable. |
| 6 | /challenge-prd | [BLOCK] `/live` guard unsatisfiable — a reverse story is double-excluded from selection | Guard removed from scope | Nothing to attach a marker to. Recorded as a Risk instead. |
| 7 | /challenge-prd | [WARN] RLS would hide the founder's own score — **REFUTED on re-check** | No action | The report quoted the P586 policy; P581 superseded it two weeks later with a source-aware branch admitting `speaker_id OR listener_id`. Same superseded-migration error as #4. |
| 8 | /challenge-prd | [WARN] Calibration aggregates contaminated | Exclusion required | Listed under Risks as MITIGATE and enforced by a Done-When comparing before/after. |
| 9 | /challenge-prd | [WARN] P1015 measures the same construct | Reconcile before either ships | Two independent measures of agent comprehension is what P1015's own "a measure invented after seeing the data is not a measure" rule exists to prevent. |
| 10 | Founder | Reverse-letter UI framing | Attribution block above the story | Prevents the misread without committing a second reading experience before the loop is known to produce a useful number. |
| 11 | /challenge-prd | [BLOCK-6c] `/align`'s Gate 0 would retire the agent case as align-target NONE | **Rejected** | The align-target is the agent, whose comprehension demonstrably matters — it writes specs and code from it. `align.md:105` retires cases where no one's comprehension is needed; this is not one. |
| 12 | /challenge-prd | Run `/align` to Step 3b first as the cheapest disproof | **Rejected** | `/align` is the terminal skill this replaces. It exercises neither the widened detection nor the new decomposition, and the founder has already answered the question it would ask. |

## Open — `[FOUNDER DECISION]`

- [ ] The mailbox for the agent profile's auth user
- [ ] Retention for reverse stories filed during testing — keep, or purge after the run

## References

- [decisions.md](../docs/decisions.md) 2026-07-29 [process] (run abandoned; steps 4–5 at zero) ·
  2026-07-29 [process] (anti-point drift) · 2026-07-11 [process] (`/align` founding decision —
  the min rule and the live-only scoping)
- [story-point-model.md](../docs/story-point-model.md) ·
  [story-point-model-consumers.md](../docs/story-point-model-consumers.md)
- `supabase/migrations/20260204_stories_points_calibration.sql` (`story_verifications`) ·
  `20260218_p272_accuracy_achieved_threshold.sql` (threshold `= 10`) ·
  `20260403224331_p581_clarity_letters.sql` (source-aware RLS; `reveal_prediction`) ·
  `20260630120000_p975_restore_letter_rpc_scope_gate.sql` (seal gates; relationship scope)
- `src/app/data/calibration-service-real.ts` · `src/app/pages/clarity-live-page.tsx`
- `features/p1012_reverse_story_sender_paraphrase.md` (to be re-scoped) ·
  `features/p949_async_letter_calibration_scoring.md` ·
  `features/p1015_agent_listening_calibration_twin_first.md` (reconcile)
- `.claude/commands/slava/think/align-detect.md` ·
  `.claude/commands/slava/content/create-letter-from-transcript.md`

## Note

The term "reverse story" and the concept "experience owner" appear in exactly one place in the
repo today (`features/p1012_...:52`) and in no strategy doc. If this ships, they need a home in
`docs/definitions.md`.
