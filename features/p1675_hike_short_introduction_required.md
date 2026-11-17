---
status: in-progress
type: story
rank: 336
workstream: events
created_date: '2026-11-13'
tags: [events, social-hike, clarity-hike, registration, preparation]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1675: A hike asks people to commit to the short introduction before the seat, plus how they'll come and how they'll help

## Problem

**Situation:** A Social Hike's preparation (the short introduction) is optional by design (P1542 decision 1). Registration is one tap. The event room's roster counts only people who opened the room, while the host's event page counts everyone registered.

**Complication:** Optional preparation is skipped. On the 2026-11-08 hike, 4 of 20 registered people finished it and 7 answered the principle question (read-only prod counts, 2026-11-09). Earlier hikes had 0 answers (2026-10-25: 29 registered; 2026-10-11: 16). The founder rated the 11-08 hike 5/10. Two of 20 gave feedback, and asking for it on the spot at the end of the hike felt like pressure. The room's "Undecided" showed a small number while about 13 registered people had no answer, which read as a bug.

> Founder, verbatim: "the current hike, the problem is people didn't do it. Nobody did it. So it was optional."

> Founder, verbatim, on why require it: "if I force them through the preparation, then maybe … I just have more meaningful discussions. It's for me."

**Question:** How does a hike make the short introduction a condition people accept before they hold a seat, without anyone waiting on the day, and collect the help and transport answers the founder now gathers by hand?

**Purpose, as settled in conversation (2026-11-13):** hikes are for the founder's better conversations and enjoyment. They are not expected to spread the practice ("they are tourists … it cannot spread them in that form"). The founder would run them even if nobody joined anything afterwards.

**Every hike becomes a Clarity Hike (founder, 2026-11-17):** with the introduction required, "Social Hike" no longer describes the event. Founder, verbatim: "if people are not willing to do 15 minutes and I'm not charging them, then having random people ... So I guess all hikes become clarity hikes"; on the name: "Clarity Hike for both". Anyone can register; everyone who registers commits to the introduction.

## Appetite

Blast radius: medium. One series' registration, preparation, room and public name; Clarity Night and the mastermind must not change. Reversibility: medium. Hike answers need their own storage (a migration), because P1529's answers table requires mastermind-only columns (`participation`, `phone`, `recording_accepted_at` all `NOT NULL`, migration `20261105090000`, re-verified on main 2026-11-17). Decision density: settled; the founder answered every open call on 2026-11-17.

**P1529 shipped (closed 2026-11-16).** Its registration step before the seat exists on main and switches on only for the sales-mastermind flow: the client's `asksBeforeSeat`, and the server trigger `_event_rsvps_need_answers` keyed on `_event_flow(...) = 'sales-mastermind'`. This spec reuses that step's shell and its "no seat without the required answers" rule, with hike-specific questions and storage. Hikes do NOT get P1529's recording acceptance, canvas or phone questions. Note: in P1529, "seat" also names a place at a round table; in this spec "seat" means a registration (a place on the hike).

**What "required" means here:** the person commits to doing the introduction before they get a seat. Finishing it is not a seat condition ("later" gets the seat at once); finishing is encouraged by the reminder, the arrival line and the founder's own measure.

## Solution

### 1. The form before the seat (hikes)

Tapping Reserve on a hike opens P1529's registration form. No seat exists until the required questions are answered (P1529's rule).

Founder-approved text (2026-11-13), verbatim:

- Lead line: "This hike is for people who take 10 minutes to learn a few shared words first, so we can have better conversations on the trail. When will you do it?"
- Two options (required, one of them):
  - "I have 10 minutes, I'll do it now" → after the seat, goes straight into the short introduction.
  - "I'll do it later, remind me by email" → seat, then a reminder email before the hike.

Both "10 minutes" (lead line and first option) are the hike introduction's computed length over the hike's own steps (P1549 decision 7: computed, never a literal); the approved wording is the template around that number. Since P1685 (2026-11-16) every preparation, hikes included, carries the Listening Game step, so the computed length is larger than when this text was approved; the template absorbs it.

