---
status: in-progress
type: task
rank: 366.499
workstream: C2
created_date: '2026-06-16'
tags:
  - gtm
  - webinar
  - events
  - funnel
delivery_stage: ship
pipeline_ran: [create-spec, challenge-prd, dev, ship]
---

# P939: Co-Founder Webinar — recurring events + registration copy + series-filtered /events view

> Demand-side companion to [P937](p937_webinar_funnel_landing_and_offers_page.md) (landing re-aim +
> /offers). P937 assumes a live webinar exists for its CTA to point at; this spec creates it.
> **CTA-target ownership moves here** — P937 shrinks to "point the CTA at this spec's `?series=`
> filtered `/events` URL" and must NOT build its own resolver/filter (avoid double-ownership).
> Update P937's Done-When to reference P939.

## Problem

**Situation:** P937 re-aims the homepage CTA at the co-founder webinar. A recurring Google Calendar
event (one shared Meet link, Thu 10:30 Berlin) already exists on the host's calendar; thepublic-facing webinars do not yet exist in cp `/events`, and the series is meant to run weekly,
open-ended, from now on.

**Complication:** Three things are missing before the funnel can run: (a) a continuous weekly series
of webinar rows in prod `/events`, seeded as a rolling window with low maintenance, (b) finalized
registration copy, and (c) a **series-filtered** `/events` view so the P937 CTA surfaces ONLY this
series' upcoming sessions. Without (c), the funnel CTA dumps website traffic into all events —
including unrelated physical ones — instead of the webinar a cold pair came to register for.

**Question:** Create the open-ended weekly series, lock the copy, and give P937 a stable
series-filtered URL that always shows this series' upcoming sessions with **zero founder maintenance**
as occurrences pass.

## Appetite

- **Blast radius — low.** Adds webinar rows to prod `events` (existing table, no schema change) and a
  client-side series filter on the existing `/events` list. No RSVP/auth/email changes, no migration,
  no new DB resolver. Unfiltered `/events` is unaffected (the filter is additive, param-gated).
- **Reversibility — high.** Events are deletable; the recurring Google event is deletable; the filter
  is a pure read.
- **Decision density — low.** Core decisions made this session (see Alternatives Considered). Open:
  Jan/Nejc quote attribution, save-story salary keep/cut, rolling-window size, final CTA label
  (P937 `[FOUNDER DECISION]`).

## Solution

**(1) Continuous weekly series — rolling `/events` rows.**

- **Google Calendar:** one recurring event, **open-ended** `FREQ=WEEKLY;BYDAY=TH` at 10:30 Berlin,
  `addGoogleMeetUrl` → one shared Meet link, forever (stop manually when desired). *Action: update the
  already-created event to drop `COUNT=4`.*
- **cp `/events`:** seed a rolling window of upcoming Thursdays as individual rows (recommend ~8 ≈ two
  months ahead) and top up when the window shrinks. Reuse `scripts/create-event.ts` (direct prod
  insert, service key, no Chrome); or `/re-create-event` / `/promote-all` series tooling **if** it
  does not pull in Chrome MCP (open question). Each prod insert needs an explicit founder `go`.
  **Window size: 8 Thursdays** (~two months ahead); top up to keep ~8 seeded.

| Field | Value |
|---|---|
| title | I've Lost Co-Founders. Here's How to Keep Yours. |
| host_id | `a99042ef-e740-446a-8734-389c8589cc17` (slava — verified from prod) |
| duration_minutes | 60 |
| timezone | Europe/Berlin |
| location | `https://meet.google.com/rdi-qdab-qca` (shared Meet link) |
| max_attendees | null (unlimited) |
| datetime (UTC = 10:30 CEST) | rolling weekly Thursdays from `2026-06-25T08:30:00Z` onward |

The title is a **stable prefix** (the series key — see (3)). Guest weeks append `— with [Guest]` to
ONE occurrence's title 5–14 days ahead; the prefix + host filter still match it. Editing an
occurrence's **description** is always safe and never affects matching.

