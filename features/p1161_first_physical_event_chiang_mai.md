---
status: week
type: task
rank: 70
workstream: gtm
created_date: '2026-08-26'
tags: [events, disagreement-pipeline, cmp, chiang-mai]
delivery_stage: create-spec
pipeline_ran: [create-spec, challenge-prd]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1161: The first physical Clarity event in Chiang Mai — end to end

> **Revised 2026-08-26 after `/challenge-prd` (6 BLOCK, 7 WARN; every finding re-verified by command
> before being applied).** Five of six BLOCKs were the same defect — a real file cited for a
> conclusion it does not support. Corrections are inline, not appended.

## Problem

**Situation:** The instrument ([p1055](p1055_norm_measurement_instrument.md)), the Disagreement
Pipeline ([p1156](done/2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md)) and the
event-publishing skills exist. **Zero events have been run. The Clarity Practice Community · Chiang
Mai has one member — the founder.**

**Complication:** The documented offline configuration says *the room brings the topic*, which cannot
work before a community exists to propose or vote. No topic has ever gone end-to-end through the
Disagreement Pipeline, so its final stage — filing to a database — has never executed once. Neither
has the in-room stake flow, by anyone other than the founder.

**Question:** What is the exact sequence that produces event #1, and what must be built before it can
run?

> Founder framing, verbatim: *"forum is probably version two. Version one, we cannot run a forum if
> we didn't optimize for infrastructure so people can vote and then we can create it on any topic
> very, very fast. But we didn't. We need to run it."*

> On the closing ask: *"For the R and D, I think the ask is join the community. That's it. And I want
> the community to grow locally."*

> On pre-work: *"who invests 20 min at moment of rvsp ? nobody?"*

> On the portrait rule: *"i never want ot rjeect a perosn based on profile photo - this make s no
> snese at all"*

## Appetite

**Blast radius: high, and outward-facing.** It publishes verbatim quotes from named real people under
machine accounts holding positions those people never took, then puts the founder in a room with
strangers. **Reversibility: rows delete; publication does not.** **Decision density: high.**

## Invariants

- **No person is ever rejected from the pipeline for lacking a rights-cleared photograph.** A subject
  with no cleared photo gets no avatar; the product's existing initials fallback carries the identity,
  verified in `gravatar-avatar.tsx` at the time — the account still renders *"square, drained,
  unringed and operator-named"* ([decisions.md](../docs/decisions.md) 2026-08-21). The Gate 1
  rejection at `select.md:67-68` is an explicit **founder decision of 2026-08-25**, taken
  *"for v1"* with its cause named — provisioning has no initials branch, so the approval would die at
  the last step. **D2 reverses that founder call; it is not merely filling a gap** — and the
  reversal was taken deliberately by the founder on **2026-08-26**, with D5 acknowledged as
  separate, still-required work rather than a side effect of D2.
- **Two separate frozen things, previously fused — do not re-merge them.** (a) The **avatar
  generator's** slate palette and amber accent are load-bearing and frozen in `gen-agent-avatar`
  ([decisions.md](../docs/decisions.md) **2026-08-19**, not 08-25) — *"a disclosure mechanism can be
  defeated by its own styling."* That same entry **rejects** greying the avatar as a disclosure
  device, falsified by a real user's photo measuring blacker than any robot. (b) The profile's
  **`avatar_color`** field must be a desaturated slate `#39424B`, never the `#0044CC` default
  (`provision-agent.md:120-126`, `:193` — found 2026-08-24 on a hand-seeded account). An
  initials-only account is governed by (b), not (a).
- **The instrument's ordering holds:** dimensions staked before the argument, triad adjacent to the
  offer, reveal after both ([p1055](p1055_norm_measurement_instrument.md) — "load-bearing, do not
  reorder"). Nothing here may move staking to after the event; a movement metric with no before is
  not a movement metric.
- **Filing to test and filing to production are two separate deliberate invocations.** Never one.

## Solution

Run event #1 as a **founder-picked-topic** event. The open forum (room proposes and votes on the
night) is explicitly v2 and out of scope.

