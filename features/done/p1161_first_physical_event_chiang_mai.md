---
status: all-done
type: task
rank: 1
workstream: gtm
created_date: '2026-08-26'
tags: [events, disagreement-pipeline, cmp, chiang-mai]
delivery_stage: decompose
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

**Situation:** The instrument ([p1055](../p1055_norm_measurement_instrument.md)), the Disagreement
Pipeline ([p1156](2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md)) and the
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
  unringed and operator-named"* ([decisions.md](../../docs/decisions.md) 2026-08-21). The Gate 1
  rejection at `select.md:67-68` is an explicit **founder decision of 2026-08-25**, taken
  *"for v1"* with its cause named — provisioning has no initials branch, so the approval would die at
  the last step. **D2 reverses that founder call; it is not merely filling a gap** — and the
  reversal was taken deliberately by the founder on **2026-08-26**, with D5 acknowledged as
  separate, still-required work rather than a side effect of D2.
- **Two separate frozen things, previously fused — do not re-merge them.** (a) The **avatar
  generator's** slate palette and amber accent are load-bearing and frozen in `gen-agent-avatar`
  ([decisions.md](../../docs/decisions.md) **2026-08-19**, not 08-25) — *"a disclosure mechanism can be
  defeated by its own styling."* That same entry **rejects** greying the avatar as a disclosure
  device, falsified by a real user's photo measuring blacker than any robot. (b) The profile's
  **`avatar_color`** field must be a desaturated slate `#39424B`, never the `#0044CC` default
  (`provision-agent.md:120-126`, `:193` — found 2026-08-24 on a hand-seeded account). An
  initials-only account is governed by (b), not (a).
