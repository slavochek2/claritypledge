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
delivery_stage: architect
pipeline_ran: [create-spec, challenge-prd, architect]
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
| 9 | /challenge-prd | [WARN] P1015 measures the same construct | **Resolved 2026-08-07 — P1015 parked; P1030 is the active measure** | P1015 measures passively (corrections that arrive unasked), P1030 actively (a scored paraphrase). Two independently-defined measures of one construct is what P1015's own "a measure invented after seeing the data is not a measure" rule forbids. P1030 fixes the measure in advance — both question strings pinned in the UI Contract before any data exists. P1015 unparks once a real score exists, to ask whether the active number predicts the passive correction rate. |
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
  `features/p1015_agent_listening_calibration_twin_first.md` (parked 2026-08-07 — the passive
  measure of the same construct; unparks when this spec produces a real score)
- `.claude/commands/slava/think/align-detect.md` ·
  `.claude/commands/slava/content/create-letter-from-transcript.md`

## Note

The term "reverse story" and the concept "experience owner" appear in exactly one place in the
repo today (`features/p1012_...:52`) and in no strategy doc. If this ships, they need a home in
`docs/definitions.md`.

## Technical Architecture

### Technical Analysis

Every claim below was produced by a command run this session. Where a claim could not be
executed, it is labelled **UNVERIFIED** and the reason is given.

#### Verified state of the code this feature touches