### Which reading of "what the room argues" this spec takes

The docs disagree, and the disagreement is load-bearing for how the re-stake is interpreted.
`p1055:55` says *"the dimensions are what the room argues about"*; `clarity-practice-event.md:106`
agrees (*"the proposed process is the object"*); `:113` and `goals.md:15` say the opposite — the event
*"never argues our own method."*

**This spec takes the external-topic reading:** the room argues the *topic*, and the dimensions are
staked before it so there is a prior to move. **Consequence, stated rather than hidden:** the
mechanism by which arguing an external topic moves a dimension like *"I would expect less rework"* is
not established anywhere. Treat step 7's re-stake as exploratory on this first run, and do not report
dimension movement as evidence about the instrument until that mechanism is named.

### The sequence

0. **Run the rename (D4) first.** All five stages into one namespace, every stage carrying the
   prefix. Lands before step 1, on its own, with nothing else in flight. **Reordered by founder
   decision 2026-08-27** — see D4.
1. **Topic sourcing + signal check.** Candidate list from the founder's own interests (YouTube
   history) and the Chiang Mai audience's revealed interests (Beeper — the AI group, "Questions That
   Matter", 4C's). Score every candidate against the documented topic gate (care / disagree / fuzzy —
   `clarity-forum.md:71-82`). Output: a ranked candidate backlog and one chosen topic. **Runs first,
   in a fresh session.**
2. **Run the Disagreement Pipeline** on the chosen topic (select → prepare → positions → story →
   publish), by hand. `/slava:disagreement:run` stays deferred until this run completes
   ([p1156](done/2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md) decision 2d).
3. **File to TEST**, review the rendered feed against a stated criterion, then **file to PROD** as a
   second invocation.
4. **Publish and promote the event.** Link the published points feed in the listing as *"here's what
   we'll argue"* — **promotion, zero obligation, no staking asked for.**
5. **Run the event**, ~90 min: opening question → `/ready` → `/meet` opt-in → understanding question →
   stake `cmp7` → **host frames the two positions in ~3 min** → fishbowl argument → re-stake what
   moved → stake `cmp3` → reveal → the ask.
6. **Close:** free community join is the single spoken CTA — the sayable link is **`/org/cm/join`**.
   Then a **paper shortlist, show of hands** for the next event's topic, feeding the backlog.

### Deviations from the written docs — five, not two

1. **A host framing block replaces in-room story reading.** Reading three stories and staking six
   topic positions is 10–15 unbudgeted minutes in a schedule that already holds ten blocks
   (`clarity-practice-event.md:99-110`). The founder's resolution: topic material can be
   pre-published because people are interested in the topic; the instrument cannot, because *"the cmp
   and cmp7 and cmp3 etc.. this is genuinly part of the event."* Requiring ~20 min of RSVP prep for a
   free event fails, and partial completion is worse than none. **Verified compatible with the
   ordering invariant:** the insert sits between staking `cmp7` and the argument, so no block moves.
2. **The closing ask is the community join — replacing the bracelet, not €295.** *(Corrected: an
   earlier draft of this spec mis-read the column.)* `clarity-practice-event.md:18` gives the
   **offline** CTA as *"A bracelet. Nothing paid."* — already free. The €295 line at `:127` is
   unqualified by configuration and therefore **contradicts `:18` inside the same file.** That
   pre-existing internal contradiction must be surfaced and resolved by the amendment, not inherited.
3. **Topic source.** `goals.md:15` says offline is *"the room brings the topic, which is what makes it
   a forum."* Event #1 deviates by necessity (no community to propose). Routed to the amendment gate.
