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

Blast radius: medium, touches registration, the room, feedback end, and the join flow. Reversibility: medium, copy and flow changes plus possibly one flag on the profile for "learned". Decision density: one open founder call (existing members), rest decided 2026-10-22.

## Founder decisions (2026-10-22)

1. Rename "prepare" to learning: "learn what this community is, then decide".
2. Joining the community requires the learning first. Same content, two entry messages:
   - Just registered: told it is optional.
   - Tapped "Join as member": told kindly it takes about 5 minutes to learn first, and why, then decides.
3. Per-event principle opt-in keeps Opted in / Opted out / Undecided. Not learning = Undecided, never auto opted-out.
4. Members re-confirm each event with one tap. The room celebrates "today N members here, N people trying it".
5. End of feedback: if the person did not learn, invite them to learn.
6. Copy per series lives in the series recipe (P1542); events without a series use Clarity Night's.

[FOUNDER DECISION: existing members who never did the learning. Recommendation: keep them as members (no countdown, no pending state) and invite them once to do the learning; the founder can remove anyone who does not follow the principles; no quiz or verification. Founder leaning matches. Default applied 2026-10-24 (told to the founder, who may overturn it).]

## Already built by P1542 round 5 (2026-10-23, branch `feature/p1542-series-recipes`, not yet shipped)

Read this before building. It narrows what is left here.

- **"Learned" is one rule:** `hasLearned(parts, completedAt)` (`src/app/prototypes/events/prep/prep-plan.ts:101`). It is true when this event's learning is complete, or when the once-per-person parts (the cognitive-understanding video and the cmp7 statements) were completed in any event's learning or in the general `/prepare`.
- **The event-side join gate exists.** On a hike's feedback thank-you, a non-learner's "Join" opens the learning in the room frame. The header reads "Joining <community> · Part 1 of 2 · Short introduction". The learning ends on the group terms, "Part 2 of 2". A learner goes straight to the terms (`EventClosePage.tsx:886-905`, `EventPrepPage.tsx:211-214, 544-553`).
- **Not built:** the groups page. `/groups/:slug/join` shows the terms and "Accept terms & join" to every non-member, learned or not (`src/app/pages/org-join-page.tsx:210-305`, measured 2026-10-24).

## Founder UAT round 6 (2026-10-24): joining from the groups page

The founder asked several times to *see* this. A person on `/groups/:slug` taps "Join as member" (`org-page.tsx:236-240`, which goes to `/groups/:slug/join`). They have not learned, or have learned only part.

7. **Learn first, said kindly, with the reason and the real length.** It is the same three steps as the hike learning: the cognitive-understanding story, the principle, the cmp7 statements, about 6 minutes, computed. Decision 2's "same content, two entry messages" means no separate join curriculum.
8. **Resume where they stopped.** A partial learner sees the steps already done ticked and continues at the first undone one.
9. **Learned anywhere means straight to the terms.** The rule is `hasLearned`, the same one as decision 2's join gate on the event side.
10. **The terms are "Part 2 of 2"** only for someone who came through Part 1 in this visit, otherwise "Group terms" (the P1542 round-5c rule). The primary reads **"Accept and join"**, the same words as the event flow. Today it reads "Accept terms & join".
11. **Signed out works the same.** The learning runs signed out (P1402: parts are held in the browser and join the account at sign-in). "Accept and join" then goes to sign-up with `action=join-org`, as today.
12. [FOUNDER DECISION, default applied 2026-10-24 and told to the founder, who may overturn it: can a non-learner READ the group terms without joining? Default **A**.
    - **A:** yes. The About tab's "Clarity Group Terms" link opens them read-only, and the terms page's button reads "Join <group>" and leads into the learning. Only accepting is gated.
    - **B:** no. The terms appear only after learning.
    - Recommendation: **A**. The terms are linked publicly from the About tab today (`org-page.tsx:506`). The round-5 rule "nobody reaches the terms without learning" was about joining, and A keeps that.]

### The screens (1440 and phone; same stack, narrower)

**Part 1, not learned** (`/groups/:slug/join`, signed in or out, not a member, `!hasLearned`):

```
← Back                                                  shell top bar (fallback: /groups/:slug)
Joining Clarity Practice Community                      text-sm font-semibold
Part 1 of 2 · Learn how we meet                         text-xs muted

Before you join: 6 minutes to learn how we meet         h1 text-2xl
Members make one promise to each other: to say          text-base muted (3 lines max)
honestly how well they understood. See what that
means first, then decide if it is for you.

 1  Learn the definition of cognitive understanding        1 min
 2  Decide about your participation in a new social norm   2 min
 3  Share your view on the expected benefits               3 min

            [ Start learning ]                          the one primary (blue), max-w-sm, centred
```

**Part 1, partially learned:**
- Title "Welcome back: about N minutes left".
- Done rows show a check, muted.
- Button "Continue".

**The learning.** It is the standalone `/prepare` (P1402) restricted to `story, principle, cmp7`, opened with `?then=join&group=<slug>`:
- Header: the same join context, "Joining <group> · Part 1 of 2", with the back arrow inline. That is the P1542 round-5d pattern, not the standalone list header.
- Step Back goes to the previous learning screen. The first screen's Back goes to `/groups/<slug>/join`, with `replace`.
- The finish goes to `/groups/<slug>/join` with route state `{ joinViaLearning: true }`. No end screen in between: the terms are the next step.
- The general `/prepare` opened on its own keeps its four steps and its own end.