| # | Claim | Evidence |
|---|-------|----------|
| 1 | `seal_and_send_letter` raises unless the caller is the sender. Newest definition is the 4-arg overload in P975. | `grep -rln "seal_and_send_letter" supabase/migrations/` → newest is `20260630120000_p975_restore_letter_rpc_scope_gate.sql`. Guard at `:68-70`: `IF v_sender_id != auth.uid() THEN RAISE EXCEPTION 'Only the letter sender can seal this letter'` |
| 2 | The relationship-scope gate fires **only** on the `receiver_profile_id` branch. | Same file `:173-194`. The branch is entered when `v_receiver_email IS NULL AND v_receiver_profile_id IS NOT NULL`; the gate is `:182-188`, raising `'Recipient is not in your relationship scope'`. Spec claim confirmed. |
| 3 | The **by-email** branch is ungated **and still resolves `receiver_profile_id`**. | Same file `:195-204`: `SELECT id INTO v_receiver_profile_id FROM profiles WHERE lower(email) = lower(v_receiver_email)`. This is load-bearing — `reveal_prediction` requires a non-null `receiver_profile_id` (see #8). |
| 4 | `p878_relationship_scope` enumerates **existing edges only**; a fresh profile returns the empty set. | `20260605150000_p878_search_profiles_rpc.sql:102-157` — six-arm `UNION` over `clarity_letters`/`letter_deliveries` (both directions), `clarity_agreements` (`status IN ('active','terminated')`), `witnesses` (both directions). No arm can match a profile with no rows. `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` at `:159`. Spec claim confirmed. |
| 5 | A Management-API `DO $$` block cannot seal. | **Partially UNVERIFIED.** #1 is verified by reading the function. That a service-role SQL session carries no `request.jwt.claims` GUC (so `auth.uid()` is NULL and the `!=` comparison raises) was **not executed this session** — doing so would require a prod write. Structurally certain, not measured. The architecture below does not depend on the failure mode being exactly "NULL": it routes the seal through a real JWT either way. |
| 6 | `stories` SELECT RLS admits public stories and the **author** only. | `grep -rn "Stories readable by visibility" supabase/migrations/*.sql` → three definitions; newest is `20260325120000_p586_visibility_privacy_foundation.sql:198-202`: `visibility = 'public'::content_visibility OR author_id = auth.uid()`. **Consequence: the experience owner cannot read an agent-authored private story.** Any read-side design that joins a verification back to `stories` from the founder's session is blind by construction. This is the single most load-bearing finding below. |
| 7 | `story_verifications.speaker_rating` is **nullable**; `accuracy_achieved` is a generated column. | `20260204_stories_points_calibration.sql:123` (`speaker_rating SMALLINT CHECK (speaker_rating BETWEEN 0 AND 10)` — no `NOT NULL`); `20260218_p272_accuracy_achieved_threshold.sql:14-17` (`GENERATED ALWAYS AS (speaker_rating = 10) STORED`). A NULL `speaker_rating` yields a NULL `accuracy_achieved`, which `update_story_understood_count` (`20260222120000_p413…:16-22`, `WHERE … accuracy_achieved = true`) excludes. |
| 8 | Neither reveal path reads `speaker_rating`. | `reveal_prediction` — `20260403224331_p581_clarity_letters.sql:495-527`: gates on `receiver_profile_id = auth.uid()` then on the mere existence of a `source='letter'` verification row. `reveal_prediction_by_token` — newest is `20260630130000_p977_p979_restore_dropped_sd_guards.sql:128-200`, same shape plus snapshot scoping. Nulling `speaker_rating` cannot break Done-When #3. |
| 9 | The calibration asymmetry the spec cites is real, **and the pollution is pre-existing for every letter.** | `src/app/data/calibration-service-real.ts:145-157`: `listenerAgg` carries `.not('speaker_rating','is',null)` and `.not('listener_rating','is',null)`; `speakerAgg` carries neither. **New finding:** every letter rating writes `speaker_rating: 0` (`letters-service.ts:326` and `:1115`, both commented "Placeholder — sender predicts separately"), and `0` passes an IS-NOT-NULL filter — so **every letter the founder has ever rated already drags his `listenerCalibrationAvg` toward 0.** P1030 does not introduce this defect; it inherits it. Out of scope here, worth its own bug spec. |
| 10 | There is a **second** listener-calibration surface the spec does not name. | `20260627120000_p967_listener_calibration_rpc.sql:15-48` — `get_my_listener_calibration_diffs()`, SECURITY DEFINER, consumed by `src/app/data/use-listener-calibration-diffs.ts:82` and the breakdown page. Its footer average (`computeFooter`, same file `:52-57`) is a calibration average. Its eligibility clause is `speaker_rating IS NOT NULL AND listener_rating IS NOT NULL` — identical to `listenerAgg`. It already `LEFT JOIN stories s ON s.id = sv.story_id` and never uses `s`. Done-When "calibration averages numerically identical" must cover this surface too. |
| 11 | The P940 ear trigger recomputes from source and applies **no** rating filter. | `20260616120000_p940_ear_metric_per_story.sql:19-49`: `ears_count = (SELECT COUNT(DISTINCT story_id) FROM story_verifications WHERE listener_id = NEW.listener_id AND story_id IS NOT NULL)`, plus `verification_session_count + 1` for the listener and, when the roles differ, for the speaker. SECURITY DEFINER "so it can update both profiles regardless of who inserts the verification". |
| 12 | `letter_story_snapshots` is readable by sender **or** receiver and is write-locked to SECURITY DEFINER. | `20260403224331_p581_clarity_letters.sql:220-238` — SELECT `_is_letter_sender(...) OR _is_letter_receiver(...)`; INSERT/UPDATE/DELETE all `false`. Table shape at `:55-63`, `point_config JSONB DEFAULT '{}'::jsonb`. |
| 13 | **Every** snapshot-serialising RPC passes `point_config` through verbatim. | `grep -rn "letter_story_snapshots" supabase/migrations/*.sql` → 9 read sites; the serialising ones (`20260405051035_p651…:76-89` `get_letter_for_reading`, the `get_letter_by_token` block in the same file, `20260412000002_p684…:72`, `20260412170000…:49`, `20260412102942_p697…:67,152`, `20260413130000_p699…:123`) all emit `'point_config', lss.point_config`. A new key inside that JSONB reaches every reading path with **zero RPC edits**. |
| 14 | The reading component already holds the current snapshot and already reads keys out of `point_config`. | `src/app/components/letters/letter-flow-content.tsx:384` `const currentSnapshot = snapshots[state.currentStoryIndex]`; `:409-410` `getEffectiveLeadCount(currentSnapshot.point_config, …)`. The reader question is at `:782`; the story card it sits under is at `:738-748` (`<LiveStoryCardExpanded story={storyWithPoints} …>` inside the `story-rate` phase block starting `:736`). **No new fetch is required.** |
| 15 | `letter-prediction-walk.tsx:116` is the **sender's** prompt and has no snapshot in scope. | `:114-117` — `promptText` is built from the `receiverName` prop; the component's data is `DocStory`-shaped live doc state, not `LetterStorySnapshot`. It renders during compose, which the agent never opens. |
| 16 | A prod password-grant sign-in already exists in-repo and is already wired into `/ship`. | `scripts/prod-smoke-test.mjs:61-68` — `POST ${PROD_URL}/auth/v1/token?grant_type=password` with `PROD_TEST_AGENT_EMAIL` / `PROD_TEST_AGENT_PASSWORD` / `PROD_SUPABASE_ANON_KEY` read from `.env.local` (`:36-45`). Admin user creation with `email_confirm` is at `scripts/test-edge-fn.mjs:23-34`. |
| 17 | `.env.local` already resolves the founder's prod email and every prod key this feature needs. | `cut -d= -f1 .env.local` → `COPY_PROD_FOUNDER_EMAIL`, `PROD_SUPABASE_ANON_KEY`, `PROD_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `PROD_TEST_AGENT_EMAIL`, `PROD_TEST_AGENT_PASSWORD`. Values were not read. **No recipient address needs to appear in any skill file.** |
| 18 | `stories` has **no** column-level GRANTs, no views, and no rowtype dependants. | `grep -rn "GRANT SELECT" supabase/migrations/*.sql` → only `p877`/`p886` (on `profiles`) and `p1010` (on `organization`/`membership`) — **control-tested**: the same probe returns the known-good `p877` hits, so its emptiness for `stories` is a finding, not a blind spot. `grep -rn "CREATE VIEW\|CREATE OR REPLACE VIEW"` → 0 hits repo-wide. `grep -rn "SELECT \* FROM stories\|stories%ROWTYPE\|RETURNS SETOF stories"` → 0 hits. **Adding a column to `stories` needs no GRANT and breaks no function.** |
| 19 | Recreating `seal_and_send_letter` is guarded by two source canaries. | `src/tests/p975-letter-scope-gate.test.ts` (named in `20260630120000_p975…:23-25`) and `src/tests/sd-guard-completeness.test.ts` (`docs/decisions.md:2749`, canary proven to fire). Any recreate-from-old-base fails CI. The design below avoids touching the function at all, so neither canary is stressed. |
| 20 | A private story is only snapshotted when the letter is `one-to-one`. | `20260630120000_p975…:150` — `WHERE ds.doc_id = v_source_doc_id AND (v_mode = 'one-to-one' OR s.visibility = 'public')`. The reverse letter **must** be created with `mode = 'one-to-one'` or the snapshot silently does not exist. |
| 21 | The agent profile must be bootstrapped out-of-band, and must be `is_verified`. | Profiles are created only in `AuthCallbackPage.tsx`, never by trigger (`.claude/rules/database.md` §"No Database Trigger for Profile Creation"). `stories` INSERT requires `EXISTS (… profiles WHERE id = auth.uid() AND is_verified = true)` (`20260325120000_p586…:207-212`), and `is_verified` is pinned against client roles by `guard_profile_trust_columns` (`20260605150000_p878…:54-77`) — so only the service role can set it. |
| 22 | Spec risk claims re-checked. | `getStoriesByAuthorWithPoints` filters `.eq('author_id', authorId)` then `.eq('visibility','public')` — `src/app/data/stories-service-real.ts:377,381`. `/live` derives the speaker from session role — `src/app/pages/clarity-live-page.tsx:2176-2181`. Both spec claims confirmed. |
| 23 | The reader URL is `/letter/<deliveryId>`. | `src/App.tsx:839` `<Route path="/letter/:id" …>`; `:140` comment — "resolve shortcodes like /letter/st5 to the latest sealed **delivery** UUID". |

#### Reuse inventory

Every Architecture Decision below cites this table.

| Thing | Path | Used for |
|---|---|---|
| `seal_and_send_letter` (4-arg) | `supabase/migrations/20260630120000_p975_restore_letter_rpc_scope_gate.sql:30` | The only authenticated call in the filing path. **Called, never modified.** |
| `p878_relationship_scope` | `20260605150000_p878_search_profiles_rpc.sql:102` | Why the by-email branch is the way in. Not modified. |
| `update_profile_ears_count` | `20260616120000_p940_ear_metric_per_story.sql:19` | Modified (AD-4). Existing SECURITY DEFINER + recompute-from-source shape reused as-is. |
| `guard_profile_trust_columns` | `20260605150000_p878…:54` | **Pattern source** for a write-time column pin. |
| `enforce_story_visibility_immutable` + `trg_story_visibility_immutable` | `20260325120000_p586…:126-140` | **Pattern source** for AD-2's immutability trigger. |
| `get_my_listener_calibration_diffs` | `20260627120000_p967_listener_calibration_rpc.sql:15` | Second calibration surface; **not modified** — AD-3 works through its existing eligibility clause. |
| `calibration-service-real.ts` `getCalibration` | `src/app/data/calibration-service-real.ts:116-204` | First calibration surface; **not modified** — same reason. |
| `letter_story_snapshots.point_config` | table `20260403224331_p581…:55`; pass-through verified in 6 RPCs (#13) | Transport for the reverse flag (AD-5). |
| `getEffectiveLeadCount` | `src/app/utils/letter-reading-utils.ts` (called `letter-flow-content.tsx:410`) | **Pattern source + co-location home** for `isReverseStory(point_config)`. |
| `snapshotToStoryWithPoints` / `PointConfig` | `src/app/utils/letter-snapshot-mapper.ts:23-32` | The `PointConfig` interface gains one optional key. |
| `LetterFlowContent` `story-rate` phase | `src/app/components/letters/letter-flow-content.tsx:736-796` | Insertion point for both UI Contract strings. |
| `ComprehensionRatingCard` | `src/app/components/shared/comprehension-rating-card.tsx` (used `letter-flow-content.tsx:781`) | Already takes `question` as a prop — the conditional string needs no component change. |
| `prod-smoke-test.mjs` auth block | `scripts/prod-smoke-test.mjs:36-68` | **Verbatim pattern** for AD-1. |
| `scripts/test-edge-fn.mjs` admin-create | `scripts/test-edge-fn.mjs:23-34` | Pattern for the one-time agent bootstrap. |
| `create-letter-from-transcript.md` filing mechanics | `.claude/commands/slava/content/create-letter-from-transcript.md:89-128` | Prod-write mechanics only (curl-not-python, single atomic `DO` block, `.env.prod`-derived ref, assert-exactly-one-row, REST fallback, read-back-before-claiming). Emotion gate and element table deliberately **not** inherited (Resolved Decision #5; the element-table divergence is registered in `docs/story-point-model-consumers.md`). |
| `/align-detect` | `.claude/commands/slava/think/align-detect.md` (v1.5.0, 340 lines) | Widened in place. Its Step A subject gate `:38`, Step B triggers `:88`, Step C cards `:117`, quality gates `:305` are the edit sites. |
| `/align` orchestrator | `.claude/commands/slava/think/align.md:63,76,86,332` | Holds the stage table that must learn about the two new skills. |
| `letters-service.ts` `createLetter` | `src/app/data/letters-service.ts:58-81` | Confirms there is **no** create-letter RPC — a plain insert. The skill's raw insert is therefore correct, not a shortcut. |
| `sd-guard-completeness.test.ts`, `p975-letter-scope-gate.test.ts` | `src/tests/` | Canaries that would fire if the seal RPC were recreated. Left untouched and unstressed. |

---

### Architecture Decisions

#### Decision 1 — The agent's authenticated session: password grant against the prod auth REST endpoint

**Chosen.** A dedicated prod auth user for the agent, bootstrapped once by a service-role
script, signed in per run with `POST /auth/v1/token?grant_type=password`. The resulting JWT is
used for **exactly one call** — `POST /rest/v1/rpc/seal_and_send_letter`. Every other write in
the filing path uses the service role, as `create-letter-from-transcript` already does.

Options considered, ranked on correctness then security:

| Option | What it requires operationally | `.env.local` vs runtime | Failure modes | Public-file constraint |
|---|---|---|---|---|
| **A. Password grant** (chosen) | One-time: service-role `POST /auth/v1/admin/users` with `email_confirm: true` (pattern: `test-edge-fn.mjs:23`), then a service-role `profiles` insert with `is_verified = true` (#21). Per run: one sign-in. | `.env.local`: `PROD_ALIGN_AGENT_EMAIL`, `PROD_ALIGN_AGENT_PASSWORD` (+ existing `PROD_SUPABASE_ANON_KEY`). Runtime: agent profile id from `signIn.user.id`; recipient from `COPY_PROD_FOUNDER_EMAIL` (#17). | Password rotation or a future MFA requirement breaks the run loudly (non-200, no silent fallback). A leaked `.env.local` yields that one account — the same exposure class the repo already accepts for `PROD_TEST_AGENT_*`. | **Holds.** The skill names variables, never values. |
| **B. Admin `generate_link` (magiclink) + `/auth/v1/verify`** | Service-role call per run; no password anywhere. | `.env.local`: `PROD_SUPABASE_SERVICE_ROLE_KEY` (already present) + the agent address. | **Unproven in this repo** — `grep -rn "admin/generate_link" scripts/ .claude/ src/` → 0 hits. Token-type and verify-exchange semantics would be discovered on prod, against a live seal. Adds a second use for the highest-privilege key. | Holds. |
| **C. Real magic link to a real mailbox** | A mailbox per run, IMAP fetch (`scripts/read-ops-email.mjs` exists), link extraction. | Mailbox credentials. | Most moving parts of the three: mail delivery latency, link expiry, IMAP flakiness — three new failure modes for one session. | Holds. |
| **D. Reuse `PROD_TEST_AGENT_*`** | Nothing new. | Nothing new. | **Rejected on correctness, not effort:** that identity is the `/ship` smoke-test account (`decisions.md` P889 — `/ship` runs `prod-smoke-test.mjs`), which writes throwaway rows on prod. Binding a durable, founder-facing sender identity to a disposable test account means a future smoke-test cleanup can delete the agent's profile out from under filed letters. | Holds. |

**Rationale.** Correctness first: A is the only option whose exact mechanism is demonstrated
against prod inside this repo (#16), and correctness outranks the marginal secret-material
advantage B holds. Security second: A's new credential is scoped to one non-admin account
(`is_admin` stays false, so the P975 scope gate applies to it in full — the agent gets no
bypass), whereas B broadens what the service-role key is used for. Both A and B keep the
public-file constraint; A is the one that also keeps the failure surface inspectable.

**Trade-off.** One long-lived password now lives in `.env.local`. Accepted because its blast
radius is a single non-admin profile whose only content is reverse stories, and because the
alternative that avoids it (B) trades a measured mechanism for an unmeasured one.

**Alternative rejected.** Teaching `seal_and_send_letter` a service-role bypass. That is a
guard-weakening edit to the exact function whose guard was silently dropped once already
(P952 → P975, `decisions.md:2773`), and it would trip both canaries (#19). The sender identity
must be a real session; that is the invariant, not an obstacle.

**Consequence for the open founder decision.** `email_confirm: true` on the admin-create means
**no mailbox is required for the agent to authenticate.** The open `[FOUNDER DECISION]` "the
mailbox for the agent profile's auth user" reduces to choosing an address string; deliverability
is not needed, because nothing is ever sent *to* the agent (the letter notification goes to the
recipient). Recorded here, not decided here.

#### Decision 2 — The migration: two nullable columns plus an immutability pin

**Chosen.** One migration, `supabase/migrations/20260807120000_p1030_reverse_story_marker.sql`
(14-digit convention confirmed against the newest files, e.g. `20260729220000_p1010_cm_about_copy.sql`;
`.claude/rules/database.md` §"Migration Naming"):

```sql
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS experience_owner_id     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS paraphrase_of_story_id  UUID REFERENCES stories(id) ON DELETE SET NULL;
```

Plus a BEFORE UPDATE pin on `experience_owner_id`, modelled on
`enforce_story_visibility_immutable` (inventory): once written, the column cannot change.

**Rationale.** Additive and inert by #18 — no column GRANT (only `profiles` and the P1010
tables have column-level grants, control-tested), no view, no rowtype dependant, no
`SELECT *`-into-record function. `letter_story_snapshots` copies specific columns, so it needs
nothing (AD-5 adds its own carrier). The two `stories` triggers that fire on write
(`trg_story_initial_version`, `trg_stories_extract_hashtags`) touch neither column.

The immutability pin exists for a concrete tamper vector, not tidiness: `stories` UPDATE RLS
lets an author update their own row (`p586:219-222`), so without the pin **any author could set
`experience_owner_id` to another user's id on an already-rated story and silently reduce that
user's `ears_count`** (AD-4 recomputes from source on every subsequent insert). Pinning the
column closes it. Setting the value at INSERT is harmless — a brand-new story has no
verifications.

**Trade-off.** A mis-filed `experience_owner_id` cannot be corrected in place; the story must be
deleted and refiled. This is the same trade-off already accepted for `stories.visibility`, and
the open `[FOUNDER DECISION]` on test-run retention already contemplates purging.

**Alternative rejected.** Allowing NULL → value updates so a backfill stays possible. That is
exactly the tamper vector (the attacker's story starts with a NULL), so the permissive variant
closes nothing.

#### Decision 3 — Calibration exclusion at write time, through the eligibility filters that already exist

**Chosen.** A BEFORE INSERT trigger on `story_verifications` sets `speaker_rating := NULL`
when the row's story is the listener's own experience. No read path changes.

```sql
CREATE FUNCTION p1030_is_own_experience(p_story_id uuid, p_listener_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stories s
                 WHERE s.id = p_story_id AND s.experience_owner_id = p_listener_id);
$$;
REVOKE EXECUTE ON FUNCTION p1030_is_own_experience(uuid, uuid) FROM PUBLIC, anon, authenticated;
```
called from a SECURITY DEFINER `BEFORE INSERT` trigger that nulls `NEW.speaker_rating`.

**Why this and not a read-side filter — the crux the spec left open.** The join from a
verification row back to `stories.experience_owner_id` **is not available from the founder's
session at all.** By #6, `stories` SELECT admits public rows or the author's own; a reverse
story is private and authored by the agent. The only viewer who ever sees the polluting row is
the founder (letter-sourced verifications are restricted to speaker/listener,
`p581:319-334`), and he is precisely the party RLS blinds. A PostgREST embed at
`calibration-service-real.ts:150` would return `null` for exactly the rows it must exclude and
would fail **open**. Making it work would require widening the `stories` SELECT policy for all
users forever — a table-wide policy change to express one row's fact.

Write-time normalisation avoids that entirely, and it is the *honest* value: on a reverse story
there is no speaker rating of the listener's understanding; the agent's number is a
**prediction**, and predictions live in `letter_predictions`. A NULL then rides the eligibility
clauses that already exist and were written for this meaning — `.not('speaker_rating','is',null)`
at `calibration-service-real.ts:151` and `speaker_rating IS NOT NULL` at
`p967…:44`. **One trigger fixes both calibration surfaces**, including the breakdown-page footer
the spec does not name (#10).

Verified non-consequences: `accuracy_achieved` becomes NULL, which `update_story_understood_count`
already excludes (#7); neither reveal path reads the column (#8), so Done-When #3 is unaffected.

**How the Done-When is measured.** Two identical runs of one query — before the founder rates,
and after — against **prod**, with the founder's profile id resolved at runtime:

```sql
-- mirrors calibration-service-real.ts:146-152 AND p967 get_my_listener_calibration_diffs
SELECT count(*) AS n,
       avg(speaker_rating)::numeric(12,6)  AS listener_calibration_avg,
       avg(listener_rating)::numeric(12,6) AS listener_self_rating_avg
FROM story_verifications
WHERE listener_id = :founder_id
  AND speaker_rating  IS NOT NULL
  AND listener_rating IS NOT NULL;
```

All three values must be byte-identical across the two runs. Paste both outputs; do not assert.
A row must exist in `story_verifications` for the reverse story between the two runs — otherwise
the test passed vacuously, and the pair proves nothing.

**Trade-off.** The exclusion is enforced where the row is written, not where it is read, so a
future read surface that does *not* filter null `speaker_rating` will still show the row (e.g.
`getListenerVerificationHistory`, `calibration-service-real.ts:300-329`, which lists history
without filters). That is acceptable — a history list showing "no speaker rating" is accurate.

**Alternative rejected.** Denormalising a flag onto `story_verifications`. Resolved Decision #3
places the fact on the story; a second copy on the verification is the duplication that decision
rejects. **Alternative rejected.** Widening `stories` SELECT with `OR experience_owner_id = auth.uid()`
— it changes a table-wide policy, lets any author push readable private content at a chosen
victim, and *still* leaves the P967 SECURITY DEFINER surface unfixed (it bypasses RLS).

#### Decision 4 — The `ear` metric: exclude (the spec's DEFER, resolved)

**Chosen.** Modify `update_profile_ears_count` (P940) so a reverse-story verification
contributes neither to the listener's `ears_count` nor to the listener's
`verification_session_count`. The speaker-side increment (`:41-45`) is left exactly as is.

```sql
UPDATE profiles SET
  ears_count = (SELECT COUNT(DISTINCT sv.story_id) FROM story_verifications sv
                WHERE sv.listener_id = NEW.listener_id AND sv.story_id IS NOT NULL
                  AND NOT p1030_is_own_experience(sv.story_id, sv.listener_id)),
  verification_session_count = verification_session_count
    + CASE WHEN p1030_is_own_experience(NEW.story_id, NEW.listener_id) THEN 0 ELSE 1 END
WHERE id = NEW.listener_id;
```

**Rationale — measured against the metric's own definition, not convenience.** P940 defines an
ear as "the number of DISTINCT stories the listener was rated on… A practice-volume signal,
coherent with the listening-calibration component" (`20260616120000_p940…:6-12`). A reverse
story is not a listening rep: the founder is not demonstrating understanding of someone else's
experience, he is confirming whether his own was captured. Counting it inflates a
listening-practice metric with a non-listening event — the definition is violated, so accepting
it is the option that breaks the metric. Acceptance Criterion 4 ("no existing metric moves")
independently forbids it. Because the trigger recomputes `ears_count` from source, the predicate
in the subquery also keeps historical rows correct if the marker is ever backfilled.

**Trade-off.** A previously type-agnostic trigger gains one story-type condition, and it now
calls a helper. Contained: one function, one predicate, shared with AD-3 so the two cannot drift.

**The one metric that does move, stated plainly.** The **agent's** own
`verification_session_count` increments by 1 per rated reverse story (the speaker-side branch).
Suppressing it would need a second asymmetric condition for zero benefit: the agent is a new
profile with no history and no surface that displays it. **ACCEPT, documented.**

**Alternative rejected.** Accept-and-document for the founder. It moves a founder-visible
metric, contradicts AC-4, and would leave `ears_count` meaning two different things depending on
who owned the experience.

#### Decision 5 — The reverse flag reaches the UI inside `point_config`, written by a snapshot trigger

**Chosen.** A SECURITY DEFINER `BEFORE INSERT` trigger on `letter_story_snapshots` that, when
the snapshotted story has `experience_owner_id IS NOT NULL AND experience_owner_id <> author_id`,
merges a single key into the row being written:

```sql
NEW.point_config := COALESCE(NEW.point_config, '{}'::jsonb) || jsonb_build_object('reverseStory', true);
```

**Rationale.** By #13 every reading path — the authed RLS read, `get_letter_for_reading`,
`get_letter_by_token`, the public-reading RPCs — already forwards `point_config` verbatim, so
**one trigger reaches all of them and no RPC is edited.** In particular
`seal_and_send_letter` is not recreated, which keeps this feature away from the
recreate-from-old-base class that produced the P952 → P975 security regression (#19,
`decisions.md:2773`). It also preserves the snapshot's defining property: a sealed letter
freezes what the reader saw, so a later story edit cannot retro-change a delivered letter.

**A boolean, never the UUID.** The marker carries no profile id. `point_config` is forwarded to
anonymous token readers and to public one-to-many readers; emitting an owner UUID there would
put a profile identifier on a path the reverse-story scope never intended to cover. The UUID
stays on `stories` where the record of truth belongs; the snapshot carries only what the
renderer needs.

**Client side, zero new fetches** (#14): add `reverseStory?: boolean` to the `PointConfig`
interface (`letter-snapshot-mapper.ts:23-32`) and an `isReverseStory(point_config)` helper
beside `getEffectiveLeadCount` in `letter-reading-utils.ts` — the exact pattern
`letter-flow-content.tsx:409-410` already uses. Then one derived constant next to
`currentSnapshot` at `:384`.

**Trade-off.** A second representation of one fact (column + snapshot key). Inherent to
snapshotting and already true of `visibility`, `imageUrl` and `lead_count`.

**Alternative rejected.** Adding a real column to `letter_story_snapshots`. It would require
editing every serialising RPC (#13 — they enumerate columns in `jsonb_build_object`), turning a
one-trigger change into six function recreations. **Alternative rejected.** Adding the key
inside `seal_and_send_letter`'s snapshot INSERT — a 200-line recreation of the repo's most
regression-prone SECURITY DEFINER function for a value a trigger supplies for free.
**Alternative rejected.** Having the reading page fetch `stories.experience_owner_id` — blocked
by #6, and it would leave the anonymous token path rendering the wrong question.

#### Decision 6 — UI: one insertion point, one conditional string, and no change to the prediction walk

**Chosen.** In `src/app/components/letters/letter-flow-content.tsx`:

- derive `const isReverseStory = isReverseStorySnapshot(currentSnapshot.point_config)` beside `:384`;
- render the attribution block immediately above `<LiveStoryCardExpanded>` in the `story-rate`
  phase (`:738`), gated on `isReverseStory`, with the exact UI Contract string
  `⟲ About your experience — Written by the agent, about you`;
- make the `question` prop at `:782` conditional, using the two UI Contract strings verbatim —
  reverse: `How well do you believe this story represents your intended meaning?`; otherwise the
  existing template, unchanged character for character.

`ComprehensionRatingCard` already takes `question` as a prop, so no shared component changes and
no other letter surface is touched. **No UI Contract deviation.**

**`letter-prediction-walk.tsx:116` is deliberately not changed.** By #15 it is the *sender's*
compose-time prompt, fed by `DocStory` live state with no snapshot in scope; the agent files via
SQL and never opens compose. Changing it would require inventing a fetch (explicitly out of
scope) to alter a string no actor in this spec ever reads, and would modify an existing letter
behaviour that AC-4 protects. Recorded so the next reader does not re-derive it.

**Trade-off.** The attribution block renders only in `story-rate`. That is the only phase where
the story text and the rating question co-occur, which is what the UI Contract specifies
("Above story text").

**Alternative rejected.** A new reverse-story reading component. Resolved Decision #10 already
chose the block over a second reading experience.

#### Decision 7 — Three skill files: placement, boundaries, and the concrete write sequence

Namespace: all three live under `think/` — `/align-detect` already does, and the two new skills
are stages of the same chain (`.claude/rules/skills.md` §Namespace placement).

| Skill | Path | Change |
|---|---|---|
| `/align-detect` | `.claude/commands/slava/think/align-detect.md` | Widen in place, version bump |
| `/align-decompose` | `.claude/commands/slava/think/align-decompose.md` | New |
| `/align-create-letter` | `.claude/commands/slava/think/align-create-letter.md` | New |

**Governance applied** (`.claude/rules/skills.md`): no flags — every branch auto-detects or asks
once at runtime (`:112`); each new skill states its **own** subagent I/O contract inline if it
fans out, because the rules file is path-triggered on *editing* skills and does not load at
runtime (`:146`); every MCP instruction carries an explicit bash fallback (`:65-78`) — here the
fallback is the primary path, since curl + service role is the only mechanism that works in a
subagent; all three files are committed **on `main`** (`:80-106`); each appends its cost-tracking
line (`:120-133`).

**`/align-detect` — widen.** Add the verification-rung field (`none` / `one-sided restatement` /
`confirmed-unnumbered` / `confirmed-numbered` / `predicted+scored` / `both-at-10`) to the card
schema at `:117`; add the meaning-layer-never-visited trigger to the closed checklist at `:88`;
allow `SUBJECT` = the exchange at Step A (`:38`) with per-quote attribution **mandatory** — an
unattributed quote is dropped and counted in the summary, mirroring the existing unquoted-card
rule; multiply stake by inverse rung in the ranking; add a quality gate at `:305` asserting every
card carries a rung and every quote in an exchange-subject card carries an attribution.

**`/align-decompose` — new, writes nothing to prod.** Consumes the picked candidate, produces
story + point + anti-point on the current model (`docs/story-point-model.md`), with the
anti-point as a **pointer** to `docs/definitions.md`, never restated. Its blocking gate is the
**recount gate**: the paraphrase must carry the founder's *reasoning*, not his conclusion. Its
one hard invariant, stated in the file: no network write of any kind. Re-runnable.

**`/align-create-letter` — new, the only skill that writes.** Write sequence in dependency
order. Steps 1–4 use the service role; **step 6 is the only authenticated call.** RPCs are used
where they exist: the seal is the only RPC in this path — `createLetter` is a plain insert
(inventory), and no create-doc/create-story RPC exists.

1. **Resolve identities.** Sign in as the agent (AD-1) → agent profile id from `signIn.user.id`;
   assert its `profiles` row exists with `is_verified = true` (#21). Resolve the recipient from
   `COPY_PROD_FOUNDER_EMAIL` (#17) with **assert-exactly-one-row** (0 → stop; >1 → stop and list).
   Prod ref derived from `.env.prod` only — `.env.local` overrides `VITE_SUPABASE_URL` with the
   test ref.
2. **Author-confirm gate.** Print the derived author, the derived recipient (by role, never by
   address), the story text and the point. Require an explicit affirmative in the same turn.
   Silence, ambiguity, or any non-affirmative → refuse and exit **without writing**. No flag
   bypasses it.
3. **One atomic `DO $$` block**, one Management-API call (curl, never python — Cloudflare 1010,
   quoted from `create-letter-from-transcript.md:100`, not independently verified):
   `stories` (author = agent, `visibility='private'`, `experience_owner_id` = recipient,
   `paraphrase_of_story_id` = NULL for the cold case) → `story_versions` v1 arrives via
   `trg_story_initial_version` → `points` (point + anti-point, `visibility='private'`, no
   `system_tags`, increasing `created_at`) → `story_points` (matching increasing `created_at`) →
   `point_positions` for the agent → `clarity_docs` (owner = agent, private) → `doc_stories`
   (`position = 0`, `point_config.order` set explicitly — order locked twice, P837 trap) →
   `clarity_letters` (`sender_id` = agent, `source_doc_id`, **`mode = 'one-to-one'`**).
4. **Read back and show.** Story, marker, points, order, positions, letter row.
5. **Prod-write/seal gate.** Sealing is irreversible. Explicit confirmation, same turn.
6. **Seal — the authenticated call.** `POST /rest/v1/rpc/seal_and_send_letter` with the agent
   JWT: `p_letter_id`, `p_predictions: [{story_id, prediction}]`,
   `p_deliveries: [{receiver_email: <from env>, receiver_name}]`, `p_responses_mode: 'off'`.
   **By email, never `receiver_profile_id`** — the profile-id branch raises for a fresh agent
   (#2, #4); the by-email branch is ungated and still resolves `receiver_profile_id` (#3).
   `'off'` keeps the run to the single number this spec measures; it is one argument to change.
7. **Verify before claiming anything.** Assert `letter_story_snapshots` has one row whose
   `point_config->>'reverseStory' = 'true'` (proves AD-5 fired — **if `mode` were wrong there
   would be no snapshot at all**, #20); assert `letter_deliveries.receiver_profile_id` is
   **non-null** (without it `reveal_prediction` returns NULL and Done-When #3 cannot pass, #3/#8);
   assert one `letter_predictions` row.
8. **Print and open** `https://claritypledge.com/letter/<delivery_id>` (#23).

**Trade-off.** Steps 3 and 6 use different credentials, so a failure between them leaves a draft
letter with content but no delivery. That state is inert and re-sealable — strictly better than
the alternative of granting the agent session rights it does not need for steps 1–4.

**Alternative rejected.** Folding filing into `/align-decompose`. The skill boundary *is* the
approval gate (spec, Solution §3): no prod write can occur in the invocation that generated the
text.

#### Decision 8 — Exercising the two gates before trusting them (epistemic gate 7)

A gate never seen to fail is unproven, and a gate that refuses everything is equally broken —
so each exercise is a **pair**: a failure run and a control run, evidence pasted for both.

**`/align-decompose` recount gate.** Failure run: feed it a candidate whose paraphrase is a
verbatim recount of the founder's conclusion with the reasoning stripped. Required evidence: the
printed refusal naming the recount, and **no** story/point artifact written to
`.private/align/runs/`. Control run: the real reasoning-bearing candidate passes and produces the
artifact. Both ledgered to `.private/logs/align-calibration.log`.

**`/align-create-letter` refuse-on-silence gate.** Because the gate is prose executed by an
agent, the assertion must be mechanical and external: capture
`SELECT count(*) FROM clarity_letters WHERE sender_id = <agent>` immediately before and after.
Failure run: drive the skill to the confirmation gate and answer with silence or an ambiguous
token. Required evidence: the two counts, identical, plus the printed refusal. Control run: a
proper confirmation increases the count by exactly 1. A run that produces only the refusal text
without the count pair does not satisfy the Done-When.

---

### Security Review

Findings below were produced by a security subagent and then **re-verified by command in the
main session** before being written here (`epistemic.md` gate 9). Three of its conclusions were
corrected in that pass; each correction is labelled.

**RLS Policies**

- ✅ **The new columns change no row visibility.** Current `stories` SELECT policy is
  `p586:198-202` — `visibility = 'public' OR author_id = auth.uid()`. A reverse story is private
  and authored by the agent, so the founder cannot read it from the base table; he reads it
  through the letter, which is the only surface in scope.
- ✅ **The letter path is unaffected, verified against the current policy.** `story_verifications`
  `source='letter'` branch (`p581:320-331`) admits `speaker_id = auth.uid() OR listener_id =
  auth.uid()`; the founder is `listener_id`. `reveal_prediction` (`p581:482-520`) gates on
  `receiver_profile_id`/`listener_id` and references neither `author_id` nor the new column.
  Confirms Resolved Decisions #3 and #7.
- ✅ **Letter content never comes from a live `stories` join** — `seal_and_send_letter`
  denormalises into `letter_story_snapshots` at seal time (`p975:113-149`), which carries its own
  sender/receiver-scoped RLS (`p581:221-237`).
- ⚠️ **Hardening, not an exposure under this spec's scope.** `stories-service-real.ts` uses
  `SELECT *` in four read paths (`:224`, `:333`, `:482`, `:512`). RLS filters rows, not columns —
  so for any story with `visibility = 'public'`, these now return `experience_owner_id` and
  `paraphrase_of_story_id` to any caller. Not reachable here (reverse stories are always private,
  and the Non-Goals forbid rollout), but that protection is a **behavioural invariant, not an
  RLS-enforced one**. Recorded in the `docs/definitions.md` entry so a future author who makes a
  reverse story public meets this fact rather than rediscovering it.

**Authentication**

- ✅ **The guard is real and is the design constraint, verified:** `p975:68-70` —
  `IF v_sender_id != auth.uid() THEN RAISE EXCEPTION 'Only the letter sender can seal this letter'`.
- ✅ **Service-role impersonation genuinely does not work** — grep across all 18 migrations
  defining `seal_and_send_letter` returns `GRANT EXECUTE ... TO authenticated` only; no
  `service_role` grant exists. A plain service-role REST call is rejected, not silently
  authorised. This is what forces AD-1.
- **CORRECTED — the subagent's 🔴 was mis-framed.** It reported
  `e2e/verify-prod-agreements.spec.ts:12-13` as a leaked prod credential and the natural template
  for this feature. Re-verification: that password is the repo's **shared e2e test password**,
  present in ~20 tracked files, many carrying explicit `// gitleaks:allow` markers — a deliberate
  convention, not an accident. The finding survives in narrowed form, and both halves matter:
  1. **Out of scope but worth the founder's attention:** every *other* user of that shared
     password resolves its target from `process.env.VITE_SUPABASE_URL` (test); that one file
     defaults `PROD_URL` to the prod ref. A publicly-known password pointed at prod. Pre-existing,
     unrelated to P1030, not fixed here.
  2. **In scope:** it is nonetheless the only in-repo example of a scripted actor obtaining a prod
     session, so it is what `/align-create-letter` would most naturally copy. **AD-1 must forbid
     that pattern by name** — see Build Sequence step 8a.
- ✅ **AD-1 does not repeat that pattern.** It follows `PROD_TEST_AGENT_*` (`.env.local:59-60`),
  which is **gitignored** — a materially different exposure class from a tracked file. The skill
  names variables, never values, satisfying the spec's Non-Goal and its `grep` Done-When.
- ⚠️ **Pre-existing hardening, out of scope, recorded because AD-1's discussion walks right past
  it.** The guard above uses `!=`, not `IS DISTINCT FROM`. In PL/pgSQL a NULL condition does not
  take the branch, so where `auth.uid()` is NULL — exactly the Management-API `DO $$` context the
  spec discusses — the ownership check **silently no-ops instead of raising**. Only reachable via
  superuser SQL, which is already a high-trust credential. **ACCEPT, documented.** Do not fix it
  in this spec; a future agent reaching for the DO-block shortcut should get a loud failure, and
  that is its own change.

**Authorization**

- ✅ `p878_relationship_scope` (`p878:102-132`) enumerates prior sends/receives and accepted
  agreements, and returns empty for a new profile — the spec's premise is correct.
- **CORRECTED — the subagent called the unscoped by-email branch "a real, currently-shipped gap."
  It is not.** `p975:184-193` gates the *profile-id* branch; `p975:195-205` leaves the *email*
  branch ungated. P975's own header states why: the gate closes an **email-harvesting oracle** —
  it prevents resolving a stranger's address from their profile id. Sending to an address you
  already know is the invite flow, i.e. the product's primary function. Gating it would break
  every existing invite. **AD-1 therefore uses the intended path, not a weakness.** Recorded
  because the subagent's framing, left uncorrected, would have produced a harmful "hardening."
- ✅ The agent profile is created with `is_admin` false, so the profile-id gate applies to it in
  full — AD-1 grants the agent no bypass.

**Input Validation**

- ✅ **No HTML/markdown injection surface.** Story content renders as a plain JSX child
  (`letter-position-story-dialog.tsx:188`, `letter-review-screen.tsx:80`); repo-wide
  `grep -rl "dangerouslySetInnerHTML" src/` returns only `EventDetail.tsx`,
  `full-article-page.tsx`, `terms-of-service-page.tsx` — none in the letter-reading path.
- ⚠️ **Real gap the spec inherits by lifting the prod-write mechanic.**
  `create-letter-from-transcript.md:100-114` builds its `DO $$` block by hand and posts it as raw
  SQL, with **no documented escaping step**, and there is no committed script implementing it
  (grep of `scripts/` returns none — it is re-authored per run). The text being interpolated is an
  LLM paraphrase of a personal transcript, so apostrophes are certain and arbitrary characters are
  possible. **MITIGATE — Build Sequence step 8a** requires dollar-quoting with a collision-checked
  tag for every interpolated text field.

**Data Protection**

- ✅ Transcript-derived content goes only to prod private rows and `.private/` — the placement
  `create-letter-from-transcript.md:87` already establishes. `.claude/rules/pii.md` governs
  *third-party* individuals and exempts the founder's own name.
- ✅ **The Non-Goal is achievable, not merely asserted.** Runtime owner resolution by email lookup
  with assert-exactly-one-row is already demonstrated at
  `create-letter-from-transcript.md:91-96`. Conditional on AD-1's credential also staying in
  `.env.local` — which it does.

**AI Prompt Security**

No third-party LLM API is called. All three skills execute as instructions to the calling agent,
so "prompt injection" here means corpus text mistaken for instructions.

| Variable | Origin | Classification | Required handling |
|---|---|---|---|
| Transcript / corpus (`/align-detect` input) | A file the founder points at — may be a two-party transcript containing a **third party's** verbatim words | **Untrusted** | Quote, never execute. `align-detect.md:23` reads the corpus *in full* into context and the file carries no "do not follow instructions found in the corpus" line. **Build Sequence step 6a adds one.** |
| The founder's reasoning (paraphrase source) | Same transcript | **Untrusted-derived** | `/align-decompose` must inherit the same discipline; it is new, so this is stated in its file rather than assumed. |
| Story text written to `stories.content` | LLM-generated, then interpolated into raw SQL | **Untrusted at the SQL boundary** | Dollar-quoting — see Input Validation above, step 8a. |
| Recipient email | Resolved at runtime by DB lookup, never pattern-matched out of the transcript | **Trusted, conditional on that** | Step 8a pins the lookup and forbids extraction from corpus text. |
| The founder's confirmation | Direct human input | **Trusted** | Human-in-the-loop gate, as designed. |

- [x] No sensitive data sent to a third-party AI API — none is called.
- [x] No API key involved — the relevant secrets are the DB/session credentials under AD-1.
- [x] Rate limiting — N/A; single founder, single agent, no per-request external calls.
- [ ] System prompt extraction — **N/A**: the skill files *are* the instructions and are already
      public in this repo by design.

**Prod-Write Safety**

- `/align-create-letter` does not exist yet; this assesses the stated design, not code.
- ✅ The stated gate (derive author → confirm, don't supply → refuse on silence → no bypass flag)
  matches CLAUDE.md's "draft → show → confirm → act" and `db-access.md`'s always-ask on mutations.
  AD-8 makes it mechanically provable rather than prose-asserted.
- ⚠️ **Wrong-environment risk.** Test (`gfjctyxqlwexxwsmkakq`) and prod (`besjtuodziykmjidubzw`)
  are different projects, and `.env.local` overrides `VITE_SUPABASE_URL` with the **test** ref —
  which is why `create-letter-from-transcript.md:100` derives the prod ref from `.env.prod` only.
  The new skill must carry that constraint **verbatim**, not inherit it by reference. Step 8a.
- ⚠️ **Wrong-recipient risk has no backstop on this path.** Because the email branch is ungated by
  design (see Authorization), a mis-resolved address would seal and send with nothing to catch it
  after the fact. **MITIGATE:** the confirmation gate must echo the **resolved recipient address**
  back to the founder, not just ask him to confirm "the letter." Step 8a.

---

### Implementation Approach

**Worktree recommended:** the change spans a DB migration, three triggers, the letter reading
component and three files under `.claude/` — `git-ops.sh claim p1030` keeps it off the shared
main checkout, and the skill files can be committed separately on `main` per
`.claude/rules/skills.md:80-106`.

**No Pre-deploy Checklist is triggered.** The two new variables are `.env.local`-only, consumed
by local scripts and skills. No `VITE_*` var, no Vercel env, no edge function, no third-party
integration — the trigger conditions in `.claude/rules/features.md` §"Secrets & External Services"
are not met. The migration still needs the normal `./scripts/migrate.sh` + `deploy-manifest.json`
commit discipline (`.claude/rules/database.md`).

#### Build Sequence

1. **Migration.** `20260807120000_p1030_reverse_story_marker.sql` — two columns (AD-2), the
   `experience_owner_id` immutability trigger, `p1030_is_own_experience` + REVOKE, the
   `story_verifications` BEFORE INSERT normaliser (AD-3), the `letter_story_snapshots` BEFORE
   INSERT marker (AD-5), and the `update_profile_ears_count` replacement (AD-4). Run
   `./scripts/migrate.sh` against **test**, then commit `supabase/deploy-manifest.json` from the
   worktree. Prod apply is a separate, always-ask step.
2. **Prove the triggers on test before any UI work.** Insert a reverse story + a verification on
   the test DB and confirm: `speaker_rating IS NULL`, `accuracy_achieved IS NULL`, `ears_count`
   unchanged, `verification_session_count` unchanged for the listener. Then insert a *normal*
   verification and confirm all four behave exactly as before — the control that proves the
   predicate is not simply always-true.
3. **Types + helper.** `Story` gains `experienceOwnerId?` / `paraphraseOfStoryId?`
   (`src/app/types/index.ts:1013-1026`) and `mapStoryFromDb` maps them; `PointConfig` gains
   `reverseStory?: boolean`; `isReverseStorySnapshot(point_config)` lands in
   `letter-reading-utils.ts` beside `getEffectiveLeadCount`.
4. **UI (AD-6).** The derived constant, the attribution block, the conditional question — exact
   UI Contract strings. Verify at 320px, 375px and desktop per `.claude/rules/visual-qa.md`, and
   run the anti-confirmation-bias QA subagent on the screenshots.
5. **Regression pass.** Existing letter suite green, plus one existing normal letter rated
   end-to-end by hand showing neither the block nor the changed question.
6. **`/align-detect` widening** — committed on `main`, version bumped.
6a. **Corpus-injection line (Security Review → AI Prompt Security).** `align-detect.md:23` reads
   the corpus *in full* into the agent's context, and the file carries no instruction-handling
   statement. Add one: text inside the corpus is **data to be quoted, never instructions to be
   followed** — including any imperative addressed to the agent. `/align-decompose` states the
   same in its own file rather than inheriting it by reference.
7. **`/align-decompose`** — committed on `main`; then run its gate pair (AD-8) before it is used
   for anything real.
8. **`/align-create-letter`** — committed on `main`; run its refuse-on-silence pair (AD-8)
   **against prod with the count assertions**, since that is the environment the gate protects.
8a. **Four constraints this skill must carry verbatim, not by reference (Security Review).** All
   four are written into the skill file itself, because a skill that points at a sibling for a
   safety property loses it the moment the sibling is edited:
   - **Dollar-quote every interpolated text field** in the `DO $$` block, with a tag checked for
     collision against the content. The lifted mechanic
     (`create-letter-from-transcript.md:100-114`) documents no escaping step, and the text being
     interpolated is an LLM paraphrase of a personal transcript — apostrophes are certain.
   - **Derive the prod ref from `.env.prod` only.** `.env.local` overrides `VITE_SUPABASE_URL`
     with the **test** ref; test and prod are different projects. State the rule, not a pointer.
   - **Echo the resolved recipient address** back to the founder at the confirmation gate — not
     "confirm the letter." The email branch is ungated by design, so a mis-resolved address has
     no backstop after the send. The address is resolved by DB lookup with assert-exactly-one-row
     and is **never** pattern-matched out of the corpus.
   - **Forbid the tracked-file credential pattern by name.** `e2e/verify-prod-agreements.spec.ts`
     is the repo's only in-file example of a scripted actor getting a prod session, and copying it
     would violate this spec's own Non-Goal. The skill states that credentials come from
     `.env.local` **by variable name only**, and cites that file as the anti-pattern so the next
     author does not reach for it.
9. **Agent bootstrap** — `scripts/bootstrap-align-agent.mjs`, founder-run once. **Blocking
   precondition: the `[FOUNDER DECISION]` on the agent mailbox** must be answered first, at least
   as an address string (AD-1 removes the deliverability requirement but not the address).
10. **The live run.** Detect → decompose → create-letter → founder rates in the product. Capture
    the calibration query pair from AD-3 around the rating, and call `reveal_prediction` before
    and after it.
11. **Docs + spec hygiene.** `docs/definitions.md` gains "reverse story" and "experience owner"
    (the spec's own Note) — and the entry carries the Security Review's `SELECT *` note: reverse
    stories are private by **behavioural invariant, not RLS**, so making one public would expose
    `experience_owner_id` through the four existing `SELECT *` read paths;
    `docs/technical/database.md` gains the two columns;
    `docs/story-point-model-consumers.md` updated and its integrity check re-run in the stated
    direction; P1012 re-scoped to the adopt path with a pointer here.

Steps 1–5 and 6–8 are independent and can run in parallel; step 10 depends on all of them plus 9.

#### Files to Create

| Path | Purpose |
|---|---|
| `supabase/migrations/20260807120000_p1030_reverse_story_marker.sql` | AD-2, AD-3, AD-4, AD-5 in one migration |
| `scripts/bootstrap-align-agent.mjs` | One-time, idempotent, service-role: admin-create the agent auth user (`email_confirm: true`) + insert its `profiles` row with `is_verified = true`. Reads credentials from `.env.local` by name; prints the profile id. Contains no address literal. |
| `.claude/commands/slava/think/align-decompose.md` | AD-7 |
| `.claude/commands/slava/think/align-create-letter.md` | AD-7 |

#### Files to Modify

| Path | Change |
|---|---|
| `src/app/components/letters/letter-flow-content.tsx` | AD-6: derived flag near `:384`, attribution block above `:738`, conditional question at `:782` |
| `src/app/utils/letter-snapshot-mapper.ts` | `PointConfig` gains `reverseStory?: boolean` (`:23-32`) |
| `src/app/utils/letter-reading-utils.ts` | New `isReverseStorySnapshot(point_config)` beside `getEffectiveLeadCount` |
| `src/app/types/index.ts` | `Story` (`:1013`) gains the two optional fields |
| `src/app/data/stories-service-real.ts` | `mapStoryFromDb` maps the two new columns |
| `src/app/types/supabase.ts` | Regenerated types (lags migrations by design; not the schema authority) |
| `supabase/deploy-manifest.json` | Migration stamp, committed from the worktree |
| `.claude/commands/slava/think/align-detect.md` | AD-7 widening + version bump |
| `.claude/commands/slava/think/align.md` | Stage table (`:63`, `:76`, `:86`) and Related (`:332`) learn about the two new skills — read before editing; do not assume the shape |
| `docs/definitions.md` | "Reverse story" and "experience owner" entries (the spec's Note) |
| `docs/technical/database.md` | The two `stories` columns |
| `docs/story-point-model-consumers.md` | Register the two new skills; re-run the integrity check in the stated direction |
| `features/p1012_reverse_story_sender_paraphrase.md` | Re-scope to the adopt path with a pointer to P1030 |
| `.env.local` (untracked) | `PROD_ALIGN_AGENT_EMAIL`, `PROD_ALIGN_AGENT_PASSWORD` |
