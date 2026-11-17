---
status: week
type: story
rank: 336
workstream: events
created_date: '2026-11-13'
tags: [events, social-hike, registration, preparation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
blocked_by: [p1529]
---

# P1675: A hike asks people to commit to the short introduction before the seat, plus how they'll come and how they'll help

## Problem

**Situation:** A Social Hike's preparation (the short introduction) is optional by design (P1542 decision 1). Registration is one tap. The event room's roster counts only people who opened the room, while the host's event page counts everyone registered.

**Complication:** Optional preparation is skipped. On the 2026-11-08 hike, 4 of 20 registered people finished it and 7 answered the principle question (read-only prod counts, 2026-11-09). Earlier hikes had 0 answers (2026-10-25: 29 registered; 2026-10-11: 16). The founder rated the 11-08 hike 5/10. Two of 20 gave feedback, and asking for it on the spot at the end of the hike felt like pressure. The room's "Undecided" showed a small number while about 13 registered people had no answer, which read as a bug.

> Founder, verbatim: "the current hike, the problem is people didn't do it. Nobody did it. So it was optional."

> Founder, verbatim, on why require it: "if I force them through the preparation, then maybe … I just have more meaningful discussions. It's for me."

**Question:** How does a hike make the short introduction a condition people accept before they hold a seat, without anyone waiting on the day, and collect the help and transport answers the founder now gathers by hand?

**Purpose, as settled in conversation (2026-11-13):** hikes are for the founder's better conversations and enjoyment. They are not expected to spread the practice ("they are tourists … it cannot spread them in that form"). The founder would run them even if nobody joined anything afterwards.

## Appetite

Blast radius: medium. One series' registration, preparation and room (Social Hike); Clarity Night and the mastermind must not change. Reversibility: medium. Hike answers need their own storage (a migration), because P1529's answers table requires mastermind-only columns (`participation`, `phone`, `recording_accepted_at NOT NULL`, verified on P1529's branch, migration `20261105090000`). Decision density: a few; open calls are marked `[FOUNDER DECISION]`.

**Blocked by P1529**, which builds the registration step before the seat (P1529 D16, D24). It is in `/dev` on its own branch and not shipped as of 2026-11-13. This spec reuses that step's shell and its "no seat without the required answers" rule, with hike-specific questions and storage. Hikes do NOT get P1529's recording acceptance, canvas or phone questions.

**What "required" means here:** the person commits to doing the introduction before they get a seat. Finishing it is not a seat condition ("later" gets the seat at once); finishing is encouraged by the reminder, the arrival line and the founder's own measure.

## Solution

### 1. The form before the seat (hikes)

Tapping Reserve on a Social Hike opens P1529's registration form. No seat exists until the required question is answered (P1529's rule).

Founder-approved text (2026-11-13), verbatim:

- Lead line: "This hike is for people who take 10 minutes to learn a few shared words first, so we can have better conversations on the trail. When will you do it?"
- Two options (required, one of them):
  - "I have 10 minutes, I'll do it now" → after the seat, goes straight into the short introduction.
  - "I'll do it later, remind me by email" → seat, then a reminder email before the hike.

Both "10 minutes" (lead line and first option) are the hike introduction's computed length over the hike's own steps (P1549 decision 7: computed, never a literal); the approved wording is the template around that number.

**Registering inside 24 hours:** the 24-hour reminder is only scheduled when start minus 24 h is still in the future (`supabase/functions/send-event-emails/index.ts:104`). `[FOUNDER DECISION: inside 24 h, offer only "now", or keep "later" with no email. Recommendation: only "now", since there is no later.]`

No "come 30 minutes early" option for hikes (founder: he cannot be there early to help everyone).

### 2. "How are you coming?" (asked before the help question)

Car · Motorbike · Bicycle or on foot · I need a ride. Car and motorbike ask how many free seats (0 or more). The form then encourages offering seats or a meet-up point in the hike's WhatsApp group. Transport coordination stays in WhatsApp (P1571 decision 5); the form only collects.

`[FOUNDER DECISION: required or optional. Recommendation: required, because it decides whether a transport lead is needed.]`

### 3. "How would you like to help?" (optional)

Choices: Lead, Sweep, Welcomer, and Transport lead, the last offered only when section 2's answer is "I need a ride" (founder's words). Changing the transport answer away from "I need a ride" clears a Transport lead choice. `[FOUNDER DECISION: whether to add an open "Other" with examples: dog food, sweets for people, a trash bag to collect waste on the way.]`