**Registering inside 24 hours (founder, 2026-11-17):** only "I have N minutes, I'll do it now" is offered, because the 24-hour reminder is scheduled only when start minus 24 h is still in the future (`supabase/functions/send-event-emails/index.ts`, the `reminderScheduledAt > now` check). The server applies the same rule: a "later" answer inside 24 h is refused.

No "come 30 minutes early" option for hikes (founder: he cannot be there early to help everyone).

### 2. "How are you coming?" (required, asked before the help question)

Car · Motorbike · Bicycle or on foot · I need a ride. Car and motorbike ask how many free seats (0 or more). Required to get a seat (founder, 2026-11-17), enforced by the server like the when-answer.

When the answer is Car or Motorbike with 1 or more free seats, the form shows, under the seats answer: "Post your free seats in the hike's WhatsApp group, so people can ride with you." The same line goes in that person's confirmation email. Founder's ask, 2026-11-17: "encouraging them ... that they post in the WhatsApp group if they have places ... because some people might just join them". Transport coordination stays in WhatsApp (P1571 decision 5); the form only collects and nudges.

### 3. "How would you like to help?" (optional)

Choices: Lead, Sweep, Welcomer, Transport lead, and Other. Transport lead is offered only when section 2's answer is "I need a ride" (founder's words); changing the transport answer away from "I need a ride" clears a Transport lead choice. Other opens one short free-text box with the placeholder "For example: dog food for the trail dogs, sweets to share, a bag to collect rubbish on the way" (founder, 2026-11-17). Other has no instructions and sends no role email.

This reverses P1529 D22 ("nothing about helpers in registration") for hikes only. The founder asked for it on 2026-11-13; the mastermind keeps D22.

Choosing a role shows that role's instructions on the same screen and emails them **once the person holds a seat** (not while on a waiting list). Founder-approved wording (2026-11-17), verbatim; it is the app version of the founder's messages in `docs/events/series/social-hike-roles.md`, with no placeholders, no driver numbers and no "call another number below":

- **Lead:** "You set the pace at the front and wait at every junction until the sweep catches up. If someone wants to go faster, let them go; just ask them to have the route on their phone."
- **Sweep:** "You walk behind the last person, so nobody is left alone at the back. Let someone stay behind alone only if they clearly have water, the map on their phone, and know the way back. If you're not sure, stay with them or walk them back to the group at an easy pace."
- Lead and Sweep both end with: "Before the hike, on wifi: install AllTrails and open the route from the event page, and save the area offline in Mapy.com as a backup. Bring a charged phone, and a power bank if you have one."
- **Welcomer:** "You greet people as they arrive at the meeting point, so nobody stands around lost."
- **Transport lead:** "You help people who need a ride get there together. In the hike's WhatsApp group, say you're the transport lead and ask who wants a seat. Agree a price with a driver (ask whether waiting all day or coming back at the end is cheaper), post the pickup point, time and price in the group, and collect the money for both ways before anyone gets in. Slava sends you driver numbers if you need them."

The offline-map lines are asked, never enforced.

The host sees each person's when-answer, transport answer with free seats, help role and Other text on the event page.

### 4. The name and the event description

**Name (founder, 2026-11-17):** the series' public name becomes "Clarity Hike". `docs/events/series/social-hike.md` `title_prefix` becomes "Clarity Hike", so new events are titled "Clarity Hike: {trail_name}", and the series' visible label in the app reads "Clarity Hike". The internal series id stays `social-hike`, so recipes, flows, migrations and the `/hike` short link (alias rule `%Hike%`, `20261106164500_p1649_series_alias_resolution.sql`) keep working unchanged.

Three consumers match hikes by exact title prefix, and the 2026-08-24 rename broke them silently (`social-hike.md`, Link discipline). `/hike` matches `%Hike%` and survives. The others must match both "Social Hike" and "Clarity Hike" after this change: the WhatsApp group-chat mapping in `.private/event-channels.json`, and the hike skills that read the prefix (`publish-run`, `select-hike`, `promote-all`). The skill files and the gitignored JSON are edited on main (skill Branch Guard), not on this branch.

