---
status: in-progress
type: story
rank: 336
workstream: events
created_date: '2026-11-13'
tags: [events, social-hike, clarity-hike, registration, preparation]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev, dev.2]
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

- Lead line (superseded by UAT round 1, R1): "This hike is for people who take 10 minutes to learn a few shared words first, so we can have better conversations on the trail. When will you do it?"
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

UAT round 1 adds, inside the existing confirmation and reminder edge-function runs (no new invocation, no new email): the group chat link costs one registration read and one private-info read per hike email, so R × 2 emails × 2 reads = 25 × 2 × 2 = 100 reads per hike, 4 × 100 = 400 a month (≈ 0.5 KB each, ≈ 0.2 MB); a failed read logs one warning line, at most 2 per email, so at most 400 log lines a month in the worst case and 0 normally. Hikes stop sending the feedback email, which removes one email send per hike registration (≈ 100 a month at R = 25). Revised totals: ≈ 11,500 requests and ≈ 5.7 MB egress a month.

1. **Fits the plan limit today?** Fits. Against the tighter Supabase Free plan row (5 GB egress, 500,000 edge function invocations, no request cap): 5.7 MB per month is about 0.1% of the egress allowance, and no edge function invocations are added. Current usage is read from the row's "Where usage is read"; this change adds the amounts above.
2. **Fits at 10x?** Fits: about 115,000 requests and 57 MB egress per month.
3. No upgrade needed.

## Invariants

