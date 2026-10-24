---
status: week
type: story
rank: 61
workstream: events
created_date: '2026-10-22'
tags: [events, membership, learning, prepare, community]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1549: Learn about the community, then decide: the path into membership

## Problem

**Situation:** Each event offers a "prepare" page (P1402; per series via P1542 recipes). Membership exists (P1183) and per-event principle opt-in already has three states: Opted in / Opted out / Undecided. Joining as a member does not require knowing what the community stands for.

**Complication:** "Preparation" is the wrong name: nobody prepares for a hike. What the page really does is let someone learn what this community is before deciding whether to belong. Members who never learned the principles dilute what membership means.

**Question:** How does one learning step serve both a just-registered attendee (optional) and someone joining as a member (required), and lead naturally from event to membership?

> Founder, verbatim (2026-10-22): "So far, we call this slash prepare. But it's not prepare for the event. You don't prepare for the event. On the event, the maximum you can do is you can decide to learn more and then learn. And then you decide if you join."

> Founder, verbatim: "the person who just registered for the event, he optionally can learn. And the one who wants to join, he needs to manage the expectation that he needs to learn first before he joined and explained why."

Journey: register → optionally learn → the event → feedback → decide on membership.

## Appetite

Two increments.

- **Increment 1 (build now): the groups-page join gate.** Blast radius: small to medium. It touches `/groups/:slug/join`, the standalone `/prepare` in a join mode, the About tab's terms link and the sign-up callback. Reversibility: high, code only, no migration.
- **Increment 2 (later):** the rename sweep, room member counts, one-tap member re-confirm and the existing-member invite. It needs its own Done-When before `/dev` starts it.

Decision density: decisions 1-12 are made (defaults applied where marked). New copy is marked `[FOUNDER DECISION: copy]`.

## Founder decisions (2026-10-22)

1. Rename "prepare" to learning: "learn what this community is, then decide".
2. Joining the community requires the learning first. Same content, two entry messages:
   - Just registered: told it is optional.
   - Tapped "Join as member": told kindly it takes about 5 minutes to learn first, and why, then decides. (The number shown is computed, never a literal: decision 7.)
3. Per-event principle opt-in keeps Opted in / Opted out / Undecided. Not learning = Undecided, never auto opted-out.
4. Members re-confirm each event with one tap. The room celebrates "today N members here, N people trying it".
5. End of feedback: if the person did not learn, invite them to learn.
6. Copy per series lives in the series recipe (P1542); events without a series use Clarity Night's.

[FOUNDER DECISION: existing members who never did the learning. Recommendation: keep them as members (no countdown, no pending state) and invite them once to do the learning; the founder can remove anyone who does not follow the principles; no quiz or verification. Founder leaning matches. Default applied 2026-10-24 (told to the founder, who may overturn it). Building the invite is Increment 2.]

## Prerequisites from P1542 (branch `feature/p1542-series-recipes`, not yet shipped)

Read this before building. Increment 1 builds on top of P1542 and starts after it ships.