This reverses P1529 D22 ("nothing about helpers in registration") for hikes only. The founder asked for it on 2026-11-13; the mastermind keeps D22.

Choosing a role shows that role's instructions on the same screen and emails them **once the person holds a seat** (not while on a waiting list). The instructions are app versions of the founder's messages in `docs/events/series/social-hike-roles.md`. They cannot be sent verbatim: Message 2 has placeholders and "See u tomorrow", Message 3 ends with "call another number below" before the hand-pasted driver numbers, and Message 4 is an unapproved draft that asks for a co-organizer, not a welcomer. `[FOUNDER DECISION: approve the app wording of each role's instructions (lead, sweep, welcomer, transport lead), filled only from event fields that exist, with no driver numbers and no "call another number below".]` The offline-map lines (AllTrails, Mapy.com) are asked, never enforced.

The host sees each person's transport answer and help role on the event page.

### 4. The event description

The Social Hike template's opening is a founder ruling of 2026-11-11 ("Everyone welcome. Bring your friends and family.", `docs/events/series/social-hike.md`). `[FOUNDER DECISION: the new opening line, and whether "Bring your friends and family" stays.]` Events already published keep their text unless the founder edits them.

### 5. The room never blocks anyone

The requirement lives only in the registration step. The hike recipe's preparation stays `optional`, so `gatesRoomOnPreparation` stays false for hikes. Late or unprepared people still walk; nobody waits.

### 6. One Undecided number everywhere

