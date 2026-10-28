---
status: in-progress
type: task
rank: 75
workstream: events
created_date: '2026-10-26'
tags: [events, social-hike, select-hike, publish-run]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1571: Hike skills learn from the 25-person hike — regroup point, dinner on the way back, paid-entry check, role templates

## Problem

**Situation:** The hike skills pick a trail and a meeting cafe (`select-hike`) and write the description (`publish-run`, base in `docs/events/series/social-hike.md`). The series base already holds the split rule: one group up to about 15; above that, brisk and relaxed groups with a lead and a sweep each. The founder recruits leads and sweeps by hand with two WhatsApp messages.

**Complication:** At the 25-person hike, three failures traced back to selection, not to people:
- The meeting place was a sheep farm with a 100 THB entry. Nobody had checked, so people stood at the gate unsure whether to go in.
- The route had no mid-hike point where two groups naturally stop, regroup and socialise.
- The hike ended with no closure. Dinner defaults to a restaurant in the city, not one on the way back.

On top of that, the founder had to answer late arrivals and logistics questions himself. There was no named co-organizer.

**Question:** What small changes to the existing hike skills make the next big hike better without new tooling?

> Founder, verbatim: "dinner and viewpoint is part of our skills … entrance fee, check of the entrance fees, this is part of … it was a specific cafe, we didn't check if it's paid, but we should have. It's part of improvement of our skills."

> Founder, verbatim: "I don't need to design all of this automatic thing … three days before I message some people … so we can shrink it a lot and those are just templates."

## Appetite

- **Blast radius:** one series, skill and doc text only.
- **Reversibility:** git revert.
- **Decision density:** low. Only the wording of the co-organizer/welcomer message (Message 4) remains open.

## Founder decisions (2026-10-26/27)

1. **No automation and no Mira for roles.** The founder sends role messages by hand, about 3 days before, when sign-ups exceed 15.
2. **Above 15, four roles:** a **co-organizer**, who answers questions and is the late-arrival contact instead of the founder; a **welcomer** on arrival; a **lead**; and a **sweep**. Below 15 the founder manages it alone.
3. **The founder's two recruiting messages become templates.** Keep his wording. *"We don't need to innovate on messages to the lead."*
4. **Threshold: 15.**
5. **Transport runs in WhatsApp, not the app** (2026-10-28). A transport lead is appointed per hike with the template below, and the private driver list holds the numbers. There is no transport tool. Revisit after the next hike over 15 people.
6. **Dropped:** bike convoy, roster of verified people, organiser group, the Mira playbook.

## Solution

**`select-hike`** (it owns every choice the founder makes from open tabs)
- **Regroup point.** Prefer trails with a mid-route viewpoint, waterfall, lake, or a cafe open at that hour. Record it.
- **Paid-entry check.** For the meeting/end venue and any stop on the route, check whether entry is paid (reviews, Google Maps, AllTrails). Report paid / free / unknown with the source. Unknown is not free.
- **Dinner.** Search restaurants on the way back (or near the trailhead) that are open at the expected finish time, and open them as tabs for the founder like the cafes. Fall back to the city default in `publish-run`, and say so.
- **Handoff block.** The step-7 handoff gains `Regroup:`, `Entry:` (per venue, with source) and `Dinner:` lines. `publish-run` reads them from the handoff and does not re-derive them.

**`publish-run` and the series base**
- Name the regroup point in one clause and use the handed-off dinner.
- **Word budget.** New clauses replace existing text, never add to it.
- **Fees stay out of the description** (founder, 2026-10-28: "Entrance fees … let it out. It's not important."). The existing never-state-a-fee rule is unchanged. The paid-entry check only informs the founder's choice of venue at selection time.

**Hike notes: a separate file, `docs/events/series/social-hike-roles.md`** (founder 2026-10-28: separate, not part of the skill text). The series base links to it in one line.
- The four roles, one line each: co-organizer (answers questions, late-arrival contact), welcomer, lead, sweep.
- The founder's two messages, verbatim except `{name}` and `{registered}` (source: founder, 2026-10-27):

