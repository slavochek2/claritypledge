---
status: qa
type: task
disclosure: public
rank: 90
workstream: problem-board
created_date: '2026-08-28'
tags: [visibility, privacy, rls, problem-board]
blocked_by: []
blocks: []
delivery_stage: park
pipeline_ran: [create-spec, dev, park]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1181: Community-scoped visibility for stories, points and letters

> **Parked 2026-09-21 (founder).** Built and passing its closure gate on branch `feature/p1181-community-scoped-letters`; the worktree is removed, the branch is kept. Not shipped because nothing uses it yet and it rewrites 17 letter functions. **Ship trigger:** the first pilot organization that wants to write letters visible only inside the org. Ship with `/ship p1181`.

## Problem

**Situation:** Story visibility is **Private or Public only**. A `shared` level existed and was **deliberately cut on 2026-03-24** as imprecise, and visibility is immutable after creation (`docs/definitions.md` §Story Visibility Model).

**Complication:** A closed community whose members submit real problems needs exactly the level that was removed — visible to the group, not to the world. Candour is the entire reason the group is closed. P1180 sidesteps this by filing a private letter to one named person, which works for a two-person round and not beyond it.

**Question:** What does "shared with this group" mean, precisely enough to implement — and does re-adding it reintroduce the imprecision that got it cut?

## Appetite