- The hike room never stops an unprepared or late person (P1542; this spec section 5).
- Driver phone numbers never leave the private driver list through the app (P1571, `social-hike-roles.md` Message 3).
- A hike seat created after the deploy exists only with the required hike answers (when, and how you're coming when the event asks it, UAT round 1 R6), enforced by the server on every path that creates a registration: the hike RPC, a direct insert, the sign-in return, hidden links and the thank-you page's next-event offer.
- Hikes never ask for recording acceptance.
- Only the person and the event's host can read a person's hike answers.

## Acceptance Criteria

- [x] On a hike, "Reserve a seat" opens the form with the lead line, the two "when" options and the transport question; no seat exists before the required answers are given.
- [x] A hike registration without the when-answer or (when the event asks it, UAT round 1 R6) the transport answer is refused by the server, through the RPC and through a direct insert of the person's own row.
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

UAT round 1 (R1 to R8 below; R5 keeps the privacy line, covered by the existing criterion above):

- [ ] R1: the hike form's lead line is "Everyone does a short introduction before the hike. When will you do it?" and shows no minutes; the "now" option shows the computed minutes.
- [ ] R2: choosing "I need a ride" shows the ride line in the form, and the confirmation email of a need-ride registration contains it; other transport answers show neither.
- [ ] R3: the help question reads "How would you like to take part?" with the line "This is a social, non-commercial hike: nobody is paid, so a few of us help run it.", "Just attend as a participant" is selected when the form opens, and submitting with it stores no help role.
- [ ] R4: a chosen role shows the heading "{Role}: what you'll do" above its text, in the form and in the confirmation email.
- [ ] R6: Edit event shows the two checkboxes for hikes only, on by default; a non-hike event shows neither.
- [ ] R6: with transport off, the form has no transport question, the server stores transport and seats NULL even when the client sends values, and the seat is created; with help off, the same for help and Other. With both on, behaviour is unchanged (P1675's existing tests green).
- [ ] R6: the host page shows a dash for a transport answer not stored and for help on an event that does not ask it, and "Participant" for "Just attend" on an event that asks it.
- [ ] R6: a hike with transport off can be registered signed out, survives sign-in, and is redrawn after a `now_only` refusal with its other answers kept.
- [ ] R6: the database refuses `transport_lead` with NULL transport, and NULL transport with a seats number. (The server half of R6 is proven against the TEST database by a rolled-back run as a signed-in caller, recorded in the build notes; the unit tests pin the SQL source.)
- [ ] R7: a hike's confirmation and reminder emails contain the group chat link when one is set and the recipient's registration is active, and no group chat line when none is set, when the registration row cannot be read, or when the link is not `http(s)`; Clarity Night's emails are unchanged.
- [ ] R7: no hike gets a feedback email: a registration and an edit schedule none, and the dispatcher skips a hike before claiming one already scheduled; a Clarity Night registration and edit by the gated host still do.
- [ ] R7: no hike email states how long the preparation takes (the confirmation subject and the preparation question and reminder lines have a hike wording with no number); event-timing lines such as "starts in 15 minutes" are unchanged.
- [ ] R7: a hike registration sends no kind of email it did not send before (confirmation, 24-hour reminder and the host's update notices only; the feedback email is gone).
- [ ] R10: before a person starts, the hike form's "now" option, the hike preparation page's total and Clarity Night's preparation total all say 15 minutes, from the recipe's stated value (a test pins it from the recipe, and pins that the mastermind's role minutes are unchanged); after starting, the remaining time is computed.
- [ ] R11: a confirmation requested from `http://localhost:<port>` on TEST links to that port; a non-localhost address or a non-localhost configured site is ignored (prod links unchanged).
- [ ] R8: for a person part-way through the same hike, the form's rule and the preparation page's remaining minutes come from one shared function; each `/prepare` row equals the same step's row on the preparation page and the misunderstanding row uses the same factor; the factor is not applied to the canvas step; a test pins that the hike's number is the factor applied to the modelled seconds, not a typed total.

UAT round 3 (R12 to R18 below; R18 supersedes R6's two checkboxes, so the R6 criteria above are re-read against the preset: transport off = `when`, help off = `when` or `when_transport`):

- [ ] R12: the hike form's lead line is exactly R12's text, with "It's required to join." in bold, then "When will you do it?".
- [ ] R13: on a hike whose preset is not `optional`, the plan page's title is "Your short introduction", a brand-new person reads "About 15 minutes.", a person with parts done elsewhere reads "About {N} minutes left: you've done part of it before." with N equal to the R10 number, and no why paragraphs show; a one-tap hike keeps today's title, line and paragraphs; Clarity Night's and the mastermind's plan pages are unchanged.
- [ ] R14: the confirmation page of a hike that asks the questions says "Required for this hike. We'll remind you by email."; a one-tap hike says "Optional. You can come without it."; Clarity Night and the mastermind are unchanged.
- [ ] R15: choosing Car or Motorbike shows 0 in the free-seats box, a submit without touching it stores 0, and the WhatsApp line shows only at 1 or more.
- [ ] R16: the help question's first option reads "Participant" and stores help NULL.
- [ ] R17: the host's hike page shows the roles count line with R17's format, counting only active registrations' answers, leaving out zeros, and not shown when no answer has a help part; attendees and anonymous viewers never see it; confirmed in the browser on 7100 with a real registration.
- [ ] R18: Edit event on a hike shows "Before the seat" with the four choices, `all` selected on an existing hike; a non-hike event shows none; saving a choice stores it and sends no "event updated" email.
- [ ] R18: with `optional`, Reserve registers in one tap with no answers row, the server accepts a direct insert without answers, `register_for_hike` refuses with its distinct code, and the thank-you page's next-event offer registers directly; with `when` the form asks only when and stores transport, seats and help NULL; with `when_transport` it asks when and transport and stores help NULL with asked_help false; with `all` behaviour is unchanged.
- [ ] R18: the migration backfills the preset from the two booleans as R18 lists, drops them, and nothing in the client, edge functions, scripts or skills still reads `hike_asks_transport` or `hike_asks_help` (grep proof in the build notes); applied to TEST.

## UAT round 1 (founder, 2026-11-17, localhost)

Founder feedback after trying the form on the Wat Pha Lat hike. Every founder decision below was given in session on 2026-11-17; the text is verbatim and supersedes the matching text in sections 1 to 3 above.

**R1. Lead line, shorter, no minutes** (founder: "It's a long thing to simplify. It's redundant also against words."): "Everyone does a short introduction before the hike. When will you do it?" The minutes stay only in the "now" option ("I have N minutes, I'll do it now").

**R2. "I need a ride" says what happens next.** Choosing it shows, under the option: "After you register, you'll get the hike's WhatsApp group. Rides are arranged there." The same line goes in that person's confirmation email (as the free-seats line does for drivers).

**R3. The help question has a default.** Question: "How would you like to take part?" One line under it: "This is a social, non-commercial hike: nobody is paid, so a few of us help run it." First option, selected by default: "Just attend as a participant" (stored as no help role, `help` NULL). Then Lead, Sweep, Welcomer, Transport lead (only with "I need a ride"), Other. "Just attend" is a real option, so tapping a chosen role no longer un-chooses it; choosing "Just attend" is how a role is dropped, and a cleared Transport lead falls back to it.

**R4. A chosen role's text reads as instructions.** A heading above it: "{Role}: what you'll do" (e.g. "Sweep: what you'll do", "Transport lead: what you'll do"). The confirmation email uses the same heading above the same text, as a heading (not one more bullet), with the role's display label ("Transport lead", never the stored value).

**R5. Privacy line kept as is:** "Only you and the host see these answers."

**R6. Questions per event, not per series.** Founder's example: the in-city collab needs neither help nor transport. Design (founder chose two checkboxes):
- `events` gets two booleans, `hike_asks_transport` and `hike_asks_help`, `NOT NULL DEFAULT true`, so every existing hike keeps asking both. They are ordinary public event settings (not personal data), written by the host through the existing event update path.
- Edit event shows, for hike events only, under a heading "Questions before the seat": "Ask how they're coming" and "Ask if they'd like to help", both on by default. The "when" question is always asked and has no checkbox. Not on Create: the Create form has no series, and a host cannot set `series_slug` (P1403 lock; hikes are published by `publish-run` with the service role), so a hike is recognisable only once it exists (spec review, Opus). The host publishes, then unticks on Edit before sharing the link. Letting `publish-run` take the two settings is a skill edit on main (INBOX-370).
- A host who turns the transport question on while someone's form is open gets that person a refusal and a generic retry toast; turning the help question on stores that person as "Just attend", since help is optional (spec review and code review, Codex). Both ACCEPT: the host sets the questions before sharing the link, and reloading the page redraws the form.
- With transport off, the form hides the transport question (and with it the free-seats answer, the ride line and the Transport lead option). With help off, it hides the help question.
- `event_hike_answers.transport` becomes nullable: NULL exactly when not asked. One new migration after `20261117130000`, applied before any client sends NULL, does all of it atomically: the two columns, `DROP NOT NULL`, the free-seats check rewritten so NULL transport requires NULL seats, and the Transport lead check rewritten as `help IS DISTINCT FROM 'transport_lead' OR transport IS NOT DISTINCT FROM 'need_ride'` (today's `transport = 'need_ride'` evaluates UNKNOWN on NULL and would let the row through; spec review, Codex).
- `register_for_hike` reads the event's two settings: when transport is asked it stays required as today; when it is not, transport and seats are stored NULL whatever the client sends. When help is not asked, help and Other are stored NULL.
- The client's answer model, its validator (which also validates the signed-out draft), the missing-answers check and the `now_only` redraw take the event's two settings, so a form without the transport question can be submitted, saved across sign-in and redrawn.
- A host who changes a setting after people registered keeps their answers as they are. Each answers row records whether help was asked (`asked_help boolean NOT NULL DEFAULT true`, written by the RPC from the event's setting), because a NULL help means both "Just attend" and "not asked" (spec review, Opus). The host page shows a dash for a transport answer that is not stored (transport is required whenever it is asked, so NULL means not asked); for help it shows "Participant" when `asked_help` and help is NULL, and a dash when not `asked_help`.
- Members-only hikes (INBOX-361, out of scope) will be a separate "who can register" setting beside these, not a third checkbox here.
- Saving Edit event emails registrants "event updated" only when something they were told actually changed (title, description, time, duration, time zone, location, place limit), compared with what is stored. Edit event resends every field, so before this, ticking one of these boxes, or changing only the group chat link, emailed everyone (code review, Sonnet and Opus). This applies to every event, not only hikes. The email for a real change is sent before the group chat link is saved, so a failed link save cannot swallow it (code review, Codex).

**R7. Emails: the WhatsApp group link, and no feedback email for hikes** (founder: "confirmation and reminder - the feedback email we can skip - because i direct them to feedback at end of the event").
- A hike's confirmation and 24-hour reminder carry the event's group chat link when the host has set one (P1193's private event info). The sender reads it with the service role only after reading that recipient's active registration row for the event; the confirmation is otherwise sent without the link (today it is sent even when that row cannot be read). The link is shown only if it is `http:` or `https:`, and is escaped in the HTML and plain in the text part. No new email is added.
- The ride line (R2) is sent whether or not a link is set: the founder adds riders to the group by hand when there is no link.
- No hike gets an after-event feedback email: neither the registration nor an event edit (`handleUpdate`, which re-sets the feedback time today) schedules one, and the dispatcher's feedback step skips a hike before it claims a row, which also covers rows scheduled before the deploy (spec review, Opus).
- The preparation emails a hike now receives (section 3c) ask "Do you have 10 minutes to prepare…?" in the subject and body, a fixed number that contradicts the form. Hikes get their own wording with no number, as the lead line has (R1); builder's wording, shown to the founder at UAT.
- The group chat link appears in a reminder only if it was set before that reminder is built (the dispatcher builds it when it claims the row).
- Clarity Night and the mastermind keep their feedback email; whether to drop it for every event is a separate founder decision (INBOX-371).

**R8. The minutes match the real time.** Finding (verified in code, 2026-11-17): the form and the preparation page already compute the same number, from the same plan and the same rule, and for a new person both say 8 for this hike; there was no mismatch between them. The rule undercounts real time: it assumes videos at 1.15x, reading at 200 words a minute, 20 seconds per statement, and nothing for thinking or moving between screens. The founder timed the hike introduction at about 15 minutes. Fix (founder: "update now, and later we can change"): one correction factor in the time rule, the founder's observed time over the rule's estimate (15 / 8), applied inside the per-step seconds to every modelled step (videos, reading, statements, including `/prepare`'s misunderstanding row, which today computes its own seconds) and not to the founder-set canvas time. Rows stay rounded per row, as today, and the total stays the sum of the rows, so every list and its total agree; for this hike's card count that gives about 15 (14 or 15 depending on the count), and the test pins the computed value, not a typed one. The clip badges keep showing each video's real length (the factor is not applied to the per-clip watch time). It stays a computed number: adding or removing a step still changes it, and the form, the preparation page and `/prepare` keep agreeing. With rows rounded one by one, the hike shows 14 with 8 statements and 15 with 9 (spec review, Opus); the founder is told the number the live statement count gives. Because the rule is shared, every computed estimate rises by the same factor (spec review, Opus, computed with 5 statements: Clarity Night about 12 to 21, the membership join page about 7 to 12, the mastermind's computed time after starting about 9 to 16): a deliberate exception to the Non-Goal "do not change Clarity Night's preparation", shown to the founder before ship. The mastermind's founder-set role minutes (15, 25 and 10 before starting) and its email line are not computed and do not change. Replacing the factor with measured completion times is INBOX-372.

**R9. Members-only hikes** later need to be told apart from open ones (INBOX-361). Out of scope; R6 is designed to sit beside it.

## UAT round 2 (founder, 2026-11-17, localhost)

**R10. A stated 15 minutes, not a computed number** (founder: "let's make 15 minutes. It's weird to say 14 minutes. Don't compute. 15 minutes is normal. More or less. Nobody counts."; "both to 15 minutes"). This reverses R8's "never a literal" and P1549 decision 7 for these two series. Before a person starts, a hike and a Clarity Night say 15 minutes wherever the whole introduction's length is shown: the hike form's "I have 15 minutes, I'll do it now", the preparation page's total and the invitation line. It is a recipe value for the two series (`prepare.statedMinutes`), the same pattern as the mastermind's founder-set role minutes (15, 25, 10). Once a person has started, the page shows the remaining time computed by R8's rule, as the mastermind already does. While the stated 15 is shown, the per-step rows show no minutes (as the mastermind's stated total already does), so a list summing to 14 never sits under a 15; after starting, the rows show their computed minutes again. Clarity Night's preparation emails change from "10 minutes" to "15 minutes" to match (code review, Gemini); the mastermind's (both canvas timings) and the hike's wording are unchanged (code review, Opus).

A brand-new person (nothing learned anywhere, no step of this event done) is told 15 itself, even when the rule computes 14 (code review, Gemini; founder: "weird to say 14"). For everyone else the number shown is never more than the stated 15: it is the computed remaining time or 15, whichever is smaller (code review, Opus, two rounds). While the number is loading, the preparation question shows the series' stated length (15), and 10 for a series without one, so a mastermind with its canvas before the event no longer flashes 15. Clarity Night's full computed length is about 19 to 26 minutes, so showing 15 only to a brand-new person made the number rise after the first step (15 to 17) and showed a person who had done one part elsewhere more (17 to 19) than a brand-new one. With the cap, a new person sees 15, the number only shrinks as they go, and a person with a short plan (for example one who learned on a hike, about 8) sees their real, smaller number. While the cap is in effect the per-step rows show no minutes, so a list summing above 15 never sits under a 15. No number is shown until the person's progress has loaded.

Also accepted (code review, Opus): any event whose series has no recipe of its own resolves to Clarity Night's recipe, so with preparation on it also says 15; the "starting soon" email sent inside a late registration keeps the configured address; the local-address rule also accepts `127.0.0.1` and no port. R8's correction factor stays (founder: "we raise it as you say"). The hike form no longer reads statement counts to compute its number, which removes 2 point reads per hike page view from the cost budget.

Not cut (founder asked whether to cut the "misunderstanding" statements to shrink Clarity Night): those statements are in `/prepare` and in the mastermind with the canvas at the event, not in Clarity Night's preparation, so cutting them would not shrink Clarity Night. Nothing is removed.

**R11. Email links on TEST follow the page you registered from.** On the shared TEST server every email link points at one fixed local address (port 5001), so a confirmation for a registration made on another worktree's port opens the wrong app (founder: "when I register there the confirmation email comes from 5001 port ... fix it"). The app sends its own address with the email request; the email function uses it only when its configured site is itself a `localhost` address and the sent address is `http://localhost:<port>`. Prod's configured site is the public domain, so prod ignores it. Reminders, sent later by the scheduler with no page behind them, keep the configured address. The confirmation's "Event page" link, which always pointed at the public site, follows the same local address on TEST only; prod keeps the public site (code review, Codex).

A returning person who finished parts of the introduction at an earlier event (but has not started this one) sees the computed remaining time rather than the stated 15, while the hike form still says 15 (ACCEPT: the smaller remaining number is the true one for them; code review, Codex). Testing the hike emails on TEST waits until another session's email work, currently deployed there, has landed on main (founder decision).

Kept as is (founder left these to the builder): the help question stays "How would you like to take part?" ("In which role" fits "Just attend as a participant" badly, since that is not a role); the free-seats box starts empty, so a driver types a number.

Reported, not reproduced: a slight blinking while scrolling the registration form on desktop. Scrolling the open form changes nothing on the page (0 DOM changes over 10 scroll steps), and scrolling the page changes only the header; likely a paint effect of the blurred backdrop over the photo and video gallery. Re-check against the same page on main.

Also discussed, not built: tokens for asking a real question when there is a disagreement. This is the armband game already in "Not built: host practice". Recommendation given: try it by hand on the next one or two hikes and judge it with the measure below; build nothing in the app until it shows it helps.

## UAT round 3 (founder, 2026-11-18, localhost)

Founder feedback after registering on the Wat Pha Lat hike on port 7100; decisions given in session on 2026-11-18. Supersedes the matching text above.

**R12. The lead line gives the real reason** (founder chose option A of three): "Everyone does a short introduction first. We believe a few shared words and habits make every relationship better, at work and at home, and our community exists to spread them." then, in bold, "It's required to join." then "When will you do it?". It echoes the founder's own P1549 opening on the preparation page ("A few small habits and shared words can change the quality of all your relationships, personal and professional"). Neither the lean canvas nor the philosophy doc has a single mission sentence for the community; the closest are "Practices spread through communities, not sales funnels" (lean canvas) and "spread fallibilism as a communicative tradition" (decisions.md 2026-10-27).

**R13. The page after "now" continues from the form** (founder chose "continue + honest number"). Finding (TEST, read-only, 2026-11-18): the "now" registrant's account had finished parts of the introduction on 2026-10-02 and 2026-11-12/13, so the plan page computed about 8 minutes left while the form said 15; a brand-new person sees 15 on both (R10's accepted gap, now explained on the page). On a hike that asks the questions (R18: any preset but "optional"):
- Plan page title: "Your short introduction" (was "Get to know {community}").
- The line under it: a brand-new person "About 15 minutes."; anyone else "About {N} minutes left: you've done part of it before." N is R10's number (the computed remaining time capped at 15). The step count is dropped from this line.
- No "why" paragraphs on this page: the form already said why, and the third paragraph ("Then you decide if it is for you.") contradicts a commitment already made. A one-tap hike (R18 "optional") keeps today's title, line and paragraphs.

**R14. One word for required, everywhere a hike says it** (finding of the round-3 audit, below). On a hike that asks the questions, the confirmation page's "Optional. You can come without it." becomes "Required for this hike. We'll remind you by email." A one-tap hike keeps "Optional. You can come without it.". The room still never stops anyone (section 5): "required" is the commitment at registration, not a door.

**R15. Free seats start at 0.** Choosing Car or Motorbike shows the free-seats box filled with 0, so the form never refuses an untouched box; the WhatsApp free-seats line still appears only at 1 or more.

**R16. "Participant"** replaces "Just attend as a participant" as the first option of the help question (one-word options, like the roles). Stored as before (help NULL); the host line already reads "Participant".

**R17. A roles count for the host** (founder chose roles only, no rides count). On a hike's event page, host only, above the people list, one line counting the help answers of active registrations: "Roles: 1 Lead · 1 Sweep · 2 Welcomers · 1 Transport lead · 1 Other · 12 Participants". Zero counts are left out; plural forms ("Welcomers", "Transport leads", "Participants"; "Other" stays "Other"); "Participants" counts help NULL with asked_help true; people registered without answers or without the help question are not counted. Computed from the answers the page already loads (no new read). Not shown when nobody's answer has a help part. Confirmed on 7100 with a real registration before this round is reported done.

**R18. One "before the seat" setting per hike, replacing R6's two checkboxes** (founder chose one preset choice and asked for it in this spec). Edit event, hike events only, heading "Before the seat", one choice of four (builder's labels, shown at UAT):
- "Introduction optional: one tap" (`optional`): registration is one tap as before P1675; no form, no answers row, no 24-hour rule; the confirmation page says optional (R14); the emails keep the hike's introduction link and wording (section 3c).
- "Introduction required: ask when only" (`when`): the form with the when question only (the in-city collab).
- "Introduction required: ask when and how they're coming" (`when_transport`).
- "Introduction required: ask all questions" (`all`, the default for every hike, matching R6's both-on default).

Storage: one column on `events`, `hike_registration text NOT NULL DEFAULT 'all'` with a CHECK on the four values, in one new migration that also backfills it from R6's two booleans (both on → `all`; transport only → `when_transport`; neither → `when`; help only → `all`, a TEST-only state, since R6 never reached prod) and drops `hike_asks_transport` and `hike_asks_help`. Every reader of the two booleans (client answer model and validator, registration step, sign-in return, Edit event, event write columns, `register_for_hike`, the seat trigger) reads the preset instead. The server is the authority: the seat trigger requires an answers row only when the preset is not `optional`; `register_for_hike` refuses an `optional` hike with a distinct code, so a form left open when the host switches to optional gets the generic retry toast (ACCEPT, as R6's live-switch cases). `asked_help` per answers row stays, written from the preset. The thank-you page's next-event offer (section 4b) registers in one tap when the next hike's preset is `optional`.

Changing the preset after people registered keeps every existing seat and answers row (no flow guard, as section 0). Members-only (INBOX-361) stays a separate "who can register" setting beside this one, not a fifth preset; a member who has finished the introduction will later skip the when question (that spec's job). Presets for Clarity Night or the mastermind are not built: Clarity Night keeps one tap and its preparation toggle, the mastermind keeps its own registration (Non-Goals unchanged). The event description's opening line is not changed per preset; a host who makes a hike optional edits the description.

**Round-3 audit: where "optional" and "required" are stated** (read from the code 2026-11-18, before R13 and R14):
- Hike: the form and the series template's opening say required; the confirmation page said "Optional. You can come without it." (the contradiction the founder found, fixed by R14); the plan page's "Then you decide if it is for you." (fixed by R13); the emails ask ("Do the short introduction before the hike", "we ask every participant to prepare"), consistent.
- Mastermind: the confirmation page and emails say "Preparation is required", while the room lets everyone in. P1529 chose this ("optional at the room's door"); left as is.
- Clarity Night: consistent. It asks ("Do you have 15 minutes to prepare?"), offers "Remind me by email", and the room gate offers "Join the room without preparing".
- Dead copy: the room step bar's default "(optional)" label is shown by no event type (every recipe names its learn step); left as is.

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