**(2) Registration copy** — finalized this session after two adversarial conversion reviews. Renders
via `renderMarkdownSafe` (strips raw HTML → no `<details>` accordions; structured markdown only).
Baseline copy stays **guest-agnostic** (first runs are solo); guest weeks override that occurrence's
description to add the guest segment. Full text in [Registration Copy](#registration-copy) below.

**(3) Series-filtered `/events` view — replaces the single-event resolver.**

- **CTA target:** `/events?series=lost-cofounders` (exact param key is an `/architect` detail).
- **Filter:** when the `?series=` param is present, `/events` filters the upcoming list it already
  fetches (`getUpcomingEvents()`) to `title.startsWith("I've Lost Co-Founders")` **AND**
  `host_id === <slava>`. Client-side filter (`startsWith`, no SQL apostrophe escaping), **no
  migration, no tag column, no DB resolver function**.
- **Why both predicates:** the title prefix is the series key (reuses the existing `AI Running Club%`
  convention in `/re-create-event`); the `host_id` guard makes it collision-proof if a stranger ever
  reuses the exact long title. Series-only: each funnel points at its own webinar.
- **Auto-advance:** reuses the existing 5h grace logic in `getUpcomingEvents` — shows all of this
  series' upcoming sessions, advances as occurrences pass, and surfaces guest weeks for separate
  registration. Empty result renders the natural "no upcoming sessions" state — no special fallback
  target needed.

**Format (delivery, not code).** Fixed **open** (teachable core) + fixed **close** (offer + founding
discount + Q&A); **variable middle** — a live demo whose form the founder varies run-to-run: a featured pair, a single
participant, the whole room trying it via a shared code (then calling someone out), or an occasional
guest. Baseline copy promises the **outcome and a take-home (the free tool)**, never a specific
mechanic. Open/close stay rigid for conversion reliability and compounding delivery quality; a
guest is active only in the middle. The agenda's **middle slot (Live demo) is the single flex
point** — guest weeks override that occurrence's agenda (shorter presentation + a guest conversation
in place of the demo); the open (presentation) and close (Q&A) slots stay fixed. **First 1–2 runs
solo** to establish a clean conversion baseline before introducing guests (mission = learning speed;
format variance confounds the first read). All sessions recorded; verbal recording consent from any
demo participants/guests.

## Risks / Non-Goals

### Risks
- **Rolling window runs dry → CTA shows empty.** Mitigation: run `scripts/create-event.ts` (or
  `npm run seed-webinars` wrapper) every ~6 weeks — set a calendar reminder. Script is the one
  top-up command; no manual row entry. Empty-state renders "no upcoming sessions" gracefully. MITIGATE.
- **Series filter matches a wrong event.** A non-webinar reusing the exact title prefix. Mitigation:
  `host_id` guard excludes other hosts; the prefix is long and specific. ACCEPT.
- **Shared Meet link** — a prior week's attendees could rejoin a later session's room. Mitigation:
  host starts the room at the scheduled time; cp tracks RSVPs per-event regardless. ACCEPT.

### Non-Goals
- Do NOT rebuild RSVP/email capture — reuse the existing `/events` flow.
- Do NOT show the founding €500/pair price publicly — it stays the webinar-exclusive close.
- Do NOT build the landing/offers pages or the CTA wiring — that is P937; it consumes this spec's
  `?series=` URL.
- Do NOT add a tag/category column to `events` — use the existing title-prefix series convention
  (the `AI Running Club%` pattern in `/re-create-event`).
- Do NOT detect online vs physical from the `location` string — it is freeform `TEXT`, unstable. The
  series filter is online by definition.
- Do NOT build a single-event resolver (`resolveNextWebinar()`) — the series-filtered list replaces it.
- Do NOT change unfiltered `/events` behavior — the filter is additive and only applies with `?series=`.
- Do NOT fix the event-page timezone LABEL bug here (time renders in viewer tz but the label is
  hardcoded to the event tz, `EventDetail.tsx:396`) — separate small follow-up.