> Hey {name},
>
> Are you confirmed to attend sunday hike?
>
> We have {registered} people registered, and if more than 15 people show up, I'm planning to split us into two groups: a brisk workout group and a relaxed, scenic group.
>
> To keep it safe and running smoothly without losing anyone, I am looking for a few people to help me as Lead (setting the pace at the front) and Sweep (bringing up the rear to ensure nobody gets left behind).
>
> Anyone who wants to hike solo as a "free spirit" can simply opt out, but having two Leads and two Sweeps keeps the main group safe and organized.
>
> Would you be up for helping me out as either a group lead or a Sweep? Let me know how that sounds to you!
>
> Slava

> Great! here is a bit more info about how I think to manage it:
>
> The plan
>
> If we're 15 or fewer, or everyone walks at a similar pace, we stay as one group.
>
> If we're more than 15, we walk the first 20 minutes together, then split after 20 min into a brisk group and a relaxed group. Both groups finish at the cafe where we started (it closes at 18:00).
>
> Roles
>
> 1. Lead: sets the pace, keeps an eye on the route, and waits at junctions until the sweep catches up.
> 2. Sweep: walks behind the last person, so nobody ends up alone at the back.
>
> As a Lead: People who want to go faster: Totally fine, let them go. Don't chase them and don't wait. Just ask them to have the route on their phone.
>
> As a Sweep: People who want to stay behind: This is where the sweep takes a bit more care. Only let someone stay behind alone if they clearly look prepared: enough water, the map on their phone, and they know the way back. If you're not sure, which will usually be the case, stay with them, or walk them back to the group at an easy pace.
>
> Before Sunday, on wifi
>
> 1. Install AllTrails. We follow the route there, from the link in the event description.
> 2. Install Mapy.com as a backup, because signal drops on this trail. In the menu, open Offline maps and download Chiang Mai and Mae Rim.
> 3. Bring a fully charged phone, and a power bank if you have one.
>
> See u tomorrow!

  The cafe name, closing time and offline regions in message 2 become placeholders.
- A transport-lead template, verbatim except `{name}` (founder-approved 2026-10-28). The driver numbers are NOT part of it. They live in the private driver list and are pasted in by hand.

> Hey {name}, would you be our transport lead this Sunday?
>
> How it works:
> 1. Announce in the group that you're the transport lead. Anyone who wants a seat adds their name to the list there.
> 2. Call a driver and agree the price. Ask what's cheaper: waiting all day, or coming back at the end. Usually it's coming back: tell them roughly when, and that you'll message one hour before pickup.
> 3. Confirm the pickup point with the driver, then post the meeting point, the time and the price in the group.
> 4. Collect the money for both ways before anyone gets in.
> 5. If a driver fails, call another number below.
>
> Thanks!
> Slava

- A fourth short template (Message 4) for the co-organizer and welcomer in the same voice, marked `[FOUNDER DECISION: wording]` until approved.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Paid-entry check returns "unknown" for most venues | ACCEPT | Unknown is reported as unknown; the founder decides |
| No restaurant on the way back fits the timing | MITIGATE | Fall back to the city default and say so |
| Description grows past its ceiling | MITIGATE | New clauses replace text; ceiling is a founder decision |
| Templates drift from what the founder actually sends | ACCEPT | They are his own words; he edits them in place |

**Non-Goals:**
- Do NOT build a transport tool, registration questions, or any app change.
- Do NOT add automation, Mira messaging, or a roster of people.
- Do NOT put names or phone numbers in public files.
- Do NOT rewrite the lead or sweep instructions beyond the founder's wording.

## Done-When

- [ ] A `select-hike` dry run on a real candidate trail outputs the regroup point and the paid-entry status (paid / free / unknown, with source) for the meeting venue.
- [ ] A `select-hike` dry run opens dinner candidates on the way back as tabs, and its handoff block carries `Regroup:`, `Entry:` and `Dinner:`.
- [ ] A `publish-run` dry run reads those lines and produces a description naming the regroup point and dinner, within the founder's chosen word ceiling.
- [ ] A venue the check finds paid is shown to the founder as `PAID ENTRY: <source>` at selection; the published description still states no fee.
- [ ] Message 4's wording is approved by the founder and its `[FOUNDER DECISION]` marker removed.
- [ ] `docs/events/series/social-hike-roles.md` exists with the four roles, the founder's two messages and the transport-lead template, with no personal names or phone numbers.
- [ ] The changes are reviewed by Gemini and a second Opus pass, and each finding is verified by command before it is folded in.

## Related

- P1542: hike prepare and close (reviews come from the close).
- Private driver list: `.private/events/transport-drivers.md` (not in git).