**Opening line (founder, 2026-11-17):** the template's opening "Everyone welcome. Bring your friends and family." (ruling of 2026-11-11) becomes "A hike for people who do a short introduction first, so we have better conversations on the trail. Children welcome with a registered adult." No minutes in the description text. Events already published keep their title and text unless the founder edits them.

### 5. The room never blocks anyone

The requirement lives only in the registration step. The hike recipe's preparation stays `optional`, so `gatesRoomOnPreparation` stays false for hikes. Late or unprepared people still walk; nobody waits.

### 6. One Undecided number everywhere

The room's Undecided **count** equals the host page's: everyone registered (plus walk-ins in the room) with no principle answer in the room or in the preparation. The room's name list is unchanged (people who opened the room); under it, a count-only line for registered people who have not opened it, worded "and {N} registered, not here yet" (founder, 2026-11-17), shown only when N is 1 or more. No new names reach attendees: the count needs a server-side number, not a list (P1337 2026-10-06: the host alone sees grouped registrations).

### Not built: host practice (recorded here so the hike runs the same way each time)

- **Arrival:** the founder or welcomer glances at the list privately. To someone who has not finished: "This is for people who finish it. You can still do it today, ideally before dinner, because we might talk about it. For the next one, you really need to." No ban, no assigned partner.
- **One-minute circle** at the meeting point, before walking: hands up for who did the introduction. Game among them only: each gets one armband. Find a real disagreement first, then ask "How well do you think you understood me, 0 to 10?" The person asked gives their armband to the asker. Most armbands at dinner wins. `[FOUNDER DECISION: question wording, checked against the principle. Not a build input.]`
- **Feedback:** no on-the-spot ask. The host sends the event's room link that evening or the next day; after the end, it opens on feedback.
- **Cards:** not on the trail; optionally at dinner.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fewer sign-ups because of the form and the new opening line | ACCEPT | Founder runs hikes for better conversations, not reach |
| People pick "later" and never do it | ACCEPT | Arrival line plus the measure below show it; no enforcement by design |
| Volunteers drop out | ACCEPT | Founder still confirms by hand a few days before (P1571 templates) |
| Transport-lead instructions emailed with driver numbers | MITIGATE | Never include driver numbers; Message 3's numbers stay in the private list and are pasted by hand |
| "Required" switches on the room gate and blocks late arrivals | MITIGATE | Section 5 and its Acceptance Criterion |
| Renaming the title prefix silently breaks the group-chat mapping or the hike skills, as on 2026-08-24 | MITIGATE | Section 4: every exact-prefix consumer matches both names; `/hike` verified on `%Hike%` |
| Reverses P1542 decision 1 (hike preparation optional) and decision 10 (no hike email reminder), P1529 D16 (hike registration one tap) and D22 (no helpers in registration, hikes only), and the 2026-11-11 "Everyone welcome" opening | ACCEPT | Founder decided 2026-11-13 and 2026-11-17 after the 11-08 result; P1529's tests asserting one-tap hike registration change with this spec |
| Logged-out and waiting-list paths skip or mangle hike answers | MITIGATE | Same paths as P1529 D24: answers kept across sign-in, waiting list keeps answers, role email only on a seat; "now" lands in the introduction after the seat on every path |
| The privacy page still says "Social Hikes" | DEFER | Legal text changes with the next policy version; filed as a follow-up, not changed here |

**Non-Goals**
- Do NOT change Clarity Night's or the mastermind's registration, preparation or room.
- Do NOT build a transport tool, seat matching or ride lists. WhatsApp only.
- Do NOT build anything for the armband game or the arrival line.
- Do NOT add a `/feedback` route.
- Do NOT cancel or remove anyone automatically for not finishing.
- Do NOT build members-only events (who may register). The app has no such setting today, only hidden (link-only) events; the founder's direction of 2026-11-17 (visible to everyone, only members can register, non-members invited to become members) is a separate spec.
- Do NOT rename the internal series id `social-hike` or retitle published events.