## Done-When

- [ ] Google Calendar event is open-ended weekly (`COUNT` removed); one shared Meet link.
- [ ] Rolling window of series rows live in prod `/events` (8 future Thursdays seeded; 10:30 Berlin; shared Meet link).
- [ ] Registration copy final (save story in; live/variable-format line in; Jan quote attribution resolved; salary keep/cut decided).
- [ ] `/events?series=lost-cofounders` shows ONLY this series' upcoming sessions (title prefix + host), auto-advances via the existing grace logic, surfaces guest weeks.
- [ ] Unfiltered `/events` unchanged (filter is param-gated, not a global change).
- [ ] P937 CTA wiring points at the `?series=` URL (P937 spec updated; no resolver/filter double-built).
- [ ] `tsc`, lint, build, tests green (filter has unit coverage: matches series, excludes wrong host/title, empty result renders fallback).

## Resolved Decisions

*From `/challenge-prd`. Persists as audit trail.*

| # | Finding | Resolution |
|---|---------|------------|
| BLOCK-1 | Builds direct-to-pair acquisition channel without acknowledging 2026-06-02 distribution pivot (coaches = P0, direct-to-pair retired) | **Accepted as secondary channel.** This is a deliberate parallel bet: H-WorkshopFormat (active P1) tests 1-to-many direct workshop conversion. Coaches remain P0 (H-CoachChannel); this webinar is secondary and coach-pointable (coaches can send pairs here). Update docs/decisions.md after first session. |
| BLOCK-2 | Rolling-window top-up had no owner, no alert, no failure mode — "top up before window shrinks" is not a mitigation | **Resolved.** Solution updated: `scripts/create-event.ts` (or a wrapper `npm run seed-webinars`) is the one-command top-up. Founder sets a calendar reminder every 6 weeks to run it. Empty-state grace: `/events?series=` renders a "no upcoming sessions" message — no silent failure. |
| WARN-1 | Title prefix apostrophe in `"I've Lost Co-Founders"` — Unicode vs straight quote failure vector in copy-paste | **Noted.** Script seeds title programmatically (not copy-pasted); the filter `startsWith` literal is defined in one place in code. /architect must define that literal as a constant and source both the seed script and the filter from it. |
| WARN-2 | Registration copy labeled "finalized" before any conversion signal | **Relabeled.** Copy is v1, untested. Conversion rate (CTA → RSVP) is the measurement. |

## Alternatives Considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| CTA target | Series-filtered `/events` list (`?series=`) | Single-event resolver `resolveNextWebinar()`; unfiltered `/events` | Filter reuses the existing list + grace logic (no resolver fn, no fallback target); unfiltered would dump funnel traffic into unrelated/physical events. |
| Series discriminator | Title prefix + `host_id` guard | New tag/category column (migration); online/physical detection from `location` | Reuses the existing `AI Running Club%` convention; no migration; `location` is freeform text and unstable to classify. |
| Cadence | Open-ended weekly + rolling rows | Fixed `COUNT=4` | Continuous funnel; founder stops manually; rolling top-up is the only maintenance. |
| Meet link | ONE shared (single recurring Google event) | 4+ unique links | cp tracks RSVPs per-event, so room isolation is redundant; one link is fewer moving parts. |
| Event creation | Reuse `scripts/create-event.ts` (or `/re-create-event` if no Chrome) | New skill; `/publish-event` (Chrome MCP) | Reuse existing tooling; Chrome MCP is token-heavy. |
| Guest format | Rigid open/close, variable middle; solo for first 1–2 runs | Guest interrupts throughout; guest from run 1 | Open/close are conversion-critical and compound; format variance early confounds the baseline conversion read. |

## Registration Copy

> Markdown; baseline (guest-agnostic) copy, same for every seeded occurrence. Guest weeks override the
> description of that one occurrence. Open placeholders marked inline.

**Title:** I've Lost Co-Founders. Here's How to Keep Yours.

