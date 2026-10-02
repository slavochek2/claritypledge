---
status: today
type: story
rank: 4
workstream: events
created_date: '2026-09-21'
tags:
  - events
  - event-room
  - journey
  - rotation
  - matching
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1336
  - p1338
  - p1347
  - p1114
  - p1179
  - p1323
---

# P1337: At a Clarity Night the room is grouped into trios by how much people disagree, rounds run on the host's bell, and every phone says where to sit and what to talk about

## Problem

**Situation:** Clarity Night #1 (2026-09-18) ran pairs. Attendee feedback: a confusing click-flow,
pairs stuck together all evening, late arrivals forcing repeats, nobody taking the speaker/listener
roles unprompted ([goals.md](../docs/goals.md)). The recording shows the room had **still not started
a round at minute 48**, with roughly 15 of those minutes lost to in-room logistics.

**Complication:** Events now run weekly. The format changed on 2026-09-28 to **trios** — three rounds
of 15 minutes, six on one person's meaning, six on the other's, three for the observer, everyone
rotating through speaker, listener and observer ([decisions.md](../docs/decisions.md) 2026-09-28
[product]). Partners are no longer a detail of seating: the founder wants people matched to the
person they **meaningfully disagree with**, not a random neighbour. Without that, the room "talks
about all and nothing, like Clarity Night #1" (founder, 2026-10-01).

**Question:** What does each attendee see, round by round, so they sit with the right person, know
what to talk about, and never ask the host what to click — and what does the host do, beyond ringing
a bell?

## Appetite

Blast radius: one flow — the event room during a live event; a failure costs a room of people their
evening. Reversibility: high for the UI, lower for the grouping data, which is the research record.
Decision density: resolved in conversation 2026-10-01/02; the remaining founder calls are marked
inline.

## Solution

### 1. The grouping is the product, not the seating

Each round, the server groups whoever is present into trios, **maximising the position gap on the
night's statements** — the positions P1336's prep flow already collects (`events.statement_tag`,
positions stored per person per point). The grouping satisfies, in priority order:

1. Everyone observes exactly once across the three rounds, and pairs twice.
2. Nobody repeats a partner.
3. Largest disagreement gap between the two non-observers.
4. Recorders seated together (see §5).

**Switchable dimensions** in the host panel, default on: recorders together · disagreement gap ·
haven't met yet. Group size is a parameter (**2 / 3 / 4**, default 3) — it has to be anyway, because
fifteen people do not divide by three, and it makes "a round of pairs with no observer" an experiment
that costs nothing. `[FOUNDER DECISION: whether round 1 uses a smaller gap than round 3, or every
round leads with the maximum]` — founder leans maximum throughout.

**Not a matching v2.** This was briefly split into a later spec and folded back in: a random partner
and a matched partner are different products, not the same product optimised.

### 2. Rounds are computed just in time, all three at once

All three rounds are computed when the evening starts, and only the current one is shown. A
**Recompute** control re-derives the remaining rounds when something has obviously changed.

- **Arrivals need no host action** — opening the event room puts you in the pool for the next round.
- **Departures need no host action either** — a ghost simply makes that table a pair, which the
  format absorbs. Marking someone *left* is a tidy-up, not a requirement.
- **Late arrivals join at the next round**, never mid-round.

The format tolerating error is the design, not a fallback: the host should not have to keep the
model accurate for the evening to work.

### 3. What each person sees

**Between rounds** (the only phone moment): their table, who is there, their role, and — the reason
they look — the **statement they and their partner are furthest apart on**, with a link into the
compare view (§4). One tap, *"I'm here"*, confirming the table; it records where they actually sat and
doubles as attendance. **The tap is never a gate**: not tapping changes nothing, and anyone can tap
late, including after coming back from the toilet.

**During the round the phone is dark.** No timer, no controls, nothing to scroll. The two people talk.

**The observer holds the clock.** Their phone shows the countdown, and they say *"swap"* out loud at
six minutes. No sound, no vibration — the Vibration API does not exist on iOS Safari, and a phone
speaker cannot cut through fifteen people talking. The observer is also the one who keeps the round a
dialogue rather than two monologues.

**At the end of each round**, an optional *"did your position move?"* — captured while the
conversation is still in their head, in a moment they are already looking at the phone.

### 4. The compare view

`/compare/:person?tag=<event tag>` — the statements both people hold a position on, **sorted by
largest gap**, each row showing the two positions side by side in the pattern the letters flow
already uses (`letter-reveal-ordinal.tsx`, "Where you each stand"). A plain list: no swiping, no
cards to dismiss, no modes — **two people share one phone**, so a one-person gesture excludes the
other, and hiding the non-current rows is wrong when the job is choosing together. Agreements sort
last and stay visible: that is where false agreement hides.

One surface, three jobs: the round screen, general curiosity about where you differ from anyone, and
the no-connection fallback (§7).

**Query:** tag-filtered in the database — not the profile points tab, which fetches every point with
no limit while the feed and stake pages cap at 50 (`points-service-real.ts:666-675`,
`offline-reads.ts:34,62`). **Cap the profile points tab at 50 with "show more" in this spec**, since
the same service file is already open.

Prototype: `/tree/compare-positions`.

### 5. Recording

Consent is the recorder's responsibility, not the room's (see Invariants). Recorders sit **together at
one table away from the others**, so one conversation is captured from both sides — two or three
lavaliers bound the capacity far below room size, so this costs the grouping almost nothing.

**Recorders' phones stay awake, face up on the table.** iOS Safari mutes the capture track the moment
the screen locks or the tab backgrounds, and `MediaRecorder` then writes **silence** with no error;
Android survives backgrounding only if OEM battery optimisation is off, which a web page cannot set.
Pause/resume, the rename, the level meter and unplug handling are **their own spec** — they are
`/transcribe`-wide, not event-specific.

