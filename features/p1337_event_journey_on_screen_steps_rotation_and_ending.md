---
status: qa
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
delivery_stage: dev
pipeline_ran:
  - create-spec
  - dev
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

**Complication:** Events now recur — **#2 on 2026-10-06, #3 on 2026-10-20** (founder, 2026-10-02:
fortnightly rather than weekly, to leave room for outreach and to prepare several topics up front
from the room's votes). The cadence is **not fixed**, so nothing here may assume a weekly rhythm:
the closing step shows whatever the next published event is. The format changed on 2026-09-28 to
**trios** — three rounds
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

**One tap marks what they chose.** On the compare view each row carries *"we're talking about this
one"*. Tapping another row moves the mark; tapping the marked row clears it; **anyone at the table
can tap it, observer included, last tap wins**. It is a note, not a permission. Without it a
recording is fifteen minutes of audio and a guess about which statement it concerns. (Settles open
question 2 of the previous draft.)

**At the end of each round**, an optional *"did your position move?"* — captured while the
conversation is still in their head, in a moment they are already looking at the phone.

### 4. The compare view

`/compare/:person?tag=<tag>` — the statements both people hold a position on, **sorted by largest
gap, every tag, no exception**, each row showing the two positions side by side in the pattern the
letters flow already uses (`letter-reveal-ordinal.tsx`, "Where you each stand"). A plain list: no
swiping, no cards to dismiss, no modes — **two people share one phone**, so a one-person gesture
excludes the other, and hiding the non-current rows is wrong when the job is choosing together.
Agreements sort last and stay visible: that is where false agreement hides.

**It reuses the letter vocabulary, not a new one** (founder, 2026-10-02): GravatarAvatar and the
blue stance pill from `letter-reveal-ordinal.tsx:50-83`, the statement in `letter-point-card.tsx`'s
pinned gray-50 card, `POSITION_FULL_LABELS` wording. **Blue on both sides, never green/red** — the
letters flow is deliberate about this, and red-against-green reads as a verdict on who is right. No
"N steps apart" meta line: the sort carries the comparison without narrating it.

**Entry point: a "Compare with me" control at the top of a profile's Points tab** — not the profile
header, which would show it on the Stories tab where there is nothing to compare. Deliberately
**not** wired into `/admin/users`: a profile button is everyone's feature, an admin row is an
admin-only one. The tag is a **selector on the page**, so the same screen compares you with anyone
on an event's statements or on a standing tag, with no link to generate.

**Rows open the point in a new tab.** The comparison must stay underneath — they are mid-round.

An earlier draft said the CMP set must keep its own order rather than being gap-sorted. That was
wrong: P1055's ordering constraint governs **when the room stakes and sees things during the
evening**, not how a two-person page lists statements both people have already staked. The P1055
rule that does bind here: **do not show CMP positions to anyone while people are still staking.**

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
left, swap two people by hand (the case no algorithm can know), Recompute. Press *Start round* → **60
seconds** for the room to find tables (founder, 2026-10-03, down from 90 after walking it through: enough to walk, read the statement and tap; still a healthy push) → 6 / 6 / 3. One clock for the whole room; a round that is not
ended simply continues; past zero the clock reads **"Time's up +2:30"** (founder, 2026-10-04: "over"
was unclear), and a strip under the clock names the parts — Tables · Speaker 1 · Speaker 2 · Observer.