**Blast radius: high** — touches who can see what, across stories, points and letters, and the letter seal and reading paths. **Reversibility: low** — a visibility level, once used, has rows depending on it. **Decision density: several** — the default audience, leave semantics, multi-organisation membership, and naming. *(Until 2026-09-15 this line read "none of them are answerable before P1180 runs"; the problem board's journey now supplies the requirement.)*

## Solution

~~**Not yet specified, deliberately.** The requirements are what round one produces.~~ *Superseded 2026-09-15 by the amendment below — the requirement now comes from the problem board's own journey rather than from a round.*

What is known: the **Clarity Organization** container already exists with a join gate and a `community` type, and community feeds were already contemplated for it. That is the likely anchor, not a new concept.

> **AMENDED 2026-09-15 — scope narrowed, sequencing moved earlier, and what the cut must own.** The problem
> board's unit became one current problem per member per week (P1319), read by other members at a live event.
> Most members will not post a current problem publicly. So this spec is **a hard prerequisite for the first
> event**, not a follow-on to the matcher.
>
> **Scope for that event: problem letters only, inside one organisation container** — Open Question 1's
> container-scoped option ("private but scoped to the whole organization"), not a story-level enum change.
> Founder framing, verbatim: *"We want the scope towards community members … private means one-to-one, but
> we know who is the group."* Generalising to all stories and points is out of scope for that cut.
>
> **A visibility label alone cannot deliver it** — verified 2026-09-15 against the migrations:
> `seal_and_send_letter` snapshots a story only when the letter is `one-to-one` or the story is public
> (`supabase/migrations/20260904120000_p1212_seal_rpc_story_author_name.sql`), and
> `get_letter_for_public_reading` returns any sealed `one-to-many` letter to an anonymous caller with no
> membership condition (`supabase/migrations/20260530161011_p852_public_reading_sender_avatar.sql`). The
> first-event cut must therefore own:
>
> 1. a durable link from a problem letter to its organisation;
> 2. seal eligibility for organisation-private stories in that letter;
> 3. reading restricted to signed-in members of that organisation;
> 4. anonymous and non-member denial for those letters on every read path, including the public reader;
> 5. what happens when a member leaves, or belongs to two organisations;
> 6. the member-only export P1182 reads, carrying each problem's answer count at export time.

## Open Questions — recorded 2026-08-28, none resolved

**1. Can we reuse `private` and widen it to mean "the member and their community", instead of adding a third level?**

Attractive because it avoids new interface language. **Measured against the code, it is the dangerous option:** `private` is referenced **47 times across `src/app/`**, and **66 files** touch visibility. Widening what an existing value *means* silently reclassifies every row already stored under it — every existing private story would become community-visible the moment its author belongs to an organisation. That is a privacy regression on data people wrote under a different promise, and it trips the standing rule about altering the meaning of a shared value before enumerating what reads it.

**A third option nobody has costed — and the one worth thinking about first:** leave `private` alone and scope sharing at the **container**, not the record. A story stays `private`; what changes is *whose* privacy it is — the member's alone, or the member's **organisation**. Founder framing: *"private but scoped to the whole organization."* Attractive because it touches no story-level enum, so the 47 references and 66 files stay as they are, and the interface may need no third state at all — a member's own private and their organisation's private can render identically to them, because in both cases the answer to *"can anyone outside see this?"* is no. **What would have to be true:** membership is unambiguous at read time (the organisation container already has a join gate), and the boundary is the organisation rather than an ad-hoc group. **What would break it:** a member in two organisations, or one who leaves — does the story follow them, stay, or vanish? Nobody has worked that through. **Unassessed, and the cheapest of the three to assess first.**

**2. Is the name wrong even if the mechanism is right?** Founder framing: *"it's kind of private, but shared with all the members. Can it be said so or not?"* A level that reads as private and behaves as group-visible is the imprecision that got `shared` cut in the first place.

**3. Can this be backend-only?** Almost certainly not, and this is the part most likely to be underestimated. The interface already carries visual language for the existing levels — a colour for private points, icons distinguishing them from public. A third state that renders identically to private is worse than no third state: people calibrate what they reveal from what they see, and this whole surface exists so members can be candid. **Minimum frontend is not zero.** What the minimum actually is — one badge, or a full pass across every surface that renders a point or story — is unscoped.

**4. Scope reality.** Founder: *"that thing is a bit big, it seems."* Agreed, and the 66-file figure is why. Whatever lands here should be sized against option 1's third path before assuming an enum change.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Re-adds the imprecision that got `shared` cut in 2026-03-24 | MITIGATE | Read that decision first and state explicitly what is different this time |
| Visibility is immutable after creation — a wrong default is unfixable per row | MITIGATE | Decide the default before any row is written |
| Touches RLS and the seal/read RPCs, the repo's most incident-prone area | MITIGATE | Architecture review and tests before implementation |
| A community letter becomes readable through the public reader | MITIGATE | Amendment item 4; failing-path test on the public read path |

**Non-Goals**
- ~~Do NOT design this before P1180 has run. The requirements are its output.~~ *Superseded 2026-09-15 — see the amendment in Solution.*
- Do NOT reuse the name `shared` without saying what it now means.
- Do NOT generalise beyond problem letters in one organisation container for the first-event cut.

## Technical Architecture

### Technical Analysis

Verified against the migrations and `src/` on 2026-09-15, before any code was written:

- **The audience has to sit on the letter, not the story.** `private` is referenced 47 times across
  `src/app/` and 66 files touch visibility; widening what it *means* reclassifies rows written under
  a different promise. Open Question 1's third path — scope at the container — is what was built.
- **One-to-many letters are a capability URL today.** `get_letter_for_public_reading` serves any
  sealed one-to-many letter to an anonymous caller, and any signed-in caller can mint their own
  delivery through `create_letter_delivery_on_open`, after which RLS treats them as a receiver.
- **`_is_letter_receiver` is the single RLS choke point** — `clarity_letters`,
  `letter_story_snapshots` and `letter_predictions` all admit receivers through it, as does
  `_is_letter_participant` (explain-backs, `get_letter_position_stories`).
- **A delivery, and its invitation token, outlive membership.** So access must be evaluated at read
  time on every path; nothing can be stamped on a row at delivery time.

### Architecture Decisions

1. **`clarity_letters.org_id`** (nullable FK → `organization`, `ON DELETE RESTRICT`, CHECK
   `org_id IS NULL OR mode = 'one-to-many'`). NULL keeps today's meaning for every existing row, so
   nothing is reclassified. **RESTRICT, never SET NULL** — clearing the column would turn a
   community letter into a public link letter.
2. **One predicate, `_letter_audience_admits(letter, user)`**, called from every read path. TRUE for
   every letter with `org_id IS NULL`. Not executable by `anon` or `authenticated`; it is reached
   only from SECURITY DEFINER functions, so it cannot be used to ask about another user's
   memberships (the P1150 lesson).
3. **Leave semantics — fail closed, both directions.** A reader who leaves loses the letter
   immediately, on every path including their old token. An author who leaves takes the letter out
   of the group's reach while keeping their own access. Rejoining restores access with no repair
   step, because membership is read at query time.
4. **Multi-organisation:** a letter is addressed to exactly ONE organisation. Membership elsewhere
   grants nothing; belonging to two organisations means choosing which one at send time.
5. **Default audience for a problem submission is the member's community**, per the 2026-09-15
   amendment ("presses send **to their community**"). The letter-level default stays NULL so that
   ordinary letters are untouched; the review page (P1320) is what sets `org_id`.
6. **An answer is a completed delivery by a non-sender who is a current member.** Counting only
   current members is what stops the deferred write paths below from inflating the count.
7. **Seal eligibility:** a letter addressed to an organisation may only be sealed by a current
   member, snapshots private stories (the point of the cut), and takes no named recipients.

**What is different from the 2026-03-24 cut:** that decision removed a *story-level* tier meaning
"all event co-participants" — an audience nobody could enumerate, on a field that cascaded when
visibility changed. This is an audience on the *letter*, bounded by a named organisation whose
membership row is an explicit acceptance record, resolved at read time. `stories.visibility` is
untouched and still immutable. The cut's own rejected alternative (C) said "letters do it better";
this is that alternative.

### Security Review

Gated read paths (census of every function whose latest body reads a letter table): RLS via
`_is_letter_receiver`; `get_letter_for_public_reading`; `resolve_letter_shortcode`;
`create_letter_delivery_on_open`; `create_letter_delivery`; `get_letter_for_reading`;
`get_letter_by_token`; `get_letter_point_responses_by_token`; `reveal_prediction_by_token`;
`submit_point_response_by_token`; `submit_rating_by_token`; `update_delivery_status_by_token`;
`get_inbox_items` (receiver branch); `get_letter_results` (receiver branch).

Unchanged, with reasons: `get_letter_overview` and `get_deliveries_with_progress` are sender-only;
`claim_letter_delivery` returns no content and every read after it is gated.

**That census was incomplete, and an independent review caught it (part B,
`20260916100000_p1181_b_child_tables_and_named_recipients.sql`).** Three tables carry their **own**
SELECT policies keyed directly on `receiver_profile_id = auth.uid()` / `listener_id = auth.uid()`,
so nothing about them routes through `_is_letter_receiver` and the gate could never have reached
them: `letter_deliveries`, `letter_point_responses`, and the letter arm of `story_verifications`. A
former member kept indefinite read access to their own delivery row, their own point answers and
their own letter rating — their own content, not another member's, but a straight contradiction of
what part A promised. Fixed by two caller-scoped wrappers (an RLS policy runs under the caller's
rights, so it cannot call the internal predicate directly) that answer only about `auth.uid()`.

**Why the census missed it:** it was built by grepping `CREATE POLICY`. The current
`story_verifications` policy is an **`ALTER POLICY`**, which that grep cannot see. The same review
also found that `add_recipient_to_sealed_letter` could add a named recipient to an organisation
letter *after* sealing, defeating Decision 7's write-side invariant at the only point it was
enforced; part B refuses it there too.

**Known limitation:** the SD-guard canary pins functions, not policies, so the three policy gates
have no equivalent regression pin. The integration test is their only guard.

**DEFER — write paths by a non-member.** `p1150_letter_rating_admissible`, `replay_letter_positions`
and the `confirm-letter-response` / `request-letter-response-signin` edge functions are not gated.
They return no letter content, and reaching them requires story and point ids the caller can only
have obtained while they *could* read the letter. The consequence is a stray answer visible to the
author, not a disclosure; decision 6 keeps it out of the export count. Revisit if the first event
shows it happening.

Each gate is pinned in `src/tests/sd-guard-completeness.test.ts` (`CRITICAL_PREDICATES`), so a later
`CREATE OR REPLACE` from a stale base fails the canary instead of silently reopening a path — the
P952 regression class this repo has hit repeatedly on exactly these functions.

**The pin did not work when first written, and this branch fixes the cause.** The canary matched
`AS $$` literally, so any function dollar-quoted with a named tag (`AS $function$`, how a body copied
out of `pg_get_functiondef` reads) was skipped **entirely** — no RAISE guard, token or predicate from
it was ever checked. Three functions gated here are that shape. Exercising the failure path is what
found it: a staged migration redefining `get_letter_for_reading` from a stale base, gate deleted,
left the canary green. The scanner now terminates on the tag it opened with. Evidence: the same
staged regression now exits 1 for a `$function$` body and for a `$$` body, and the clean tree still
passes — so the widened coverage surfaced no pre-existing drops.

This blind spot was **not** introduced by P1181; it has been masking those functions since their
current definitions landed (P1067, P1071).

## Done-When

- [x] The 2026-03-24 cut is read, and this spec states what is different now — Architecture Decisions,
      "What is different from the 2026-03-24 cut"
- [x] The default visibility for a submission is decided and recorded — Architecture Decision 5
- [x] Group members can read each other's submissions; non-members cannot, proven by a failing-path test —
      `p1181-org-scoped-letters.spec.ts`: the public reader and the RLS test both refuse a member of a
      different organisation while admitting a current member
- [x] A community problem letter is refused to an anonymous caller on every read path, including the public
      reader, proven by test — anonymous on the public reader, and on `get_letter_for_reading`,
      `get_letter_by_token`, `get_letter_point_responses_by_token`, `reveal_prediction_by_token`
- [x] A former member loses read access, proven by test; multi-organisation behaviour is decided and tested —
      the leaver loses the public reader, RLS, both token reads, the inbox, results and answering, and
      rejoining restores access; the non-member is a member of a second organisation (Decision 4)
- [x] A signed-in member can export the organisation's problem letters with answer counts; a non-member cannot —
      export test: member gets the letter with `answer_count: 1`, non-member and anonymous are refused

**Evidence:** `npx playwright test --project=integration e2e/integration/p1181-org-scoped-letters.spec.ts`
→ **16 passed** (part A + the three child-table assertions and the write-path control added by part B).
Full unit suite → **400 files passed, 2 skipped**. Pre-migration run of the same file failed on
`Could not find the 'org_id' column`, so the suite was watched failing before it passed.

**Verbatim-copy proof.** Each of the 15 redefined bodies was generated by copying its latest
definition and applying exact-match patches, and was then checked in the other direction: applying
the patches in reverse yields a body **byte-identical** to its source migration, 15 of 15. That is
the P952 class closed by construction rather than by reading.

**Regression sweep, and what it found that is NOT this branch.** The full integration project was run
(1171 passed / 115 failed / 47 flaky), then the letter-adjacent specs were re-run serially on a quiet
database to separate contention from defects. Most failures were shared-fixture contention: 83
`Request rate limit reached` sign-ins, and fixture collapse downstream of them (`p770`'s three
failures insert a letter whose `sender_id` is null because the test user was never created). Three
classes are **pre-existing** and predate this branch:

- `get_inbox_items(p_user_id)` — three specs still call the one-argument form that P699 dropped in
  April (`20260413110000`) and p1066 dropped again in August. PGRST202 ever since.
- `p684`'s "does NOT return predictions" — the public reader has returned predictions since
  `123edc932` (2026-04-12); the spec dates to the same day and asserts their absence.
- `p581` sealed-bid's "anonymous CANNOT query predictions" — the policy calls `_is_letter_sender`,
  revoked from `anon` by p651 in April, so an anonymous caller gets 42501 rather than an empty set.

`p684`'s two "authenticated caller succeeds" write tests also fail, and this branch is **not** the
mechanism: the gate can only refuse when `org_id IS NOT NULL`, and a control in this spec's own suite
proves an authenticated member still writes and updates status through the token path on an ordinary
public link letter. Their actual cause is unestablished — worth a `/fix`, not a claim here.

## Related

- `docs/decisions.md` 2026-08-28 [product] — spec (ii) of three
- `docs/definitions.md` §Story Visibility Model, §Clarity Organization
- **Blocks the first event** and P1182's member-only mode; gives P1320 its community audience. Track A in
  [docs/problem-board-process.md](../docs/problem-board-process.md), rewritten 2026-09-15.
