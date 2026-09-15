---
status: backlog
type: task
disclosure: public
rank: 90
workstream: problem-board
created_date: '2026-08-28'
tags: [visibility, privacy, rls, problem-board]
blocked_by: []
blocks: []
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1181: Community-scoped visibility for stories, points and letters

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

## Done-When

- [ ] The 2026-03-24 cut is read, and this spec states what is different now
- [ ] The default visibility for a submission is decided and recorded
- [ ] Group members can read each other's submissions; non-members cannot, proven by a failing-path test
- [ ] A community problem letter is refused to an anonymous caller on every read path, including the public reader, proven by test
- [ ] A former member loses read access, proven by test; multi-organisation behaviour is decided and tested
- [ ] A signed-in member can export the organisation's problem letters with answer counts; a non-member cannot

## Related

- `docs/decisions.md` 2026-08-28 [product] — spec (ii) of three
- `docs/definitions.md` §Story Visibility Model, §Clarity Organization
- **Blocks the first event** and P1182's member-only mode; gives P1320 its community audience. Track A in
  [docs/problem-board-process.md](../docs/problem-board-process.md), rewritten 2026-09-15.