- **"Learned" is one rule:** `hasLearned(parts, completedAt)` in `src/app/prototypes/events/prep/prep-plan.ts:101-102`. It is true when this event's learning is complete (`completedAt`), **or** when two once-per-person parts are completed at their current version: `cognitive_video` (the cognitive-understanding video) and `cmp7` (the statements).
  - The learning shows **three** steps (story, principle, cmp7). Eligibility needs only **the video and the cmp7 statements**. The principle step is deliberately not required: its intro can be skipped, so it is not proof (the code comment says so).
  - A video counts only when it was played. "Continue without video" records nothing (`PreparePage.tsx`, the story step's `videoBar`).
- **The event-side join gate exists.** On a hike's feedback thank-you, a non-learner's "Join" opens the learning in the room frame (`EventClosePage.tsx`, the `then=join` button, about :842 on the round 6 tree). Its header reads "Joining <community> · Part 1 of 2 · Short introduction" (`EventPrepPage.tsx` `learn-join-context`). The learning ends on the group terms, "Part 2 of 2 · Group terms". A learner goes straight to the terms.
- **Round 6b fix (P1542 work, not P1549 work):** the standalone `/prepare` never recorded the `cmp7` part. It only records `cognitive_video` and `principle_intro` (`PreparePage.tsx`, the two `complete(...)` calls). P1542 round 6b records `cmp7` there, signed in and signed out. Without it, a person who finished `/prepare` never satisfies `hasLearned`. **No backfill** of existing users: someone who answered the cmp7 statements before 6b sees that step as not done once.
- **Not built:** the groups page. `/groups/:slug/join` shows the terms and "Accept terms & join" to every non-member, learned or not (`src/app/pages/org-join-page.tsx:210-305`, measured 2026-10-24).

## Founder UAT round 6 (2026-10-24): joining from the groups page

The founder asked several times to *see* this. A person on `/groups/:slug` taps "Join as member" (`org-header.tsx:295`, handled by `org-page.tsx:236-240`, which goes to `/groups/:slug/join`). They have not learned, or have learned only part.

7. **Learn first, said kindly, with the reason and the real length.** It is the same three steps as the hike learning: the cognitive-understanding story, the principle, the cmp7 statements. The minutes are computed. Decision 2's "same content, two entry messages" means no separate join curriculum.
8. **Resume where they stopped.** A partial learner sees the steps already done ticked and continues at the first undone one.
9. **Learned anywhere means straight to the terms.** The rule is `hasLearned`, the same one as decision 2's join gate on the event side.
10. **The terms are "Part 2 of 2"** only for someone who came through Part 1 in this visit, otherwise "Group terms" (the P1542 round-5c rule). The primary reads **"Accept and join"**, the same words as the event flow. Today it reads "Accept terms & join".
11. **Signed out works the same.** The learning runs signed out (P1402: parts are held in the browser). "Accept and join" then goes to sign-up with `action=join-org`, as today.
12. [FOUNDER DECISION, default applied 2026-10-24 and told to the founder, who may overturn it: can a non-learner READ the group terms without joining? Default **A**.
    - **A:** yes. The About tab's "Clarity Group Terms" link opens them read-only, and the terms page's button reads "Join <group>" and leads into the learning. Only accepting is gated.
    - **B:** no. The terms appear only after learning.
    - Recommendation: **A**. The terms are linked publicly from the About tab today (`org-page.tsx:506`). The round-5 rule "nobody reaches the terms without learning" was about joining, and A keeps that.]

**Increment 1 builds A.** If the founder overturns it, the `?view=terms` branch below is removed and the About link goes to Part 1.

## Invariants

- **The gate is advisory, not an authorization boundary.** The supported join UI shows the learning before "Accept and join". Nothing on the server checks learning. A hand-made `/signup?redirect=/groups/<slug>/join&action=join-org` link still auto-joins (`AuthCallbackPage.tsx:604-630`), and a direct insert into `membership` still works (`organizations-service.ts` `joinOrganization`). This is accepted (Risks). The founder can remove anyone.
- **"Not learned" never writes a principle answer.** Nothing in this increment creates, clears or changes a per-event opt-in or opt-out. Undecided is only what shows when no explicit answer exists.
- **One rule.** The groups page calls `hasLearned` itself. It never copies the rule.

## Solution

### Increment 1 (build now): the groups-page join gate

#### Which screen `/groups/:slug/join` shows

Checked in this order. The first match wins.

1. **Pending:** the group, auth, membership (signed in) or the learned read (non-members) is still loading. Show `ClarityPageLoader`, the standard page loader. No screen is chosen before every read has answered.
2. **Group not found:** today's not-found screen (unchanged).
3. **A read failed** (membership or learned read, an error or a timeout): an error line and a "Try again" button that repeats the reads. A failed read is never treated as "not a member" or "no progress". [FOUNDER DECISION: copy, the error line and the retry label.]
4. **Member:** the read-only terms they accepted, with "Back to <group>" (unchanged). A member with `?from=` is redirected to the group, as today.
5. **`?view=terms`** (non-member, decision 12 A): the current terms read-only, with no Accept. The button reads "Join <group>" (short name, up to " · ") and goes to `/groups/:slug/join` without `view`. The About tab's "Clarity Group Terms" link (`org-page.tsx:506`) points here.
6. **`hasLearned`:** the terms with "Accept and join".
7. **Started** (`cognitive_video` or `cmp7` done): Part 1, resume form.
8. **Otherwise:** Part 1.

#### The learned read (no event)

`usePrepState` needs an event, so `/dev` adds a small event-free read. It returns what `hasLearned(parts, completedAt)` needs:

- **parts:** signed in, the person's `person_prep_parts` rows (`event-prep-service.ts` `getMyPrepParts`), read after `syncLocalPrepParts` has moved this browser's parts to the account (as `PreparePage` does). Parts still held locally after a failed write count too. Signed out, this browser's parts only (`prep-local-parts.ts`).
- **completedAt:** signed in, the latest `completed_at` among the person's own `event_preparations` rows, or null. The owner can read their own rows ("Owner reads own preparation", `20261001120000_p1336_event_preparations.sql:93-95`).

This keeps "learned anywhere" true to the event side. Someone who finished any event's learning, even after skipping a video, counts as learned there, so they count here too.

#### The screens (1440 and phone; same stack, narrower)

**Part 1, not learned** (`/groups/:slug/join`, signed in or out, not a member, `!hasLearned`):

```
← Back                                                  shell top bar (see the navigation table)
Joining Clarity Practice Community                      text-sm font-semibold
Part 1 of 2 · Learn how we meet                         text-xs muted

Before you join: N minutes to learn how we meet         h1 text-2xl, N computed
Members make one promise to each other: to say          text-base muted (3 lines max)
honestly how well they understood. See what that
means first, then decide if it is for you.

 1  Learn the definition of cognitive understanding        N min
 2  Decide about your participation in a new social norm   N min
 3  Share your view on the expected benefits               N min

            [ Start learning ]                          the one primary (blue), max-w-sm, centred
```

[FOUNDER DECISION: copy. The Part 1 subtitle ("Learn how we meet"), title and reason line are proposed. The event-side Part 1 says "Short introduction". Pick one wording for both, or keep them different on purpose.]

- **Minutes:** each row is `stepMinutes`, and the title's N is `minutesFor` over the steps not yet done (`prep-plan.ts`). The cmp7 row needs the cmp7 card count, so `loadTagPoints('cmp7', viewerId)` is part of the pending state. No literal number appears anywhere.

**Part 1, partially learned:**
- Title "Welcome back: about N minutes left".
- Done rows show a check, muted.
- Button "Continue".

**Part 2, the terms** (a learner, or arriving from Part 1):
- Heading "Join <group short name>" (the round-4 short-name rule: up to " · ").
- Subtitle: the COA intro.
- The certificate.
- "Accept and join" (primary), with "Back" as the centred link under it.
- The header line "Part 2 of 2 · Group terms" appears only with `joinViaLearning`. Otherwise the line reads "Group terms".

**Member:** unchanged.

#### The learning in join mode

It is the standalone `PreparePage` (P1402), opened as `/prepare?then=join&group=<slug>`. `then=join` fixes the steps to story, principle, cmp7. `?from=` and `?return=` from the join page are carried through and back.

- If `group` is missing or does not resolve to a group, the page is the plain `/prepare` (four steps, its own end).
- **Header:** the join context, "Joining <group> · Part 1 of 2", with the back arrow inline (the P1542 round-5d pattern), not the standalone list header.
- **No list screen.** It opens at the first undone step. There is no end screen: finishing goes to the terms.
- **What each tick means** (the same signals as the gate, so the tick and the gate always agree):
  - story: `cognitive_video` completed (the video was played);
  - principle: its decision was answered **in this visit**. The standalone page persists nothing for the principle except `principle_intro`, which is written right after the intro video (`PreparePage.tsx`, the principle `videoBar`). So `principle_intro` does not tick the step. A person who leaves and comes back starts the principle step again, at its intro;
  - cmp7: the `cmp7` part completed (P1542 round 6b).
- **Finish** = leaving the last undone step forward. It goes to `/groups/<slug>/join` with `replace` and `joinViaLearning`. The join page then runs its normal screen choice. If a video was skipped, `hasLearned` is false, so the person lands on Part 1 with that step unticked and "Continue". That is the honest result of decision 1's rule, not a loop: the history does not grow.
- [FOUNDER DECISION: in the join learning, does the story step keep "Continue without video"? Default: it stays, with the consequence above. The alternative is to offer only "Play the video" in join mode.]
- **Reads and writes:** while the parts read is pending, show `ClarityPageLoader`. A failed or timed-out read shows the same error and retry as the join page, never empty progress. (The plain `/prepare` keeps its own behaviour: steps without checks.) Part writes stay optimistic, with today's local fallback when the account write fails.
- The general `/prepare` opened on its own keeps its four steps and its own end.

#### Navigation

Provenance mark: the group page sets route state `fromGroup: true` when it opens `/join`. Every `replace` below carries `fromGroup` and the query params (`from`, `return`) along. "Return to the group" means: pop when `fromGroup` is set and the entry below is the group page, else `replace` with `/groups/:slug` (or the `?return=` path). That is `useReturnToParent`.

| Where | Action | Goes to | History |
|---|---|---|---|
| Group page | "Join as member" (header) or "Join this group" (About) | `/groups/:slug/join` | push, sets `fromGroup` |
| Group page, About | "Clarity Group Terms" | `/groups/:slug/join?view=terms` | push, sets `fromGroup` |
| Part 1 | header Back | the group | return to the group |
| Part 1 | "Start learning" / "Continue" | `/prepare?then=join&group=<slug>` | replace |
| Learning | step Back | the previous learning screen (or principle sub-screen) | in the page, no history entry |
| Learning, first screen | step Back | `/groups/:slug/join` (Part 1) | replace |
| Learning | finish | `/groups/:slug/join` with `joinViaLearning` | replace |
| Learning | browser Back | the entry below (the group page when it opened the flow) | browser |
| Terms | header Back, or the "Back" link | the group | return to the group |
| Terms | "Accept and join", signed in | the group (or `?return=`) with the joined banner | replace (as today) |
| Terms | "Accept and join", signed out | `/signup?redirect=…&action=join-org` | push (as today) |
| `?view=terms` | "Join <group>" | `/groups/:slug/join` without `view` | replace |
| `?view=terms` | header Back | the group | return to the group |

- **No loops.** Nothing goes from the terms back into the learning. The learning never pushes. The stack is at most `[group, join or prepare]`.
- **Browser Forward** after leaving: Forward to `/join` re-runs the screen choice. Forward to `/prepare?then=join` (only possible after a browser Back from the learning) reopens it at the first undone step.
- **Reload:** on `/join`, the screen choice runs again; route state survives a reload, so `joinViaLearning` stays on that entry. On the learning, it restarts at the first undone step (screens live in component state).
- **Cold entry** (typed URL, new tab, a shared link): no route state, so header Back replaces with the group, and the terms read "Group terms".
- **`joinViaLearning`** is set only by the learning's finish and lives only on that history entry. Any other navigation to `/join` arrives without it.

#### Signed out, then sign-up

- The learning runs signed out. Parts are held in this browser (`prep-local-parts.ts`), and cmp7 answers as anonymous positions.
- "Accept and join" goes to `/signup?redirect=/groups/<slug>/join&action=join-org` (as today).
- **The callback moves the parts before it joins.** Today `AuthCallbackPage` auto-joins and redirects (`AuthCallbackPage.tsx:604-630`) and never calls `syncLocalPrepParts`. Its only callers are `PreparePage` and `use-prep-state.ts`. In the `join-org` branch, the callback reads the account's parts, runs `syncLocalPrepParts`, then joins. A failed transfer does not block the join (the gate is advisory). The parts that failed stay local and sync on the next signed-in read.
- **Same browser only.** If the magic link opens in another browser, the join still completes, and the parts stay in the first browser until it is used signed in. If storage is unavailable, nothing was kept (the P1402 contract), and the person joins without parts on the account.

### Increment 2 (later): needs its own Done-When before build

Not built in Increment 1. These are not checkboxes, so they do not block Increment 1's `qa`. Before `/dev` starts any of them, add its items to `## Done-When`, check it against what P1542 shipped, and start after P1548 ships.

- **Rename sweep:** no user-visible "prepare/preparation" wording; `/events/:slug/prepare` redirects to a new route. The route name is [FOUNDER DECISION: copy]. Decide whether the standalone `/prepare` and `?then=join` URLs move with it.
- **Two entry messages:** a just-registered attendee sees the "optional" intro. Check first: P1542 round 5 added a registration learn card.
- **Feedback end (decision 5):** P1542 #35 changed this. Every non-member now sees "Join <community>", and the learning comes inside the join. Decide whether decision 5 is met or still needs an invite.
- **Per-event opt-in:** someone who did not learn shows as Undecided, never Opted out (see the Invariants). A regression check, likely already true.
- **Member re-confirm:** a member sees a one-tap re-confirm for the event's principles.
- **Room counts:** "today N members here, N people trying it". Open before build: who counts as "here" (registered, checked in or in the room now), who counts as "trying it" (every non-member, or non-members who opted in), and when the numbers refresh.
- **Existing-member invite** (per the founder decision above): the surface, the suppression rule, and whether "once" is per account or per browser.
- **Recipe copy:** a Social Hike event shows its recipe's copy; an event with no series shows Clarity Night's.

## Done-When

Increment 1 only. Increment 2 writes its own before build.

Every visual item is measured at 1440, 375 and 320, with the screen-review brief v2 snippet output pasted.

- [ ] Signed in, not a member, no learning parts: "Join as member" on `/groups/cm` shows Part 1:
  - "Joining Clarity Practice Community · Part 1 of 2 · <subtitle per the copy decision>";
  - the title with N equal to `minutesFor` over the three steps (the test computes the expected N from the same inputs);
  - the reason line;
  - the three steps, each with its `stepMinutes`;
  - one primary, "Start learning".
  No terms and no "Accept" are on the screen.
- [ ] Starting the learning shows the join context header and opens at step 1 with no list screen. Finishing step 3 lands on the terms with "Part 2 of 2 · Group terms" and "Accept and join". Accepting creates a `membership` row and returns to the group page with the joined banner. The e2e records every URL and `history.length`.
- [ ] Leaving after step 1 and tapping "Join as member" again shows "Welcome back: about N minutes left", step 1 ticked, steps 2 and 3 not, and "Continue". Continuing opens step 2.
- [ ] Leaving right after the principle intro video (before its decision) and returning shows step 2 unticked. "Continue" opens step 2 at its intro.
- [ ] Skipping the story video and finishing lands on Part 1 with step 1 unticked and "Continue" (per the copy decision, if that changes the flow).
- [ ] A person with `cognitive_video` and `cmp7` completed, and a person with any `event_preparations.completed_at`, each go straight to the terms, titled "Group terms" with no "Part 2 of 2".
- [ ] A member sees the read-only terms (unchanged; the p1010 and p1076 org-join e2e green, with fixtures updated where they expect terms for a non-learner, see Risks).
- [ ] About tab, non-member: "Clarity Group Terms" opens `?view=terms`, read-only, no Accept, with "Join <group>". "Join <group>" leads to Part 1 for a non-learner and to the terms with Accept for a learner. A member following the same link sees their own read-only terms.
- [ ] Navigation: each row of the table is exercised in the e2e. After each sequence, browser Back from the group page never shows `/join` or `/prepare`, and no sequence returns to the learning from the terms.
- [ ] Reload on Part 1, on the terms (with and without `joinViaLearning`) and on a learning step each match the reload rules above.
- [ ] Pending and failure: with the parts read delayed (a controlled route delay), only `ClarityPageLoader` shows until it answers; no Part 1 or terms frame appears first. With the parts read or the membership read failing, the error line and "Try again" show, not Part 1 and not the terms; "Try again" with the read restored shows the right screen.
- [ ] Signed out: the same Part 1, then the learning, then the terms. "Accept and join" goes to sign-up with `action=join-org`. After sign-up in the same browser the person is a member, and `person_prep_parts` holds their `cognitive_video` and `cmp7` rows (query output pasted).
- [ ] Signed out with the transfer write failing: the join still completes, and the parts are still in this browser's storage afterwards.
- [ ] Centring: "Start learning", "Continue", "Accept and join", the "Back" link under it, "Join <group>" and "Try again" are each within 2px of their container's centre. The header Back is left-aligned by design and is not measured for centring.
- [ ] The supported UI never shows "Accept and join" to a non-learner who is not on `?view=terms` (where it is absent). The test names this as an advisory check, not a security boundary.

## Hypothesis (UNTESTED)

Requiring the learning before membership yields members who come back. **Falsifier:** if joins fall near zero over about 2 months, and learned members do not return to a second event at a higher rate than non-members, loosen the requirement. Record in `docs/hypotheses.md` via `/docs-strategy-update` when this ships.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The gate kills joins | ACCEPT | It is the bet; the falsifier above names when to loosen it |
| The gate is client-side; a crafted sign-up link or a direct insert joins without learning | ACCEPT | No quiz or verification by design (Non-Goals). The founder can remove anyone. Server enforcement would be its own spec |
| Existing e2e (p1010, p1076) expect the terms on `/join` for a fresh non-member | MITIGATE | The behaviour changes on purpose. Seed learned parts in those fixtures or use `?view=terms`; never weaken an assertion about what a member or learner sees |
| Existing members feel demoted | MITIGATE | Founder decision default keeps them as members; the invite is Increment 2 |
| No backfill: people who answered cmp7 before P1542 6b see that step once more | ACCEPT | One short step; a backfill would guess from positions |
| Counts in the room expose who is not a member | ACCEPT | Increment 2. Aggregate numbers only, no names |
| Increment 2 lands before P1548 and conflicts on room/feedback screens | MITIGATE | Increment 2 starts after P1548 ships. Increment 1 does not touch the room or feedback screens |
| Increment 1 lands before P1542 | MITIGATE | It needs `hasLearned` and the round 6b cmp7 record. Start after P1542 ships |

**Non-Goals**
- Do NOT add a quiz, test or verification of the learning.
- Do NOT auto opt-out anyone.
- Do NOT write new learning content; reuse the existing preparation content.
- Do NOT change membership levels or gated events (P1183).
- Do NOT backfill the cmp7 part from existing positions.
- Do NOT add server-side enforcement of the learning in this spec.

## Related

Depends on: P1542 (recipes, `hasLearned`, round 6b cmp7 record; Increment 1 after it ships), P1548 (feedback rename, shared screens; Increment 2 after it ships). P1402 (prepare) · P1183 (membership) · P1389 (closing sequence) · P1010 / P1076 (group join and invite links) · P1562 (migrates the same `org-join-page` loader to `ClarityPageLoader`; whichever lands second reuses it)