### 6. The host panel

`/events/:slug/host`, reached by a **"Run this event"** button only the host sees on the event page.
Gated on **is_event_host, not is_admin** — an event host is not the site admin. Reuse P1381's RPC
pattern (`SET search_path = ''`, `COALESCE(flag,false)` against `auth.uid()`, explicit
`REVOKE EXECUTE FROM PUBLIC, anon`, verify `pg_proc.proacl` after applying); note that the P880
trust-column guard fires only for `anon`/`authenticated`, so a SECURITY DEFINER writer bypasses it.

**Two actions per round: ring the bell, press Next round.** Everything else is optional — mark someone
left, swap two people by hand (the case no algorithm can know), Recompute. Press *Start round* → **90
seconds** for the room to find tables → 6 / 6 / 3. One clock for the whole room; a round that is not
ended simply continues, and the countdown passing zero reads "over by 2:30".

The panel also shows **past rounds** — who sat where, in which role — which is the only way to answer
"who was Ana with when she said that?", and a **print view** of the current grouping (no PDF
download; the browser's share sheet covers it).

**The override control:** prototype at `/tree/host-controls`, three variants. An independent
usability review ranked **A (tap a name, tap who it trades with) first** — the whole room stays above
the fold with 52px targets, and a committed trade produces an "Undo X ↔ Y" control. C (declare facts,
press Regroup) ranked last: its vocabulary contains no *move* and no *swap*, so it cannot do the job
directly, and it reshuffles uninvolved people in public.
`[FOUNDER DECISION: confirm A, after looking at all three on a phone]`

### 7. When the network is not there

Everything the room *displays* survives a drop (P1369 serves the last version seen); nothing it
*records* does. With no connection at all: rotate one seat clockwise, and each pair finds its own
disagreement by comparing positions out loud. Paper is a 1% case, not the mechanism.

## Invariants

- **The confirm tap is never a gate.** Not tapping must never block a person from a round, a table or
  a role.
- **The phone is dark during a round** for everyone except the observer.
- **Consent for recording sits with the recorder** — the room is never asked who does not want to be
  recorded, because refusal must not become a public declaration. This **overrules**
  [decisions.md](../docs/decisions.md) 2026-09-16 (pair unanimity, "lavalier wearers pair only with
  each other"); the visible mic is the notice, and pause is how an objection is honoured.
- **The round rule is "hear the number before you disagree", for opted-in listeners only** — the
  number does not have to reach 8 (decisions.md 2026-09-29). Opted-in and opted-out people are mixed
  deliberately; each phone shows that person their own rule.
- **A physical event must still run when a phone fails**: the projector alone carries step, roles and
  tables.
- Nothing in this flow asks for a follow-up session or a purchase. (The closing sequence is its own
  spec; this invariant binds there too.)

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Not ready for the next event | MITIGATE | Compute the grouping and print it; the matching is the value and paper delivers it |
| Recorded capture silently fails (locked iPhone) | MITIGATE | Level meter in the consent-controls spec; the checklist checks each recorder's transcript before they leave |
| Long names truncate at 320px | ACCEPT→FIX | Measured: 78px tiles show "Aleksan…". Use first name + initial, or a two-line tile |
| Grouping is wrong in a way nobody notices | MITIGATE | Past-rounds view; the confirm tap records where people actually sat |
| Positions missing for someone who skipped the prep | ACCEPT | They group without a gap signal; the other constraints still apply |

**Non-Goals**
- Do NOT put a timer, sound or vibration on attendees' phones.
- Do NOT build pause/resume or the level meter here — separate spec.
- Do NOT build the closing sequence here — separate spec.
- Do NOT rebuild topic voting; link to `/topics` (P1347).
- Do NOT match on the clarity protocol itself (cmp7/cmp10). That is a dedicated event format later,
  recorded in the topic backlog.

## Acceptance Criteria

- [ ] An attendee who has never used the room can follow a full evening on their phone without asking the host what to click
- [ ] Each person observes exactly once and pairs twice across three rounds, with no repeated partner
- [ ] Each round, the two non-observers are shown the statement they are furthest apart on, and can open the compare view for it
- [ ] A late arrival is grouped in the next round with no host action
- [ ] A person who leaves without telling anyone leaves a table of two, and the round still runs
- [ ] The host completes a full evening using only: ring bell, press Next round
- [ ] A host can swap two people by hand and see the result without scrolling
- [ ] The host panel shows past rounds with table and role per person
- [ ] The confirm tap records the table actually sat at, and skipping it blocks nothing
- [ ] Group size 2 runs a round with no observer
- [ ] The profile points tab caps at 50 with "show more"
- [ ] The projector alone shows the current round's tables, roles and countdown

## Open Questions

1. Does the event room already model rounds (P1114, P1179, P1323)? Read before designing new state. UNVERIFIED.
2. Should choosing a statement to discuss be recorded (which one the pair picked)? It is one more tap and real research data.
3. Ramp the disagreement gap across rounds, or lead with the maximum every round?

## Related

- [p1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md) — registration, prep, the positions this spec groups on. **Shipped 2026-10-02**, so the gap signal this spec needs is live, not pending.
- [p1338](p1338_clarity_night_deck_cut_theory_and_run_rounds.md) — the deck: corrected roles slide, a seating slide the host screen casts into, and a slide carrying the recorder instruction
- [p1347](p1347_topics_page_attendees_rate_next_topics.md) — `/topics`, linked from the ending
- Prototypes: `/tree/compare-positions`, `/tree/host-controls` (branch `feature/p1337-round-controls`)