4. **The bracelet is absent — FOUNDER DECISION 2026-08-26: not offered at event #1.** It is the
   documented offline CTA, the panel entry condition (`clarity-forum.md:129-131`) and a headline
   metric (`:8`, *"bracelets carried in the wild"*). Event #1 runs no gated panel round, so the
   entry-condition role does not apply, and the join stays the single spoken CTA. **Three
   consequences, stated rather than hidden:** the North Star metric gets no first datapoint from
   event #1; the amendment must record the offline CTA as the community join, which is also what
   resolves the `:18` vs `:127` contradiction; and **no record exists anywhere in this repo of
   physical bracelets having been sourced** (grepped across `docs/`, `features/`, `.claude/`,
   `.private/` on 2026-08-26 — design and metric references only), so procurement is an unowned
   dependency before *any* event can offer one.
5. **The bell is absent.** Block 6's mechanic (`clarity-practice-event.md:119`,
   `facilitator-guide.md` § "The bell"). Reinstate it in step 5 or record why not.

### Dependencies — each becomes its own spec

| # | What | Why it blocks | Scope |
|---|---|---|---|
| **D1** | **Seed input for the selector.** Optional person and/or video; the proposal step branches so a supplied side is accepted rather than proposed; Gate 1 approves only the counterpart. | The selector takes only a topic string and a room (`select.md:18-23`); Gate 1 halts for approval and cannot inject (`:72-73`). | One skill file |
| **D2** | **Initials fallback in agent provisioning**, and removal of the Gate 1 portrait rejection. | Blocks any pseudonymous arguer — which killed a real run on 2026-08-21. | **≥2 skill files** — the branch in `provision-agent`, the rejection in `select.md:67-68`. `avatar_color` is already specified at `provision-agent.md:193`; do not re-specify it. **Reverses a 2026-08-25 founder decision — CONFIRMED by the founder 2026-08-26, build it.** The provisioning change is larger than one branch: `provision-agent.md:189-191` hard-requires an uploaded avatar asserted `200` + `content-type: image/*` in its own quality gates, so the initials path needs an explicit exemption there, not only in the write sequence. |
| **D3** | **Topic sourcing.** Interest corpus + candidate backlog + the scoring pass. | Step 1 has no home and no repeatable method. | Small spec |
| **D4** ✅ | **SHIPPED 2026-08-27 as [P1165](done/2026-06-10/p1165_disagreement_pipeline_namespace_rename.md).** **Disagreement Pipeline rename** → one namespace, every stage carrying the prefix: `disagreement:select\|prepare\|positions\|story\|publish`. | **FOUNDER DECISION 2026-08-27: approved, and it runs FIRST — before the event, before the topic run.** The founder's reasoning: the stages are one pipeline and must read as one pipeline; splitting the naming *"doesn't make sense."* An earlier draft of this spec made deferral a Non-Goal — **that was the spec author's judgement, never a founder decision, and it is reversed here.** | Five stages, and **`points-*` matches only three** — `positions-create` and `story-create` must be named explicitly; `story*` over-matches four unrelated siblings (`story-gate`, `story-to-image`, `sifter-story`). Measured 2026-08-27: 15–33 referencing files per stage name. **Also touches `CLAUDE.md`'s namespace list**, so it goes through the CLAUDE.md gate. |
| **D5** | **`/slava:disagreement:publish` must distinguish a deliberate avatar absence from an accidental one.** | `publish.md:39` is a **hard STOP**: assert `200` + `content-type: image/*`. An initials-only agent halts at publication. Flagged as open in [decisions.md](../docs/decisions.md) 2026-08-21: *"a deliberate absence must be distinguishable from an accidental one, and currently is not."* **D2 clears selection; it does not clear publication.** | One skill file |
| **D6** | **Photographer attribution surface.** | [decisions.md](../docs/decisions.md) 2026-08-21: cleared photos are share-alike with *"attribution required, and the product has no surface that credits a photographer — contained on test, **a blocker before any public run**."* Step 3 files to PROD. | Routed to the story/image component work, not the pipeline |
| **D7** | **Walk the in-room stake flow end-to-end with a non-founder account.** | [p1055](p1055_norm_measurement_instrument.md):169 — *"the path from 'logged in' to 'position staked' has never been walked by a non-founder... walk it end-to-end before event #1. **This is the failure that costs the room, not the schema.**"* Its `:206` Done-When box is unchecked, and P1161 **is** event #1. **The exact path is now traced — see "What D7 actually walks" below.** | Highest-consequence item in this spec |