- **The instrument's ordering holds:** dimensions staked before the argument, triad adjacent to the
  offer, reveal after both ([p1055](../p1055_norm_measurement_instrument.md) — "load-bearing, do not
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

0. ~~**Run the rename (D4) first.**~~ **DONE 2026-08-27 — shipped as
   [P1165](2026-06-10/p1165_disagreement_pipeline_namespace_rename.md).** All five stages are
   in one namespace: `/slava:disagreement:{select,prepare,positions,story-draft,publish}`. The leaf
   is **`story-draft`, not `story`** — `/slava:content:story` already owns `story` and the
   projection is flat and name-keyed. **Start at step 1.**
1. **Topic sourcing + signal check.** ➡️ **Moved to [P1166](../p1166_topic_sourcing_from_interest_corpora.md), 2026-08-27** — a standing capability, not part of this event. **Does not gate this spec:** the founder may hand the pipeline a topic or a video link directly (D1's seed). The YouTube export was requested 2026-08-27 and takes hours; P1166 proceeds in its own session while this one continues.
2. **Run the Disagreement Pipeline** on the chosen topic. ✅ **`/slava:disagreement:run-pipeline` now exists (built 2026-08-27)** — one command, topic (+ optional seed) and room in, five stages in order, every stage gate still halting for the founder. The p1156 decision-2d deferral is **discharged**: its stated cause was stages that were still being renamed, and the rename shipped as P1165. **It never chains TEST → PROD** — that invariant is enforced inside the conductor.
3. **File to TEST**, review the rendered feed against a stated criterion, then **file to PROD** as a
   second invocation.
4. **Publish and promote the event.** Link the published points feed in the listing as *"here's what
   we'll argue"* — **promotion, zero obligation, no staking asked for.**
5. **Run the event**, ~90 min: opening question → `/ready` → `/meet` opt-in → understanding question →
   stake `cmp7` → **host frames the two positions in ~3 min** → fishbowl argument → re-stake what
   moved → stake `cmp3` → reveal → the ask.
6. **Close:** free community join is the single spoken CTA — the sayable link is **`/org/cm/join`**.
   Then a **paper shortlist, show of hands** for the next event's topic, feeding the backlog.

### Deviations from the written docs — four real, one struck

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
5. ~~**The bell is absent.**~~ **STRUCK 2026-08-27 — false alarm, verified by reading the file.** The bell is present: `clarity-practice-event.md` run-of-show block 6 carries it and points at `facilitator-guide.md` § "The bell" for the mechanic. Nothing to reinstate and nothing to record. **This is the second claim in this spec that did not survive opening the file it cited** (see the corrected stake-flow passage) — both were precise, both were wrong.

### Dependencies — a build list, not a wall

> **Reframed 2026-08-27, founder direction.** Every row below is *work*, with an owner and a size.
> None of it is impossible and none of it blocks the event in the sense of "cannot be done" — an
> earlier draft's use of the word *blocks* made a to-do list read as a set of reasons the event could
> not happen. **Exactly one row (D7) requires a person who is not the founder and cannot be done by an
> agent at all.** That is a scheduling fact, not an engineering one.

| # | What | Why it blocks | Scope |
|---|---|---|---|
| **D1** ✅ | **SHIPPED 2026-08-27.** **Seed input for the selector.** Optional person and/or video URL; the seeded side is accepted, Phase 1 proposes and Gate 1 approves only the counterpart. A video URL resolves to *who speaks*, never to the channel; a multi-speaker or unattributed seed is a named STOP. The seed never sets the topic, never skips `subject_key` or portrait status, and never bypasses Gate 1 — the seeded side is labelled `seeded` vs `proposed` so the founder can reject their own seed on seeing it beside the alternative. | Was: the selector took only a topic string and a room. | `disagreement/select.md` — Inputs table + Phase 1 |
| **D2** ✅ | **SHIPPED 2026-08-27.** **No person is ever rejected for lacking a photograph.** Gate 1's portrait *rejection* is replaced by a portrait *status* with three values — `cleared` / `none` / `UNKNOWN LICENCE`. `none` is a valid, approvable outcome routed to a new **Step 2b initials-only branch** in `provision-agent` (no avatar generated, no asset uploaded, `p_avatar_url` passed as `NULL` — never `''` or a placeholder, `avatar_color` `#39424B` mandatory because the initials-on-slate *is* the portrait channel there, and the absence written to the registry log). `UNKNOWN LICENCE` remains a stop — an unread licence is a rights risk; an absent photo is not. Quality gates carry explicit `N/A` exemptions for the branch. | Was: blocked every pseudonymous or independent arguer — the exact voices the Institutional Bias Alert exists to protect. Killed a real run on 2026-08-21. | **Reverses the 2026-08-25 founder rule, deliberately** — its cause (no initials branch, publication hard-stop) is now gone. `disagreement/select.md` + `content/provision-agent.md` |
| **D3** ➡️ | **MOVED OUT 2026-08-27 to [P1166](../p1166_topic_sourcing_from_interest_corpora.md).** Topic sourcing is a standing capability run before *every* event, not part of running the first one. Keeping it here meant P1161 could not close until a permanent capability was built. **Does not block P1161:** the pipeline takes a topic, and with D1's seed the founder can hand it a topic or a link directly. | Was: "step 1 has no home and no repeatable method." It has a home now. | Own spec. The YouTube export is the long pole (hours) — requested 2026-08-27. |
| **D4** ✅ | **SHIPPED 2026-08-27 as [P1165](2026-06-10/p1165_disagreement_pipeline_namespace_rename.md).** **Disagreement Pipeline rename** → one namespace, every stage carrying the prefix: `disagreement:select\|prepare\|positions\|story\|publish`. | **FOUNDER DECISION 2026-08-27: approved, and it runs FIRST — before the event, before the topic run.** The founder's reasoning: the stages are one pipeline and must read as one pipeline; splitting the naming *"doesn't make sense."* An earlier draft of this spec made deferral a Non-Goal — **that was the spec author's judgement, never a founder decision, and it is reversed here.** | Five stages, and **`points-*` matches only three** — `positions-create` and `story-create` must be named explicitly; `story*` over-matches four unrelated siblings (`story-gate`, `story-to-image`, `sifter-story`). Measured 2026-08-27: 15–33 referencing files per stage name. **Also touches `CLAUDE.md`'s namespace list**, so it goes through the CLAUDE.md gate. |
| **D5** ✅ | **SHIPPED 2026-08-27.** **`publish` now branches on `avatar_url` instead of hard-stopping.** `NULL` + a registry line reading `portrait: none (deliberate, …)` ⟹ proceed, no probe, assert `avatar_color = '#39424B'` instead, and print `portrait: none (deliberate)` into the run output so the absence is visible in the record. `NULL` with **no** registry line ⟹ STOP — an absence nobody wrote down is a gap, not a decision. Non-`NULL` keeps the `200` + `image/*` assert unchanged. | Was: `publish.md:39` hard-stopped on any missing avatar, so an initials-only agent died at the last step. | **The discriminator is deliberately outside the database** — `NULL` is `NULL` whatever put it there, so the written registry line made at provisioning time is what carries the intent. Closes the open item in [decisions.md](../../docs/decisions.md) 2026-08-21. |
| **D6** ⏭️ | **SKIPPED for event #1 — FOUNDER DECISION 2026-08-27.** Photographer attribution surface. | Attribution is owed only for a cleared photo *actually used*. D2's initials-only path means a run provisioned `portrait: none` publishes no photographs, so nothing is unattributed on prod. | **This is a choice for this run, not a claim D6 is solved.** D6 still gates the first run that publishes a cleared portrait. If a `portrait: cleared` arguer enters this run, D6 comes back. Routed to the story/image component work. |
| **D7** ✅ | **CLOSED 2026-08-27 — FOUNDER DECISION: not load-bearing.** Walk the in-room stake flow with a non-founder account. | Founder's call, verbatim: *"I kind of tested it. It works."* | **What remains untested is named rather than hidden:** a *non-founder* signing up fresh, confirming their email, and staking — hops 3–4 of the traced path. The founder's own account is already confirmed, so testing from it never exercises the sign-up-and-confirm hop. **Accepted risk, deliberately taken.** Mitigation available at zero cost: the login screen already offers Google as the primary button, which has no email round-trip — **route the room to Google rather than letting them choose.** If block 5 stalls live, this row is the first place to look. |

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

- All seven `cmp7` Points render on the stake surface at **`/stake/cmp7`**, reached from the room's
  **Links** menu — P1179 superseded the old filtered-feed pointer that stood here. **The Links menu is the
  room's URL**: the attendee opens Links in the nav and taps `cmp7`, so nothing is typed and nothing
  is dictated out loud. The oldest-first ordering the instrument requires is requested from the
  database by the surface itself, not carried in a sort param. All ten `cmp10` Points confirmed
  present on test (7 × `cmp7`, 3 × `cmp3`).
- Tapping a position while logged out shows an inline *"Sign up or log in to save your position"*,
  and P458's forwarding works: the link carries `action=set-position`, the `pointId`, the chosen
  `position`, and a `redirect` back to the filtered feed.
- The login screen offers **"Continue with Google" as the primary button**, with magic link second.
  The no-email-round-trip route is already the default the room will see.

**Observed, not hypothesized — but NARROWER than first written. Corrected 2026-08-27 by reading the
code.** The original claim here was that a tapped position renders selected while nothing is written,
with no way for the attendee to tell. **That is true only for the logged-OUT case, and even there a
per-card CTA does render.** Verified by command:

- **Logged out:** `feed-point-card.tsx:114-120` sets local `anonPosition` and returns — nothing is
  written, by design (P502), and counts are deliberately not inflated (`:105-107`). The
  *"Sign up or log in to save your position"* line renders at `:254-255` **per card**, from that
  card's own state — so tapping seven cards renders seven CTAs, not one. The earlier "the line appears
  only on the card that was tapped" reading was a misreading of per-card state as a single shared CTA.
  **The residual defect is styling, not silence:** the pressed button looks identical to a saved
  position, so the CTA is doing all the work of signalling *not saved*.
- **Logged in but UNVERIFIED — the case that would actually cost the room — does NOT fail silently on
  this surface.** `points-service-real.ts:869-872` calls `throwDbError` on any error, so the RLS
  refusal throws; `feed-point-card.tsx:132-136` catches it, reverts the optimistic state, and shows a
  `Failed to save position.` toast. **The swallow named in the spec (`api.ts` / P705 / P1093) is on the
  LETTER surface, not the feed** — `api.ts:774-784` documents it as staging into
  `letter_point_responses`, replayed by `replay_letter_positions()` once verified.

**Consequence for the event:** this is no longer a room-killer and no longer sequenced first. It is a
**visual-affordance fix** — make an unsaved anon selection look unsaved — and it is optional for
event #1, because the room will be asked to sign in *before* block 5 regardless (D7). Do not carry the
original, stronger claim forward; it did not survive reading the code.

**Hops 3 and 4 are NOT walked, and an agent may not walk them** — completing them means creating a
real account, which the operating rules reserve to the founder. The runbook is below; it is the
whole of what D7 still needs.

### D7 runbook — what the founder runs (≈5 minutes, TEST)

Everything up to this point is verified. This is the remainder.

1. `npm run dev` (test DB, `:5001`), then open `http://localhost:5001/stake/cmp7` in a **private
   window** — a logged-in founder session invalidates the walk. In the room this is reached from the
   **Links** menu rather than typed (P1179).
2. Tap a position on the first Point. Follow *"Sign up or log in to save your position"*.
3. Sign in as **someone who is not the founder** — either **Continue with Google** with a
   non-founder Google account, or the magic link sent to a mailbox that is not the founder's
   (`ops@` is readable from this repo via `scripts/read-ops-email.mjs`).
4. **Watch what happens on return.** Two things to observe, both load-bearing: whether the callback
   completes without a `mark_self_verified failed` warning in the console (it is caught and logged
   non-fatally at `AuthCallbackPage.tsx:507`, so a failure is silent in the UI), and whether the
   position tapped in step 2 is actually applied on return or silently dropped.
5. Stake the remaining six, then open **Links** and tap `cmp3` for the triad (`/stake/cmp3`).
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
  [p1156](2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md).
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
| The event-publishing orchestrator ([p1160](2026-06-10/p1160_events_pipeline_orchestrator_and_process_doc.md)) is `status: in-progress`, mid-`/dev`, with six unchecked Done-When | ACCEPT | The 14 `events/` skills exist, so step 4's promote surface is real; run the stages by hand if the orchestrator is not shipped by then |
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

- [x] ~~**D7 done:** stake flow walked by a non-founder account~~ — **CLOSED 2026-08-27 by founder
      decision as not load-bearing** (*"I kind of tested it. It works."*). The untested hop (a
      non-founder signing up fresh and confirming) is an **accepted risk**, named in D7 above, with
      the zero-cost mitigation being to route the room to Google rather than magic link. p1055's
      `:206` box is **left unticked** — this decision closes it for *this event*, it does not satisfy
      the original claim.
- [x] **D1, D2 and D5 shipped 2026-08-27** — selector accepts a seed and records portrait status
      instead of rejecting on it; provisioning has the Step 2b initials branch; publish branches on
      deliberate-vs-accidental absence. **Still to prove at run time:** a run that would previously
      have halted (an arguer with `portrait: none`) completing through publish. Shipped ≠ exercised.
- [x] **D6 resolved for this event 2026-08-27** — the prod run uses no photographs (`portrait: none`
      arguers), so no attribution surface is owed. Reverts to open if a `portrait: cleared` arguer
      enters the run.
- [x] **The pipeline conductor exists** — `/slava:disagreement:run-pipeline`, built 2026-08-27,
      discharging the p1156 decision-2d deferral. **Still to prove:** one topic through it end to end.
- [ ] One topic filed to TEST, and the rendered feed checked by **loading every point URL and reading
      the order back** (the criterion p1055:198 uses)
- [ ] The same set filed to PROD as a separate invocation, returning a public tag feed URL
- [ ] The event is published and promoted, with the points feed linked in the listing
- [ ] The event has run; a `point_positions` query shows `cmp7` rows timestamped **before** the
      argument block and re-stake rows after, and `cmp3` rows before the reveal
- [ ] Attendance, opt-in count, dimension movement, the P1/P2 gap and community joins are written to
      **`.private/docs/events/event-01-results.md`**
- [ ] The next-event topic shortlist was voted on paper and written back to the backlog
- [x] **`docs/events/clarity-practice-event.md`, `docs/events/clarity-forum.md`,
      `docs/facilitator-guide.md` amended 2026-08-27** — CTA contradiction resolved by qualifying the
      offer *by configuration* (not by deleting one side), block 5b host-framing added, the seeding
      exception recorded in both event docs, the bracelet absence and its three consequences stated,
      and the room's sign-in routing written into the facilitator guide. `.private/docs/events/event-01-results.md` created.
- [x] **`goals.md`:15 amended 2026-08-27**, wording approved by the founder before it landed. The
      offline configuration now carries the seeding exception, marked event-#1-only with its
      convergence mechanism named. **Not run through `/slava:maintain:docs-strategy-update`, and that
      is correct** — that skill states `goals.md` is *"not a gated home (ungated/tactical) — free-standing
      tactical edits to it are outside this skill entirely."* Event topic-source is tactical
      (CHARTER rule 7). An earlier line in this spec called for the strategy gate here; that was wrong.
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

- [p1055](../p1055_norm_measurement_instrument.md) — the CMP instrument, and D7's origin
- [p1156](2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md) — pipeline + contract
- [p1160](2026-06-10/p1160_events_pipeline_orchestrator_and_process_doc.md) — event publish + promote (in-progress)
- [p1060](./2026-06-10/p1060_link_events_to_organizations.md) — events belong to an org, membership levels
- `docs/events/clarity-practice-event.md` · `docs/events/clarity-forum.md` · `docs/points-process.md`
- [decisions.md](../../docs/decisions.md) 2026-08-19 (frozen generator palette; greying rejected),
  2026-08-21 (initials fallback, publish-precondition conflict, attribution blocker)

---

## Closed 2026-08-28 — `all-done`. Founder decision: the spec was about *preparing*, and preparation shipped.

**Founder, 2026-08-28:** *"it was never about organizing the event itself. The success was just
preparing and we prepared and now we run a neighbouring session, our disagreement pipeline."*

### What actually shipped (six ticked items, verified against the artifacts — not this spec's text)

- **The doc landings this spec existed to force.** `docs/events/clarity-practice-event.md`,
  `docs/events/clarity-forum.md` and `docs/facilitator-guide.md` all exist and were last amended
  2026-08-27; the seeding exception is present in all three homes it was owed
  (`clarity-practice-event.md` ×3, `clarity-forum.md` ×2, `goals.md` ×1).
  `.private/docs/events/event-01-results.md` exists, created and waiting for the run.
- **`goals.md`:15** carries the event-#1-only seeding exception with its convergence mechanism named.
- **D1, D2, D5 shipped 2026-08-27** — the selector accepts a seed and records portrait status
  instead of rejecting on it; provisioning has the Step 2b initials branch; publish branches on
  deliberate-vs-accidental absence.
- **D6 resolved for this event**; **D7 closed by founder decision** as not load-bearing.
- **The pipeline conductor exists** — `/slava:disagreement:run-pipeline`, built 2026-08-27,
  discharging the p1156 decision-2d deferral.

### What is NOT done, and why it is not tracked here

Six Done-When items remain unticked. Every one of them is **the run itself**, not the preparation:
filing a topic to TEST then PROD, publishing and promoting the event, the `point_positions` /
`cmp7` / `cmp3` timing query, writing attendance and dimension movement to
`.private/docs/events/event-01-results.md`, and voting the next-event topic shortlist on paper.

These are **executing** work, and they are running in a neighbouring session through the
disagreement pipeline. Their home is `.private/docs/events/event-01-results.md`, which already
exists for exactly this. **They are deliberately not carried forward as a spec** — this spec's
appetite was preparation, and holding it open until an event runs would have made a prepared board
look unprepared.

**If the run should be tracked as its own task, that is a `/slava:build:create-spec` call, not a
status change here.** Flagged to the founder; not filed by this skill.

Closed by `/slava:maintain:prioritize`.