The room's Undecided **count** equals the host page's: everyone registered (plus walk-ins in the room) with no principle answer in the room or in the preparation. The room's name list is unchanged (people who opened the room); under it, a count-only line for registered people who have not opened it. No new names reach attendees: the count needs a server-side number, not a list (P1337 2026-10-06: the host alone sees grouped registrations). `[FOUNDER DECISION: the line's wording, e.g. "and 11 registered not here yet".]`

### Not built: host practice (recorded here so the hike runs the same way each time)

- **Arrival:** the founder or welcomer glances at the list privately. To someone who has not finished: "This is for people who finish it. You can still do it today, ideally before dinner, because we might talk about it. For the next one, you really need to." No ban, no assigned partner.
- **One-minute circle** at the meeting point, before walking: hands up for who did the introduction. Game among them only: each gets one armband. Find a real disagreement first, then ask "How well do you think you understood me, 0 to 10?" The person asked gives their armband to the asker. Most armbands at dinner wins. `[FOUNDER DECISION: question wording, checked against the principle.]`
- **Feedback:** no on-the-spot ask. The host sends the event's room link that evening or the next day; after the end, it opens on feedback.
- **Cards:** not on the trail; optionally at dinner.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fewer sign-ups because of the form | ACCEPT | Founder runs hikes for better conversations, not reach |
| People pick "later" and never do it | ACCEPT | Arrival line plus the measure below show it; no enforcement by design |
| Volunteers drop out | ACCEPT | Founder still confirms by hand a few days before (P1571 templates) |
| Transport-lead instructions emailed with driver numbers | MITIGATE | Never include driver numbers; Message 3's numbers stay in the private list and are pasted by hand |
| "Required" switches on the room gate and blocks late arrivals | MITIGATE | Section 5 and its Acceptance Criterion |
| Reverses P1542 decision 1 (hike preparation optional) and decision 10 (no hike email reminder), P1529 D16 (hike registration one tap) and D22 (no helpers in registration, hikes only) | ACCEPT | Founder decided 2026-11-13 after the 11-08 result; P1529's tests asserting one-tap hike registration change with this spec |
| Reverses the 2026-11-11 "Everyone welcome" opening | DEFER | Founder decision in section 4 |
| Logged-out and waiting-list paths skip or mangle hike answers | MITIGATE | Same paths as P1529 D24: answers kept across sign-in, waiting list keeps answers, role email only on a seat; "now" lands in the introduction after the seat on every path |

**Non-Goals**
- Do NOT change Clarity Night's or the mastermind's registration, preparation or room.
- Do NOT build a transport tool, seat matching or ride lists. WhatsApp only.
- Do NOT build anything for the armband game or the arrival line.
- Do NOT add a `/feedback` route.
- Do NOT cancel or remove anyone automatically for not finishing.

## Invariants

- The hike room never stops an unprepared or late person (P1542; this spec section 5).
- Driver phone numbers never leave the private driver list through the app (P1571, `social-hike-roles.md` Message 3).
- A hike seat exists only with the required hike answers, enforced by the server on every path that creates a registration (Reserve, the sign-in return, hidden links), as P1529's invariant does for its flow.
- Hikes never ask for recording acceptance.

## Acceptance Criteria

- [ ] On a Social Hike, Reserve opens the step with the lead line and the two "when" options; no seat exists before the required answers are given.
- [ ] A registration attempt for a hike without the required answers is refused by the server (direct call, not only the form).
- [ ] "I'll do it now" lands in the short introduction right after the seat, including after signing in from logged out; "later" gives the seat and the 24-hour reminder email.
- [ ] Both times shown equal the hike introduction's computed length.
- [ ] Choosing a help role shows that role's approved instructions and emails them once the person holds a seat; no email contains driver phone numbers or "call another number below".
- [ ] Transport lead is offered only when the transport answer is "I need a ride", and is cleared if that answer changes.
- [ ] The host's event page shows each person's when-answer, transport answer with free seats, and help role.
- [ ] A registered person who did not prepare opens the hike room and is not blocked.
- [ ] For one event, the room's Undecided count equals the host page's; the room names no one who has not opened it.
- [ ] Clarity Night registration stays one tap, and the mastermind's step still asks its own questions and recording acceptance (P1529's e2e for registration, sign-in return and waiting list green).
- [ ] The hike template's opening carries the founder's new line.

## How the founder judges it (not a build gate)

After each hike, note: introductions finished out of registered, whether there was a conversation he'd call meaningful, his happiness 0-10, and whether anyone returned. Baseline 2026-11-08: 4 of 20, 5/10, nobody returned. If the score has not moved after 2-3 hikes, drop the requirement.

## Open Questions

1. Children and families: on 11-08 they kept to themselves. No policy now; revisit after 2-3 hikes. Founder: "I don't know if I should have a no children policy or maybe not. I mean, maybe it's fine."
2. Members-only events need none of this: joining already requires the learning (P1549).
3. Answered 2026-11-13: the 24-hour reminder is scheduled for any registration made more than 24 h before the start (`send-event-emails/index.ts:104`); its preparation link appears only with `preparation_enabled` (`_shared/event-dispatch.ts`). `/dev` confirms hikes get the link.
4. Co-organizer (in `social-hike-roles.md`) is not offered in the form: the founder asks that person himself.

## Related

- P1529 (blocker): registration form before the seat, D16, D24.
- P1542: hike recipes, decision 1 (optional prepare) reversed here, decision 10 (no reminder).
- P1549: learning before membership; computed time (decision 7).
- P1571: hike roles and templates; transport stays in WhatsApp (decision 5).
- decisions.md 2026-10-06 (P1337): host alone sees In/Out/Undecided groups; the room roster's lists stay public. This spec changes only the room's count, not who sees the host groups.