### What D7 actually walks — traced by command 2026-08-26

The path is four hops, and **the last one is gated on a server signal a room cannot fake**:

1. `point_positions` INSERT is `auth.uid() = user_id AND EXISTS (… profiles WHERE id = auth.uid()
   AND is_verified = true)` — `20260325120000_p586_visibility_privacy_foundation.sql:308-313`.
   **Staking requires a verified profile.** An unverified attendee's write is refused by RLS, and on
   the letter surface that refusal is *deliberately swallowed* (`api.ts:775-789`, P705/P1093) — so
   the room's failure mode is silence, not an error message.
2. `is_verified` is **not client-writable.** `guard_profile_trust_columns()` pins it to `false` on
   any INSERT and to its prior value on any UPDATE whenever `current_user` is `anon` or
   `authenticated` (`20260605120000_p880_trust_column_guard.sql:60-80`). No client path sets it.
3. The only way up is `mark_self_verified()`, which sets it **only when
   `auth.users.email_confirmed_at IS NOT NULL`** — the un-fakeable server signal (same file, header
   ¶ "mark_self_verified"). It is called from `AuthCallbackPage.tsx:506`, after the callback.
4. So the attendee must reach the auth callback before they can stake, by one of exactly two routes
   offered in the product: **magic link** (`api.ts:369`, `:448` — `signInWithOtp`, an email
   round-trip) or **Google OAuth** (`api.ts:501-503`).

**The consequence for the room, stated plainly:** the magic-link route puts an *email round-trip in
the middle of block 5* — venue wifi, phone inboxes, spam folders, ten people at once — before a
single dimension can be staked. The Google route has no round-trip. **Whether Google OAuth actually
lands `email_confirmed_at` (and therefore clears `mark_self_verified`) is UNVERIFIED — it has not
been tested this session and no test covers it** (see below). D7 must test the route the room will
actually use, and the room should be routed deliberately rather than left to choose.

**Why the green e2e suite is not evidence here** (epistemic gate 7b). Every position-staking test
starts from an account that skipped both gates: `e2e/helpers/test-user.ts:171` passes
`email_confirm: true` to `auth.admin.createUser` — its own comment reads *"Skip email
verification!"* — and `:225` writes `is_verified: true` directly through `service_role`, which
`guard_profile_trust_columns()` lets through by design. **The signup → email → callback →
`mark_self_verified` → stake sequence is structurally unreachable by any test in the suite**, so no
number of passing specs says anything about it. This is the gap D7 exists to close, and it is wider
than "nobody has tried it".

**Therefore D7 has a prerequisite the spec did not name:** a real inbox or a real Google account that
is not the founder's. It cannot be satisfied by a test fixture.

**Hops 1 and 2 were walked on TEST, logged out, 2026-08-26** (dev server on `:5001` against
`gfjctyxqlwexxwsmkakq`, isolated browser context — no account created):

- All seven `cmp7` Points render at **`/feed/cmp7`**, which redirects to
  `/feed?tag=cmp7&sort=oldest&version=latest` (`App.tsx:143-146`) — **this is the room's URL**, and
  the oldest-first ordering the instrument requires is applied by the redirect, so nobody has to type
  a sort param. All ten `cmp10` Points confirmed present on test (7 × `cmp7`, 3 × `cmp3`).
- Tapping a position while logged out shows an inline *"Sign up or log in to save your position"*,
  and P458's forwarding works: the link carries `action=set-position`, the `pointId`, the chosen
  `position`, and a `redirect` back to the filtered feed.
- The login screen offers **"Continue with Google" as the primary button**, with magic link second.
  The no-email-round-trip route is already the default the room will see.

