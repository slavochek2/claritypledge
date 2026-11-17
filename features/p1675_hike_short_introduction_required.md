---
status: qa
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
spec_review_hash: 8308a9f28b15c6660c58b677ad30f8e2986d465491e3b8ae540b312436a8d189
spec_review_vendors: [codex, gemini, openrouter]
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

Blast radius: medium. One series' registration, preparation, emails, room count and public name; Clarity Night and the mastermind must not change. Reversibility: medium. Hike answers need their own storage (a migration), because P1529's answers table requires mastermind-only columns (`participation`, `phone`, `recording_accepted_at` all `NOT NULL`, migration `20261105090000`, re-verified on main 2026-11-17). Decision density: settled; the founder answered every open call on 2026-11-17, and the spec review's findings (2026-11-17, four reviewers) are folded in below.

**P1529 shipped (closed 2026-11-16).** Its registration step before the seat switches on only for the sales-mastermind flow, on both sides: the client's `registrationQuestions` recipe field (which drives `asksBeforeSeat`), and the server's `_event_rsvps_need_answers` trigger and `register_for_event` RPC, both keyed on `_event_flow(...) = 'sales-mastermind'`. `register_for_event` also refuses any other flow ("this event does not ask questions") and requires `p_recording_accepted`. So hikes need their own server entry point; this spec reuses the step's form shell and its "no seat without the required answers" rule, not its RPC, tables or mastermind behaviours. In P1529, "seat" also names a place at a round table; in this spec "seat" means a registration (a place on the hike).

**What "required" means here:** the person commits to doing the introduction before they get a seat. Finishing it is not a seat condition ("later" gets the seat at once); finishing is encouraged by the reminder, the arrival line and the founder's own measure.

**Prod state, read-only 2026-11-17:** every hike on prod has `preparation_enabled = false`, `max_attendees = null` and `flow = null`; the latest is 2026-11-08, and no upcoming hike is published.

## Solution

### 0. What counts as a hike

The server and the client key everything in this spec on the event's flow being `social-hike` (`_event_flow(event)`, which falls back to `series_slug`). The internal id stays `social-hike` after the rename (section 4). The rules apply to registrations created after the deploy; registrations that already exist are kept as they are, including when a host switches an event into or out of the hike flow (no flow guard is added for hikes).

### 1. The form before the seat (hikes)

Tapping the hike's Reserve button ("Reserve a seat", unchanged) opens the registration form. No seat exists until the required questions are answered.

Founder-approved text (2026-11-13), verbatim:

- Lead line: "This hike is for people who take 10 minutes to learn a few shared words first, so we can have better conversations on the trail. When will you do it?"
- Two options (required, one of them):
  - "I have 10 minutes, I'll do it now" → after the seat, goes straight into the short introduction.
  - "I'll do it later, remind me by email" → seat, then a reminder email before the hike.

Both "10 minutes" (lead line and first option) are the hike introduction's computed length over the hike's own steps (P1549 decision 7: computed, never a literal); the approved wording is the template around that number. Since P1685 (2026-11-16) every preparation, hikes included, carries the Listening Game step, so the computed length is larger than when this text was approved; the template absorbs it.

**Registering inside 24 hours (founder, 2026-11-17):** only "I have N minutes, I'll do it now" is offered. "Later" is valid only when the server's current time is strictly earlier than the event start minus 24 hours 30 minutes. The reminder is due at start minus 24 hours (`send-event-emails/index.ts`, `reminderScheduledAt > now`), and the dispatcher runs every 30 minutes and only picks up reminders still ahead (`dispatch-event-emails`), so the extra 30 minutes is what makes the promised reminder certain (build review, 2026-11-17). The client hides "later" by the same rule; the server is the authority. A form opened before the cutoff and submitted after it is refused with a distinct code (`now_only`), and the client redraws the form with only "now", keeping the other answers.