## Invariants

- The hike room never stops an unprepared or late person (P1542; this spec section 5).
- Driver phone numbers never leave the private driver list through the app (P1571, `social-hike-roles.md` Message 3).
- A hike seat exists only with the required hike answers (when, and how you're coming), enforced by the server on every path that creates a registration (Reserve, the sign-in return, hidden links), as P1529's invariant does for its flow.
- Hikes never ask for recording acceptance.

## Acceptance Criteria

- [ ] On a hike, Reserve opens the step with the lead line, the two "when" options and the transport question; no seat exists before the required answers are given.
- [ ] A registration attempt for a hike without the when-answer or the transport answer is refused by the server (direct call, not only the form).
- [ ] Inside 24 hours of the start, only "do it now" is offered, and the server refuses a "later" answer.
- [ ] "I'll do it now" lands in the short introduction right after the seat, including after signing in from logged out; "later" gives the seat and the 24-hour reminder email.
- [ ] Both times shown equal the hike introduction's computed length.
- [ ] Car or Motorbike with 1 or more free seats shows the WhatsApp free-seats line in the form and in the confirmation email; 0 seats or other answers show neither.
- [ ] Choosing a help role shows that role's approved instructions and emails them once the person holds a seat; no email contains driver phone numbers or "call another number below".
- [ ] Transport lead is offered only when the transport answer is "I need a ride", and is cleared if that answer changes.
- [ ] Other opens a free-text box with the approved examples; it sends no role email.
- [ ] The host's event page shows each person's when-answer, transport answer with free seats, help role and Other text.
- [ ] A registered person who did not prepare opens the hike room and is not blocked.
- [ ] For one event, the room's Undecided count equals the host page's; the line "and {N} registered, not here yet" shows the not-opened count; the room names no one who has not opened it.
- [ ] Clarity Night registration stays one tap, and the mastermind's step still asks its own questions and recording acceptance (P1529's e2e for registration, sign-in return and waiting list green).
- [ ] The hike template's title prefix is "Clarity Hike" and its opening is the founder's new line; the app's visible series label reads "Clarity Hike".
- [ ] `/hike`, the group-chat mapping and the hike skills resolve both a "Social Hike: …" and a "Clarity Hike: …" event.

## How the founder judges it (not a build gate)

After each hike, note: introductions finished out of registered, whether there was a conversation he'd call meaningful, his happiness 0-10, and whether anyone returned. Baseline 2026-11-08: 4 of 20, 5/10, nobody returned. If the score has not moved after 2-3 hikes, drop the requirement.

## Open Questions

1. Answered 2026-11-17: children and families. The opening line welcomes children with a registered adult; each adult registers and does the introduction. Revisit after 2-3 hikes.
2. Members-only hikes: out of scope (Non-Goals). Members already did the learning (P1549), so a members-only hike would need none of this form's "when" question.
3. Answered 2026-11-13: the 24-hour reminder is scheduled for any registration made more than 24 h before the start (`send-event-emails/index.ts`); its preparation link appears only with `preparation_enabled` (`_shared/event-dispatch.ts`). `/dev` confirms hikes get the link.
4. Co-organizer (in `social-hike-roles.md`) is not offered in the form: the founder asks that person himself.

## Related

- P1529 (shipped 2026-11-16): registration form before the seat, D16, D22, D24.
- P1542: hike recipes, decision 1 (optional prepare) reversed here, decision 10 (no reminder).
- P1549: learning before membership; computed time (decision 7).
- P1571: hike roles and templates; transport stays in WhatsApp (decision 5).
- P1649: series short links; `/hike` matches `%Hike%`.
- P1685: the Listening Game step in every preparation, hikes included.
- decisions.md 2026-10-06 (P1337): host alone sees In/Out/Undecided groups; the room roster's lists stay public. This spec changes only the room's count, not who sees the host groups.