**Observed, not hypothesized — the silent-stake problem is real on this surface.** The tapped button
renders `[pressed]` — visually selected, indistinguishable from a saved position — while nothing has
been written; only a small line of text below the card says otherwise, and it appears **only on the
card that was tapped**. An attendee can tap all seven, see seven selected buttons, and have staked
nothing. **This is a room-facing defect, not a D7 test artifact.** Fix or explicitly host-manage it
before block 5; it is the mechanism by which "the stake flow stalls live" actually costs the room.

**Hops 3 and 4 are NOT walked, and an agent may not walk them** — completing them means creating a
real account, which the operating rules reserve to the founder. The runbook is below; it is the
whole of what D7 still needs.

### D7 runbook — what the founder runs (≈5 minutes, TEST)

Everything up to this point is verified. This is the remainder.

1. `npm run dev` (test DB, `:5001`), then open `http://localhost:5001/feed/cmp7` in a **private
   window** — a logged-in founder session invalidates the walk.
2. Tap a position on the first Point. Follow *"Sign up or log in to save your position"*.
3. Sign in as **someone who is not the founder** — either **Continue with Google** with a
   non-founder Google account, or the magic link sent to a mailbox that is not the founder's
   (`ops@` is readable from this repo via `scripts/read-ops-email.mjs`).
4. **Watch what happens on return.** Two things to observe, both load-bearing: whether the callback
   completes without a `mark_self_verified failed` warning in the console (it is caught and logged
   non-fatally at `AuthCallbackPage.tsx:507`, so a failure is silent in the UI), and whether the
   position tapped in step 2 is actually applied on return or silently dropped.
5. Stake the remaining six, then `/feed/cmp3` for the triad.
6. Tell the agent when done — the DB side is verifiable from here: `profiles.is_verified` for the
   new account, and ten `point_positions` rows under its `user_id` with **no `service_role` write
   anywhere in the sequence**. That query is what ticks the Done-When box and p1055's `:206`.

**If step 4 shows a `mark_self_verified` failure, or step 6 finds no rows, D7 has found the failure
p1055 predicted** — and it has been found in a private window rather than in the room.

### Storage split

- **Public** (this repo): topic backlog, event program, all amendments.
- **Private** (`.private/`): the founder-interest corpus — the **derived candidate list**, never raw
  scrapes of identifiable people's messages.

## Alternatives Considered

- **Run the open forum for event #1.** Rejected: no community to propose or vote, and no
  submission/upvote surface exists — out of scope in
  [p1156](done/2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md).
- **Collect all ten instrument statements after the event by link.** Rejected: no before means no
  movement metric, and the reveal would land in an empty room after the ask was already made.
- **Ask attendees to read stories and stake topic positions at RSVP.** Rejected by the founder on
  motivation grounds.