**Hike behaviour of the form, not the mastermind's:** the recipe's registration field becomes a kind (`'mastermind' | 'hike'`), so a hike gets only what this spec lists. A hike gets: the form, its answers' draft across sign-in, "now" landing in the introduction after the seat, and the button label "Reserve a seat". A hike does not get: the places-left line, the waiting list, the mastermind arrival read, recording acceptance, canvas or phone questions.

No "come 30 minutes early" option for hikes (founder: he cannot be there early to help everyone).

### 2. "How are you coming?" (required, asked before the help question)

Car · Motorbike · Bicycle or on foot · I need a ride. Car and motorbike ask how many free seats (a whole number from 0 to 20, required for those two, empty for the others). Required to get a seat (founder, 2026-11-17), enforced by the server like the when-answer.

When the answer is Car or Motorbike with 1 or more free seats, the form shows, under the seats answer: "Post your free seats in the hike's WhatsApp group, so people can ride with you." The same line goes in that person's confirmation email. Founder's ask, 2026-11-17: "encouraging them ... that they post in the WhatsApp group if they have places ... because some people might just join them". Transport coordination stays in WhatsApp (P1571 decision 5); the form only collects and nudges.

### 3. "How would you like to help?" (optional)

Choices: Lead, Sweep, Welcomer, Transport lead, and Other. Transport lead is offered only when section 2's answer is "I need a ride" (founder's words); changing the transport answer away from "I need a ride" clears a Transport lead choice, and the server refuses Transport lead with any other transport answer. Other opens one short free-text box (1 to 280 characters after trimming, required when Other is chosen, empty otherwise) with the placeholder "For example: dog food for the trail dogs, sweets to share, a bag to collect rubbish on the way" (founder, 2026-11-17). Other has no instructions and sends no role email.

This reverses P1529 D22 ("nothing about helpers in registration") for hikes only. The founder asked for it on 2026-11-13; the mastermind keeps D22.

Choosing a role shows that role's instructions on the same screen and emails them once, when the seat is created. Founder-approved wording (2026-11-17), verbatim; it is the app version of the founder's messages in `docs/events/series/social-hike-roles.md`, with no placeholders, no driver numbers and no "call another number below":

- **Lead:** "You set the pace at the front and wait at every junction until the sweep catches up. If someone wants to go faster, let them go; just ask them to have the route on their phone."
- **Sweep:** "You walk behind the last person, so nobody is left alone at the back. Let someone stay behind alone only if they clearly have water, the map on their phone, and know the way back. If you're not sure, stay with them or walk them back to the group at an easy pace."
- Lead and Sweep both end with: "Before the hike, on wifi: install AllTrails and open the route from the event page, and save the area offline in Mapy.com as a backup. Bring a charged phone, and a power bank if you have one."
- **Welcomer:** "You greet people as they arrive at the meeting point, so nobody stands around lost."
- **Transport lead:** "You help people who need a ride get there together. In the hike's WhatsApp group, say you're the transport lead and ask who wants a seat. Agree a price with a driver (ask whether waiting all day or coming back at the end is cheaper), post the pickup point, time and price in the group, and collect the money for both ways before anyone gets in. Slava sends you driver numbers if you need them."

The offline-map lines are asked, never enforced.

The host sees each person's when-answer, transport answer with free seats, help role and Other text on the event page. Other text renders as plain text everywhere, never as HTML, and is never put in an email.

### 3b. Who reads the answers, and their lifecycle