The panel also shows **past rounds** — who sat where, in which role — which is the only way to answer
"who was Ana with when she said that?", and a **print view** of the current grouping (no PDF
download; the browser's share sheet covers it).

**The panel is one surface: the people grid** (founder, 2026-10-04 walkthrough — reverses the
2026-10-02 two-surface split, which put a "who's here" list beside the grid and duplicated every name).

| Part | What it carries |
|---|---|
| **Tables** | Each person as a tile: photo (pledge ring), first name, live role. Tap → swap or Out. Undo · Regroup. |
| **Next round** | In the room, not seated this round — they join the next one. Before round 1 it reads **Here**. |
| **Out** | One state, out until the host taps **Back in** (replaces "Sit out" + "Left"). |
| Under the button | **Round N settings** — group size and the three grouping toggles. |
| Past rounds | The same grid, fixed; summary "Round 1 · 5 of 6 tapped in". |

**No fixed number of rounds, and no "End evening"** (founder, 2026-10-04: "I can decide myself how
many rounds I run"). The button is always *Next round*; the grouping still plans three rounds ahead
so nobody repeats a partner, and past the third it plans one at a time (DB limit: 9). The last round
simply reads "Time's up"; the room page stops showing rounds once the event ends.

**The way in:** *Run this event* on the event page, and — because the host spends the evening in the
room — the same link at the top of the room page, host-only. On a desktop the panel splits: clock and
button on the left, the room on the right.

**Founder walkthrough 2, 2026-10-04:**
- *Desktop:* the people on the left, the controls on the right (sticky). Phone: controls first.
- *Roles are columns,* one header row with the printed role cards' letters — **S** on burnt orange
  (#C2410C), **L** on blue (#1864AB), **O** neutral — trading S and L when the speakers swap. No
  per-tile role label. The orange is a deliberate, single-place exception to the design system's
  "no orange" (`RoleBadge.tsx`): the screen matches the card in people's hands.
- *Host-only marks on every tile* (never on the projector): ✓ prepared, 🎙 recording volunteer with
  the mic connector they need (reusing P1386's marks), and a red dot when their transcription is
  live right now — a new host-gated read, `get_event_transcribing_now` (migration
  20261004120000; profile ids only, live = consent, not ended, device seen < 10 min).
- *The strip is in proportion:* Tables 1 · Speaker 6 · Speaker 6 · Observer 3 minutes; the
  projector prints each part's minutes under it.
- *The projector scales to one screen* from 6 to 40 people (`round-screen-layout.ts`: try every
  column count, keep the largest type; 40 people = 5 × 3 tables at 23px on 1080p).
- No instruction text ("Tap a name…" removed); **Out** is a red-outlined button, **Back in** blue.

**Founder walkthrough 3, 2026-10-04:**
- *Regroup removed* — with nothing changed it rebuilt identical tables and read as a dead button.
  In its place **Seat now** beside "Next round": late arrivals join the running round without
  moving anyone (two or more open a new table; one observes at the smallest), `seatLate`.
- *Projector:* smaller (type ≤ 34px, round number quiet), the clock is the hero, the strip has no
  "Tables" step (it showed no movement), thicker bars that fill visibly, and a **bell** — once at
  the speakers' swap, once when the observer starts, three times on Next round — synthesised
  with WebAudio, muted until the host taps the bell icon (browsers allow sound only after a tap).
- *Host grid columns are fixed:* "Speaker 1 · Speaker 2 · Observer"; the S/L badge beside each
  shows who speaks now and the speaking column's label is bold. "Time's up" is no longer red.
- *Known, accepted (Codex review):* `host_set_round_seats` and the attendee writers do not refuse
  an ended round. Host-only for seats, and the panel no longer ends rounds, so no migration now.

**Roles read Speaker / Listener / Observer, never first / second.** The stored role says who speaks
first; the pair swap when Speaker 1 ends, and every surface shows the live role (`liveRole`). Adding
still needs no control — opening the event room puts you in the pool for the next round.

**The override control: variant A, confirmed by the founder on a phone, 2026-10-02.** Tap a name,
tap who it trades with; a committed trade produces an "Undo X ↔ Y" control. The whole room stays
above the fold with 52px targets. (Prototype `/tree/host-controls`; B loses the room mid-change and
puts the table number in low-contrast grey, C's vocabulary contains no *move* and no *swap* so it
cannot do the job directly and reshuffles uninvolved people in public.)

**Measured constraint:** at 320px the name tiles are 78px and long names truncate to "Aleksan…".
Use first name plus initial, or a two-line tile at narrow widths.

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

- [x] An attendee who has never used the room can follow a full evening on their phone without asking the host what to click
- [x] Each person observes exactly once and pairs twice across three rounds, with no repeated partner
- [x] Each round, the two non-observers are shown the statement they are furthest apart on, and can open the compare view for it
- [x] A late arrival is grouped in the next round with no host action
- [x] A person who leaves without telling anyone leaves a table of two, and the round still runs
- [x] The host completes a full evening using only: ring bell, press Next round
- [x] A host can swap two people by hand and see the result without scrolling, and undo it
- [x] A host can tap a name and mark them Out, and the next round is computed without them
- [x] "Compare with me" appears at the top of a profile's Points tab and opens the comparison for that person
- [x] Changing the tag on the compare page re-sorts it for that set, largest gap first
- [x] Opening a statement from the compare page leaves the comparison on screen
- [x] The host panel shows past rounds with table and role per person
- [x] The confirm tap records the table actually sat at, and skipping it blocks nothing
- [x] Group size 2 runs a round with no observer
- [x] The profile points tab caps at 50 with "show more"
- [x] The projector alone shows the current round's tables, roles and countdown

**Evidence (dev, 2026-10-02, test DB):** `e2e/p1337-rounds.spec.ts` 11/11 (host gate + Run this event, Start round → trios, swap + Undo, attendee card + "I'm at table N" with the rest of the page usable, late arrival "You join at the next round", dark phone + observer clock, "Did your position move?", projector tables/roles/clock, Left → excluded next round with an untapped person not blocking anything, group size 2 no observer, End evening after round 3 using only the one button — superseded 2026-10-04: no End evening, the button stays Next round); `e2e/integration/p1337-event-rounds-db.spec.ts` 11/11 (host-only writes, sequential rounds, room-only seats, own-seat confirm, swap keeps/clears the tap, topic last-tap-wins and cleared when a table's people change, presence host-only, no direct writes); `src/lib/round-grouping.test.ts` 19/19 (observe once + no repeat partner for 15 people over 4 seeds, 16/14 layouts, max gap, recorders together, determinism); `src/tests/p1337-compare-page.test.tsx` + `compare-positions.test.ts` (gap sort, tag chip re-sorts, rows open in a new tab); `p1337-profile-points-cap.test.tsx` 3/3 with a raised-cap control failing 2/3. Screenshots at 375/320/1280 reviewed by an independent visual QA pass. The first AC is evidenced by the flow tests and screenshots; the real test is the next event.

## Open Questions

1. ~~Does the event room already model rounds?~~ Answered in dev: no. Rounds are new state (`event_rounds`, `event_round_seats`, `event_round_tables`, `event_round_presence`, migrations `20261002183700` + `20261002193000`).
2. ~~Ramp the gap or lead with the maximum?~~ Built as maximum every round (founder's lean, taken as the default at /dev).
3. Does the statement-pick tap actually get used, or does the room ignore it? Worth one event before deciding whether to keep it.

## Related

- [p1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md) — registration, prep, the positions this spec groups on. **Shipped 2026-10-02**, so the gap signal this spec needs is live, not pending.
- [p1338](p1338_clarity_night_deck_cut_theory_and_run_rounds.md) — the deck: corrected roles slide, a seating slide the host screen casts into, and a slide carrying the recorder instruction
- [p1347](p1347_topics_page_attendees_rate_next_topics.md) — `/topics`, linked from the ending
- Prototypes: `/tree/compare-positions`, `/tree/host-controls` (branch `feature/p1337-round-controls`)