- **Use the already-prepared effective-altruism run**
  (`.private/points-runs/ea-pair-chiangmai-2026-08-21.md`). **Held as fallback, with its true cost
  corrected.** It has six points, three arguers, a sealed prediction and story drafts — but its quotes
  are **caption-sourced and unchecked against audio** (`:90` *"AUDIO CHECK NOT RUN... This is the
  remaining gate before publication"*), it carries **no Gate 1/Gate 2 approvals block and no
  `.approvals.sha256` seal** (`points-process.md:78` requires the selector to write one), and its
  third arguer is `internal:johntheduncan` — the pseudonymous subject from the 2026-08-21 incident.
  **So it needs selection re-run, not a schema conversion, and it is blocked on D2 and D5 too.** Its
  room-fit argument remains the strongest on record.
- **Generate avatars from any photograph, treating the generator as a copyright shield.** Rejected:
  feeding an unlicensed photo to a generator is still a use of it, and the larger exposure — a
  synthetic likeness of a real named person attached to positions they never took — is not reduced by
  generating rather than licensing. The initials fallback removes both.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The in-room stake flow stalls live for non-founder accounts | MITIGATE | D7. p1055 names this as the failure that costs the room |
| **Attendees sign in by magic link and the room stalls on an email round-trip** before anyone can stake | MITIGATE | Traced above: `is_verified` gates the stake, and only the auth callback can set it. Route the room to Google sign-in, or get accounts verified at RSVP rather than in block 5. **The RSVP path is the real mitigation** — `event_rsvps` requires auth, so a registrant who RSVP'd has already been through the callback; walk-ins have not |
| **The stake fails silently** rather than showing an error | MITIGATE | The letter surface swallows the RLS refusal by design (P705/P1093). D7 must confirm what the *feed/point-detail* surface does when an unverified user stakes — an attendee who sees nothing happen will assume they staked |
| Chosen topic passes care+fuzzy but the room does not actually disagree | MITIGATE | The pipeline's kill rule requires a real camp per counter-position; the signal check scores disagreement before committing |
| A chosen arguer has no rights-cleared photo | MITIGATE | D2 + D5 |
| Publication halts on the avatar precondition | MITIGATE | D5 |
| Share-alike photo used publicly with no credit surface | MITIGATE | D6 — named as a blocker before any public run |
| Nobody reads the pre-published feed | ACCEPT | The host framing block makes the room runnable regardless |
| Attendance too low to produce signal | ACCEPT | Event #1's job is one sale and first observations, not throughput |
| The event-publishing orchestrator ([p1160](p1160_events_pipeline_orchestrator_and_process_doc.md)) is `status: in-progress`, mid-`/dev`, with six unchecked Done-When | ACCEPT | The 14 `events/` skills exist, so step 4's promote surface is real; run the stages by hand if the orchestrator is not shipped by then |
| Dimension movement is reported as evidence about the instrument | MITIGATE | See "which reading" above — exploratory on this run only |
| Position counts on the public feed are global, not scoped to the room | DEFER | Not load-bearing — show of hands does the same job. Becomes urgent the first time the room must see *its own* split |
| The rename (D4) lands mid-preparation | ACCEPT — **founder decision 2026-08-27** | Reordered to run first instead, on its own, before any pipeline run. The residual risk is a missed reference breaking a stage: contained by renaming **before** the pipeline is exercised, so the first end-to-end run is also the rename's proof |

**Non-Goals**

- **Do NOT rescope the triad to "this room."** `p1055:175` — rescoping *"silently breaks the reveal
  without breaking anything visible."* The triad is scoped to the attendee's real, absent counterpart.
- Do NOT build the open-forum topic submission or upvoting surface. Paper and hands for event #1.
- Do NOT build `/slava:disagreement:run`. It stays deferred until this run completes.
- Do NOT move any instrument staking to after the event.
- Do NOT edit `goals.md` or `docs/events/clarity-practice-event.md` directly — amendments go through
  `/slava:maintain:docs-strategy-update`.
- Do NOT relax the rights-cleared-photo requirement into a "generate from any photo" path.

## Done-When

- [ ] **D7 done:** the stake flow was walked end-to-end by a **non-founder account** — signup through
      a real inbox or a real non-founder Google account, the auth callback, `mark_self_verified`, and
      a `point_positions` row that lands **without** any `service_role` write anywhere in the
      sequence — and p1055's own `:206` box is ticked. A run using `e2e/helpers/test-user.ts` does
      **not** satisfy this box (it sets `email_confirm: true` and writes `is_verified` as admin)
- [ ] A ranked topic candidate backlog exists at a named path, scored against care / disagree / fuzzy,
      with the chosen topic and its score shown
- [ ] D1, D2 and D5 shipped — selector accepts a seed; provisioning has an initials branch; publish
      distinguishes deliberate from accidental avatar absence, proven by a run that would previously
      have halted
- [ ] D6 resolved or the prod run uses only photos needing no attribution surface
- [ ] One topic filed to TEST, and the rendered feed checked by **loading every point URL and reading
      the order back** (the criterion p1055:198 uses)
- [ ] The same set filed to PROD as a separate invocation, returning a public tag feed URL
- [ ] The event is published and promoted, with the points feed linked in the listing
- [ ] The event has run; a `point_positions` query shows `cmp7` rows timestamped **before** the
      argument block and re-stake rows after, and `cmp3` rows before the reveal
- [ ] Attendance, opt-in count, dimension movement, the P1/P2 gap and community joins are written to
      **`.private/docs/events/event-01-results.md`**
- [ ] The next-event topic shortlist was voted on paper and written back to the backlog
- [ ] `goals.md` and `docs/events/clarity-practice-event.md` amended via the strategy gate — covering
      **all five deviations above**, resolving the `:18` vs `:127` CTA contradiction, and recording
      the `Clarity Forum` name reuse with the definition loosening it forces (Open Question 3).
      `docs/events/clarity-forum.md` is in scope for that amendment too

## Open Questions

1. **Which topic?** Unresolved until step 1 runs. Candidates: AI safety (doomer-versus-optimist,
   seeded from the founder's viewing) and effective altruism (prepared, strongest room-match).
   **Pre-registered prediction, stated before the check so it can be wrong:** AI safety passes care
   and fuzzy and **fails disagree** in this room — everyone agrees it matters and nobody present bears
   the outcome.
2. `[FOUNDER DECISION: exact wording of the spoken closing ask at event #1.]` **Deferred
   2026-08-26 by founder choice** — drafted once the topic and the room are known. Not blocking:
   it is needed on the night, after step 4. The *substance* is settled (join the community, free,
   local, the only ask); only the wording is open. Sayable link: `/org/cm/join`.
3. ~~The public name for this event configuration.~~ **RESOLVED 2026-08-26: `Clarity Forum`** —
   the founder's own name, already the offline series key (`clarity-forum.md:10`, decided
   2026-06-26). A series key cannot change after the first listing publishes. **Two consequences
   the amendment must carry rather than inherit silently:** `clarity-forum.md:4` defines a Forum
   *by* open-forum topic origin (*"The audience brings provocative topics"*;
   `clarity-practice-event.md:16` — *"The room brings it. This is what makes it a forum"*), and
   event #1 deviates from exactly that (deviation 3) — reusing the name means loosening that
   definition on the record. And `clarity-forum.md:12-16` fixes the title as a format tagline
   **because** no single topic can be promised in advance; a founder-picked-topic run *can*
   promise one, so the listing-title convention needs the same pass.
4. ~~Bracelet at event #1.~~ **RESOLVED 2026-08-26: not at all** — see deviation 4. Physical
   bracelet procurement is unowned and belongs to whoever schedules the event that first offers
   one.
5. ~~How is "join the community" performed on the night?~~ **RESOLVED 2026-08-26.** A self-serve join
   path is live: `src/App.tsx:965` routes `/org/:slug/join` → `OrgJoinPage`, which inserts the
   membership row and *is* the Clarity Organization Terms acceptance record. The seeded slug is `cm`
   (`supabase/migrations/20260724120000_p1010_organizations_membership.sql:164`), so **the sayable
   link is `/org/cm/join`.** It requires an account, not an invite — which makes the residual risk the
   same surface as D7.
6. **Does a free online community instance need to exist at all**, or only a paid one? Does not block
   event #1; does block the online configuration.

## Related

- [p1055](p1055_norm_measurement_instrument.md) — the CMP instrument, and D7's origin
- [p1156](done/2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md) — pipeline + contract
- [p1160](p1160_events_pipeline_orchestrator_and_process_doc.md) — event publish + promote (in-progress)
- [p1060](p1060_link_events_to_organizations.md) — events belong to an org, membership levels
- `docs/events/clarity-practice-event.md` · `docs/events/clarity-forum.md` · `docs/points-process.md`
- [decisions.md](../docs/decisions.md) 2026-08-19 (frozen generator palette; greying rejected),
  2026-08-21 (initials fallback, publish-precondition conflict, attribution blocker)