- Storage: a new table for hike answers, one row per event and person. Clients cannot write it directly; the hike registration RPC writes it, bound to `auth.uid()`. Read: the person's own row and the event's host only (same rule as P1529's `own or host reads registration answers`). Anonymous users and other attendees read nothing. Enumerated values and the free-seats and Other limits are database checks, not only form rules.
- The server trigger refuses a hike registration without an answers row, on every insert path: the RPC, a direct insert of a person's own row, and the sign-in return.
- Cancelling a hike registration deletes that person's hike answers, so registering again asks again (and applies the 24-hour rule again).
- Answers are not editable after the seat in this spec; a change goes through WhatsApp or cancel-and-register-again.
- Under the form, one line: "Only you and the host see these answers." Hike registration collects new kinds of personal data (how people travel, free text); the privacy page update is deferred (Risks), and this line is the collection notice until then.

### 3c. Emails

- Every hike registration gets the confirmation email as today; it carries the introduction link and, for a driver with free seats, the WhatsApp line (section 2) and, for a chosen role, that role's instructions (section 3).
- The 24-hour reminder is already scheduled for every registration made more than 24 h before the start (`send-event-emails/index.ts`), "now" and "later" alike. On a hike it carries the introduction link and preparation wording.
- Today both links depend on `events.preparation_enabled` (`_shared/event-dispatch.ts`, the reminder; `send-event-emails/index.ts`, the confirmation's Prepare now), and every hike on prod has it false. The emails use the same rule as the client's `offersPreparation`: preparation is offered when the flag is on or the event is a hike. The stored flag is not changed or backfilled, so the room gate (`gatesRoomOnPreparation`, flag on AND preparation not optional) stays false for hikes.
- If a hike is moved so that its reminder time has passed, the reminder is cleared as today (ACCEPT, Risks).

### 4. The name and the event description

**Name (founder, 2026-11-17):** the series' public name becomes "Clarity Hike". New events are titled "Clarity Hike: {trail_name}", and the series' visible label in the app reads "Clarity Hike". The internal series id stays `social-hike`, so recipes, flows, migrations and the `/hike` short link keep working.

Title-prefix consumers, checked 2026-11-17:

- `/hike` and the short-link redirect (`api/series-redirect.ts` → `resolve_series_alias`) match `%Hike%` (seed `20261106164500_p1649_series_alias_resolution.sql`): no change. The live prod row is closed to the public key and is confirmed read-only during `/dev`.
- The WhatsApp group-chat mapping (`.private/event-channels.json`) and `promote-all.md` already match both "Social Hike" and "Clarity Hike": no change.
- `publish-run.md` hard-codes the "Social Hike:" prefix (step 3 and the title template) instead of reading `title_prefix`: change to "Clarity Hike:".
- `re-create-event.md` finds the previous event by the exact `title_prefix`: after the rename it must find a hike titled with either prefix.
- `docs/events/series/social-hike.md`: `title_prefix`, the `promo_summary` and promo template lines that say "Everyone welcome", and the 2026-11-11 opening rule are updated.

The skill files are edited on main (skill Branch Guard), not on this branch; the series doc moves with this branch.

**Opening line (founder, 2026-11-17):** the template's opening "Everyone welcome. Bring your friends and family." (ruling of 2026-11-11) becomes "A hike for people who do a short introduction first, so we have better conversations on the trail. Children welcome with a registered adult." No minutes in the description text. Events already published keep their title and text unless the founder edits them.

### 4b. The thank-you page's next-event offer

The close page's "Reserve my place" registers in one tap for the host's next event (`EventClosePage.tsx`, `rsvpToEvent`). When that next event is a hike, it opens the hike's event page with the form instead of registering directly.

### 5. The room never blocks anyone

The requirement lives only in the registration step. The hike recipe's preparation stays `optional`, so `gatesRoomOnPreparation` stays false for hikes. Late or unprepared people still walk; nobody waits.

### 6. One Undecided number for the host

Today the room's Undecided counts room members (people who opened the room, walk-ins included), while the host page groups registrations only, and on hikes shows no groups at all because they depend on `preparation_enabled`.

- **One population, one formula, computed on the server:** distinct people who are registered or are room members, the host excluded, each counted once; a person is In, Out or Undecided by their principle answer in the room or in the preparation, the room answer winning when both exist. The host's event page groups and the host's view of the room both read this one result, and on hikes the host page shows its groups (same "offers preparation" rule as section 3c).
- **Attendees** see the room as today (Undecided over the room's members), plus, when N is 1 or more, the count-only line "and {N} registered, not here yet" (founder, 2026-11-17), where N is registered people who have not opened the room. Attendees never see the merged Undecided count: combined with the public participants list, it would tell them which absent people are undecided, which P1337 (decisions.md 2026-10-06) keeps for the host alone.
- The count is returned by an RPC that requires a signed-in caller who can see the event; it returns numbers, never names.

### Not built: host practice (recorded here so the hike runs the same way each time)

- **Arrival:** the founder or welcomer glances at the list privately. To someone who has not finished: "This is for people who finish it. You can still do it today, ideally before dinner, because we might talk about it. For the next one, you really need to." No ban, no assigned partner.
- **One-minute circle** at the meeting point, before walking: hands up for who did the introduction. Game among them only: each gets one armband. Find a real disagreement first, then ask "How well do you think you understood me, 0 to 10?" The person asked gives their armband to the asker. Most armbands at dinner wins. The founder words the question himself on the day, checked against the principle; it is not a build input.
- **Feedback:** no on-the-spot ask. The host sends the event's room link that evening or the next day; after the end, it opens on feedback.
- **Cards:** not on the trail; optionally at dinner.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fewer sign-ups because of the form and the new opening line | ACCEPT | Founder runs hikes for better conversations, not reach |
| People pick "later" and never do it | ACCEPT | Arrival line plus the measure below show it; no enforcement by design |
| Volunteers drop out | ACCEPT | Founder still confirms by hand a few days before (P1571 templates) |
| Transport-lead instructions emailed with driver numbers | MITIGATE | Never include driver numbers; Message 3's numbers stay in the private list and are pasted by hand |
| "Required" switches on the room gate and blocks late arrivals | MITIGATE | The stored flag is untouched (section 3c); section 5 and its Acceptance Criterion |
| Renaming the title prefix silently breaks a prefix consumer, as on 2026-08-24 | MITIGATE | Section 4 lists every consumer checked; `re-create-event` and `publish-run` change |
| A cancel-then-direct-insert keeps a stale "later" answer inside 24 h | MITIGATE | Cancelling deletes the hike answers (section 3b) |
| The merged Undecided count reveals which absent attendees are undecided | MITIGATE | Merged count shown to the host only (section 6) |
| Reverses P1542 decision 1 (hike preparation optional), P1529 D16 (hike registration one tap) and D22 (no helpers in registration, hikes only), and the 2026-11-11 "Everyone welcome" opening | ACCEPT | Founder decided 2026-11-13 and 2026-11-17 after the 11-08 result; P1529's tests asserting one-tap hike registration change with this spec |
| Logged-out path skips or mangles hike answers | MITIGATE | The draft survives sign-in as in P1529; "now" lands in the introduction after the seat on every path |
| Moving a hike past its reminder time drops the reminder for "later" people | ACCEPT | Existing behaviour for every event; the founder moves hikes rarely |
| The privacy page still says "Social Hikes" and does not list the new answers | DEFER | Legal text changes with the next policy version (follow-up filed); the collection line under the form (section 3b) covers the gap |

**Non-Goals**
- Do NOT change Clarity Night's or the mastermind's registration, preparation or room.
- Do NOT build a transport tool, seat matching or ride lists. WhatsApp only.
- Do NOT build anything for the armband game or the arrival line.
- Do NOT add a `/feedback` route.
- Do NOT cancel or remove anyone automatically for not finishing.
- Do NOT build a hike waiting list or a hike size limit. Hikes publish with no limit; the existing waitlist RPC already refuses every flow but the mastermind.
- Do NOT make answers editable after the seat.
- Do NOT build members-only events (who may register). The app has no such setting today, only hidden (link-only) events; the founder's direction of 2026-11-17 (visible to everyone, only members can register, non-members invited to become members) is a separate spec.
- Do NOT rename the internal series id `social-hike`, change `events.preparation_enabled` on any row, or retitle published events.

## Cost Budget

Applies because the migration adds a trigger and per-request functions, and the room reads a count on a timer ([metered-services.md](../docs/technical/metered-services.md)). Supabase only; no Gemini, no new edge function, no new email.

Assumptions: R = registrations per hike (11-08: 20; 10-25: 29, so R ≈ 25 is used below); A = attendees with the room open, about 1 hour on the hike day (A ≈ 20); the host page open about 2 hours; counts re-read every 30 s (same cadence as the host's existing opt-in read, `useHostOptIns`).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | `register_for_hike` 1 per registration, replacing the 1 direct insert it supersedes = +0 net; confirmation's answers read +1 per hike registration (inside the existing send-event-emails call); room count 3600 s / 30 s = 120 per user-hour open | hike day: A × 120 = 20 × 120 = 2,400 (room) + 120 (host page) ≈ 2,520 | unit tests mock Supabase = 0; one TEST dry run ≈ 10 calls inside one SQL session |
| Egress (bytes) | count response ≈ 0.5 KB incl. headers × 120 = 60 KB per user-hour | 2,520 × 0.5 KB ≈ 1.3 MB per hike-day hour | ≈ 0 |
| Log lines | one API log line per request, as requests | ≈ 2,520 | ≈ 10 |
| Page reads | the hike page computes the introduction's minutes for the form: 2 point reads (`loadTagPoints` ×2) per hike page view; the host's page reads the hike answers once per open and once per change of the registered people | ≈ page views × 2 + host opens; at 10× page views (say 500 a week) about 1,000 small reads a week | 0 |
| Service unit | edge function invocations: +0 (the confirmation and reminder already run per registration); the delete trigger and the seat-guard branch run inside Postgres, 0 requests | 0 | 0 |

Why a timed read and not realtime (rule 2): the count joins registrations, room members and preparation answers, and only room members reach the room by realtime today; a registration or a preparation answer made elsewhere would never move the number. The read runs every 30 s only while the tab is visible (rule 3, `startVisiblePoll`), on hikes only, and only for a signed-in viewer the room has let in or the host's own event page.

Per month, with V = hike page views per hike (V ≈ 50 assumed) and the registration call itself counted as +0 net (it replaces the one-tap insert): hikes per month × (R answers reads + 2 × 120 host-page count reads + A × 120 room count reads + 2 × V minutes reads + 2 host answers reads) = 4 × (25 + 240 + 2,400 + 100 + 2) ≈ 11,100 requests, and about 5.5 MB egress (≈ 0.5 KB each).

1. **Fits the plan limit today?** Fits. Against the tighter Supabase Free plan row (5 GB egress, 500,000 edge function invocations, no request cap): 5.5 MB per month is about 0.1% of the egress allowance, and no edge function invocations are added. Current usage is read from the row's "Where usage is read"; this change adds the amounts above.
2. **Fits at 10x?** Fits: about 111,000 requests and 55 MB egress per month.
3. No upgrade needed.

## Invariants

- The hike room never stops an unprepared or late person (P1542; this spec section 5).
- Driver phone numbers never leave the private driver list through the app (P1571, `social-hike-roles.md` Message 3).
- A hike seat created after the deploy exists only with the required hike answers (when, and how you're coming), enforced by the server on every path that creates a registration: the hike RPC, a direct insert, the sign-in return, hidden links and the thank-you page's next-event offer.
- Hikes never ask for recording acceptance.
- Only the person and the event's host can read a person's hike answers.

## Acceptance Criteria

- [x] On a hike, "Reserve a seat" opens the form with the lead line, the two "when" options and the transport question; no seat exists before the required answers are given.
- [x] A hike registration without the when-answer or the transport answer is refused by the server, through the RPC and through a direct insert of the person's own row.
- [x] Inside 24 hours of the start, the form offers only "do it now"; the server refuses "later" with `now_only` when now is not strictly before start minus 24 h 30 min, and the client then redraws the form with only "now", keeping the other answers.
- [x] "I'll do it now" lands in the short introduction right after the seat, including after signing in from logged out; "later" gives the seat.
- [x] Both times shown equal the hike introduction's computed length.
- [x] A hike's confirmation and 24-hour reminder emails contain the introduction link while the event's `preparation_enabled` is false, and the hike room stays ungated.
- [x] Car or Motorbike with 1 or more free seats shows the WhatsApp free-seats line in the form and in the confirmation email; 0 seats or other answers show neither.
- [x] Choosing a help role shows that role's approved instructions and puts them in the confirmation email once; no email contains driver phone numbers, "call another number below" or Other text.
- [x] Transport lead is offered only when the transport answer is "I need a ride", is cleared if that answer changes, and is refused by the server otherwise.
- [x] Other opens a free-text box with the approved examples; empty, over 280 characters, or free seats outside 0 to 20 are refused by the server.
- [x] The host's event page shows each person's when-answer, transport answer with free seats, help role and Other text (as plain text); another attendee and an anonymous caller read no hike answers.
- [x] Cancelling a hike registration deletes its hike answers; registering again asks again.
- [x] On a hike, the thank-you page's next-event offer opens the event page's form instead of registering in one tap.
- [x] The hike form shows no places-left line, no waiting list and no recording acceptance, and ends with "Only you and the host see these answers."
- [x] After a `now_only` refusal the form shows the notice, offers only "now" (not pre-selected) and keeps the other answers.
- [x] A hike draft saved while signed out survives the sign-up callback and is submitted by the event page on return.
- [x] On a hike with `preparation_enabled` false, the host's page shows the In / Out / Undecided groups with the merged server numbers.
- [x] A registered person who did not prepare opens the hike room and is not blocked.
- [x] For one hike with a walk-in, a registered person who has not opened the room, and a person who answered only in the preparation, the host page's Undecided count equals the host's room view; attendees see the room's own Undecided count plus "and {N} registered, not here yet" and never the merged count.
- [x] Clarity Night registration stays one tap, and the mastermind's step still asks its own questions and recording acceptance (P1529's e2e for registration, sign-in return and waiting list green).
- [x] The hike template's title prefix is "Clarity Hike" and its opening is the founder's new line; the app's visible series label reads "Clarity Hike".
- [x] `/hike`, `publish-run`, `re-create-event`, the group-chat mapping and `promote-all` handle both a "Social Hike: …" and a "Clarity Hike: …" event.

## How the founder judges it (not a build gate)

After each hike, note: introductions finished out of registered, whether there was a conversation he'd call meaningful, his happiness 0-10, and whether anyone returned. Baseline 2026-11-08: 4 of 20, 5/10, nobody returned. If the score has not moved after 2-3 hikes, drop the requirement.

## Open Questions

1. Answered 2026-11-17: children and families. The opening line welcomes children with a registered adult; each adult registers and does the introduction. Revisit after 2-3 hikes.
2. Members-only hikes: out of scope (Non-Goals). Members already did the learning (P1549), so a members-only hike would need none of this form's "when" question.
3. Answered 2026-11-17: hikes get the introduction link in their emails through section 3c's rule, not through the stored flag.
4. Co-organizer (in `social-hike-roles.md`) is not offered in the form: the founder asks that person himself.

## Related

- P1529 (shipped 2026-11-16): registration form before the seat, D16, D22, D24.
- P1542: hike recipes, decision 1 (optional prepare) reversed here.
- P1549: learning before membership; computed time (decision 7).
- P1571: hike roles and templates; transport stays in WhatsApp (decision 5).
- P1649: series short links; `/hike` matches `%Hike%`.
- P1685: the Listening Game step in every preparation, hikes included.
- decisions.md 2026-10-06 (P1337): host alone sees In/Out/Undecided groups; the room roster's lists stay public. This spec shows the merged count to the host only.