**Part 2, the terms** (a learner, or arriving from Part 1):
- Heading "Join <group short name>" (the round-4 short-name rule: up to " · ").
- Subtitle: the COA intro.
- The certificate.
- "Accept and join" (primary), with "Back" as the centred link under it.
- The header line "Part 2 of 2 · Group terms" appears only with `joinViaLearning`.

**Member:** unchanged: the read-only terms they accepted, with "Back to <group>".

### Open item that blocks nothing here

The existing-members FOUNDER DECISION (members who never learned) runs on its default (keep them, invite them once) until the founder answers. It also decides whether such a member is invited to learn anywhere, e.g. the hike registration thank-you, which P1542 round 6 hides for members.

## Solution

- **Rename** user-visible "prepare/preparation" to learning wording in the room, event page and route (`/events/:slug/prepare` redirects to the new route; route name is a copy call for `/dev` to propose).
- **Two entry messages, one content.** The learning page reads its entry context (from registration vs from "Join as member") and shows the matching intro. Completing it from the join entry ends at the membership decision.
- **Join gate.** "Join as member" for someone who has not learned routes to learning first; someone who has learned joins directly. "Learned" is recorded once per person (where it lives is `/dev`'s call; reuse existing completion data if P1402 already records it).
- **Per-event opt-in.** Members see a one-tap re-confirm for the event's principles. The room shows the count line "today N members here, N people trying it".
- **Feedback end.** If the person has not learned, the last feedback screen invites them to learn.
- **Groups-page join gate (decisions 7-12).** `/groups/:slug/join` decides the screen in this order:
  - **member:** read-only terms (unchanged);
  - **`hasLearned`:** terms;
  - **started:** Part 1 resume;
  - **otherwise:** Part 1.
  `hasLearned` needs no event. It reads the person's `person_prep_parts` (`event-prep-service.ts:179`) plus, signed out, the browser's local parts (`prep-local-parts.ts`). `usePrepState` today requires an event, so `/dev` adds a small event-free read and reuses `hasLearned` itself; it does not copy the rule. The learning is `PreparePage` with a step filter and a `then=join` context. There is no new route and no new content.
  - **Risk, ACCEPT:** a hand-crafted `/signup?redirect=…&action=join-org` link can still auto-join without learning (`AuthCallbackPage`). The gate is client-side by design (Non-Goals: no quiz or verification). The founder can remove anyone.

## Hypothesis (UNTESTED)

Requiring the learning before membership yields members who come back. **Falsifier:** if joins fall near zero over about 2 months, and learned members do not return to a second event at a higher rate than non-members, loosen the requirement. Record in `docs/hypotheses.md` via `/docs-strategy-update` when this ships.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The gate kills joins | ACCEPT | It is the bet; the falsifier above names when to loosen it |
| Existing members feel demoted | MITIGATE | Pending founder decision; recommended path keeps them as members |
| Counts in the room expose who is not a member | ACCEPT | Aggregate numbers only, no names |
| Lands before P1548 and conflicts on room/feedback screens | MITIGATE | Start after P1548 ships |

**Non-Goals**
- Do NOT add a quiz, test or verification of the learning.
- Do NOT auto opt-out anyone.
- Do NOT write new learning content; reuse the existing preparation content.
- Do NOT change membership levels or gated events (P1183).

## Acceptance Criteria

- [ ] No user-visible "prepare/preparation" wording remains; the old route redirects.
- [ ] A just-registered attendee opening the learning sees the "optional" intro.
- [ ] A person who has not learned and taps "Join as member" sees the ~5-minute intro with the reason, and can join only after finishing.
- [ ] A person who has learned joins directly.
- [ ] A person who did not learn shows as Undecided for the event, never Opted out.
- [ ] A member sees a one-tap re-confirm for the event; the room shows "today N members here, N people trying it" with correct counts.
- [ ] The last feedback screen invites a not-yet-learned person to learn; a learned person does not see the invite.
- [ ] A Social Hike event shows its recipe's copy; an event with no series shows Clarity Night's.
- [ ] Existing members are handled per the founder decision above.
- [ ] Signed in, not a member, no learning parts: "Join as member" on `/groups/cm` shows Part 1:
  - "Joining Clarity Practice Community · Part 1 of 2 · Learn how we meet";
  - the title "Before you join: N minutes to learn how we meet", with N computed;
  - the reason line;
  - the three steps with their minutes;
  - one primary, "Start learning".
  No terms and no "Accept" are on the screen.
- [ ] Starting the learning keeps the join context header. Finishing the third step lands on the terms with "Part 2 of 2 · Group terms" and "Accept and join". Accepting creates the membership (a `membership` row) and returns to the group page with the joined banner.
- [ ] Leaving after step 1 and tapping "Join as member" again shows "Welcome back: about N minutes left", step 1 ticked and "Continue". Continuing opens step 2.
- [ ] A person who learned in any event's learning or in `/prepare` (both once-per-person parts completed) goes straight to the terms, titled "Group terms" with no "Part 2 of 2".
- [ ] A member sees the read-only terms (unchanged; existing org-join e2e green).
- [ ] Signed out: the same Part 1, then the learning, then the terms. "Accept and join" goes to sign-up with `action=join-org`. After sign-up the person is a member, and their learning parts are on their account.
- [ ] Every link and button on Part 1, the learning header and the terms is within 2px of its container's centre at 1440, 375 and 320 (screen-review brief v2 snippet output pasted).
- [ ] Per founder decision 12: (A) the About tab's terms link shows the terms read-only with "Join <group>" leading into Part 1; or (B) it shows Part 1.

## Related

Depends on: P1542 (recipes), P1548 (feedback rename, shared screens; land after). P1402 (prepare) · P1183 (membership) · P1389 (closing sequence)