About **65% of startups that fail, fail on co-founder conflict** [1]. But across 14 co-founders, I
learned the hard way: most of those conflicts were never real disagreements. They were
misunderstandings nobody checked, a silent assumption about equity, a "we agreed on this" that you
didn't.

In this **free 60-minute live session** I'll show you the one habit that surfaces those gaps before
they cost you months.

**Reserve two seats, yours and your co-founder's.**

---

**Why almost nobody checks.** You genuinely believe you were clear. Your co-founder genuinely
believes they understood. You're both wrong, because nobody verified. Even people who communicate for
a living miss it: 8 in 10 leaders think they're clear, half their people don't agree [2][3]. There's
a specific social reflex that makes checking feel awkward, exactly when the stakes are highest, so we
skip it. In the session I'll name that reflex, show the two cognitive biases that make the gap nearly
certain, and give you the one move that flips it, in under a minute, without making it weird.

**What you'll learn**
- **My story.** How I raised €398k *without product-market fit*, and why verifying understanding was
  the factor that closed the round, the sale, and the product. It's the same skill behind the best
  operators and the strongest partnerships.
- **What 14 co-founders taught me.** I lost the early ones to misunderstandings I didn't yet know how
  to catch: a co-founder who silently assumed we'd revisit the equity split (9 months lost), a
  technical co-founder who disagreed that 5 prospect rejections were enough to know the product was
  failing (7 months lost). I'll show how each gap hid as "conflict," and the question that would have
  surfaced it in week one.
- **One partnership I kept.** I worked with a co-founder for 3.5 years, and he disagreed with me
  constantly. He carried real risk with me — and it held because every time he pushed back, I made
  sure he felt heard, and when it mattered I made sure we actually understood each other before
  deciding. Only once we'd both verified would I ask him to back his case with evidence, and I'd
  accept that evidence. Disagreement stopped being friction the moment it was verified. I don't think
  we'd have lasted otherwise.
- **The fix.** How to rule out misunderstanding before you treat something as a real disagreement,
  when values and interests actually clash.

**Why both of you.** This works best as a pair. You'll watch the exact move that surfaces a hidden
gap, live, and leave able to run it with your co-founder yourselves using the free tool, in the
session or after. Solo attendees get the theory; pairs get the mirror. Strong founders do this on
purpose, it's not a sign anything's broken. Register, then forward your co-founder the confirmation.

**What to expect.** Every session is live, so no two run exactly the same. What's constant: you'll
leave with the one habit that surfaces the gaps before they cost you, and at the end I'll share the
Co-Founder Program with a founding discount for everyone who attends.

> "Real substance, not surface-level coaching. He opened up new perspectives around communication I
> hadn't fully seen before." — [Jan Barbarič](https://www.linkedin.com/in/janbarbari), Founder

**Agenda (60 min, live):** Presentation 20 · Live demo 10 · Q&A 30 (bring your own stories)

**Your host.** I'm Slava. I raised €398k without product-market fit, built B2B SaaS for six years,
and closed it down. I studied why partnerships break, published a 60-page research paper on
trust-building, and built ClarityPledge so founders can verify understanding before it costs them.
I've lost co-founders. I help you keep yours.

**Free platform, optional program.** The ClarityPledge app is **free and open source** — that's the
tool you'll practice with, and it's yours to keep. At the end of the session I'll spend a few minutes
on the **paid Co-Founder Program** for pairs who want structure, facilitation, and a signed Clarity
Partner Agreement, with a **founding discount for everyone who attends**. The session and the free
tool stand on their own, whether or not the program is for you.

**Reserve two seats, yours and your co-founder's. Free.**

*Sources: [1] Wasserman, HBS (via Entrepreneur.com) · [2] Axios HQ · [3] Radical Candor, The Trust
Gap · [4] Newton 1990, Stanford · [5] Camerer, Loewenstein & Weber 1989 · [6] Schegloff, Jefferson &
Sacks 1977*
