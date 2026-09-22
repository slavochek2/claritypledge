---
status: today
type: story
rank: 1
workstream: events
created_date: '2026-09-21'
tags:
  - events
  - registration
  - opt-in
  - survey
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1055
  - p1114
  - p1179
  - p1256
---

# P1336: Registering for a Clarity Night carries the opt-in, the prep and a disagreement survey

## Problem

**Situation:** Clarity Night #1 ran 2026-09-18. The opt-in to the meeting principle was a tap inside the
event room, with everyone present (P1114). Setup ate the practice time: too much theory, late arrivals
forcing repeats, pairs stuck together, and people unsure what to click
([goals.md](../docs/goals.md), "Event #1 ran 2026-09-18").

**Complication:** Every attendee opted in: all 11, 0 opted out (verified 2026-09-21 from prod room data;
the room held 12 members, one of them the host). A yes given in a room with the host present and everyone else saying yes partly measures the
room. With no variance, the pre-registered H-ChampionYield prediction (in-room opt-in predicts paid
conversion) cannot be read at all ([hypotheses.md](../docs/hypotheses.md) H-ChampionYield; article
idea a73). Events now run **weekly**, starting **event #2 on Tuesday 2026-09-29**, and the new active
focus needs every event to also surface people who could host a pilot inside a 100–1,000-person
organization ([decisions.md](../docs/decisions.md) 2026-09-21 [product]).

**Question:** What must a person do when registering so that the room starts with practice, not setup,
and so that the opt-in and the champion signal become readable data?

> Founder, 2026-09-21: *"registration opt-in — let's file spec!"* and *"first week physical event
> organization and prep improvement etc. so it can run next week."*

## Appetite

Blast radius: one flow — event registration, plus what the room reads from it. Reversibility: medium —
new answer data is stored per registrant; the form itself is a code revert. Decision density: several
founder calls, listed inline below.

## Solution

Registration for a physical Clarity Night gains five steps after the existing sign-in + RSVP:

1. **Opt in or out of the meeting principle**, alone at the keyboard, with the minimum needed to
   choose (the 2026-09-16 amendment to protocol silence applies here as it did to the deck).
   Recorded with a timestamp and marked as a *registration* opt-in, distinct from any room tap.
2. **~10-minute prep** — what the evening asks of you, the speaker/listener roles, one worked example.
   `[FOUNDER DECISION: prep content — reuse the event-1 deck's opening, or new]`
3. **Disagreement survey** — the attendee's position on a few statements on the event's topic, so the
   host can pair people who disagree (matching stays manual for now).
   `[FOUNDER DECISION: the statements for event #2's topic]`
4. **R&D recording volunteer** — yes/no, stating that consent is per pair and that volunteers pair only
   with each other (decisions.md 2026-09-16).
5. **Workplace question** — whether they work in a team or organization of about 100–1,000 people, and
   whether they would want this at work. `[FOUNDER DECISION: exact wording]`

Someone who registers but skips steps 1–3 is told plainly they will **observe**, not practise.
The host sees one list per event: who completed, each person's survey answers (for matching), R&D
volunteers, and workplace yeses (champion leads).

`[FOUNDER DECISION: does the in-room opt-in tap stay? Recommended: keep it as a second reading, so a
registration yes that becomes a room no is visible, but H-ChampionYield reads the registration answer.]`

## Invariants

- The registration opt-in is stored separately from the room tap and never overwritten by it. Event #1
  stays excluded from any H-ChampionYield read, and the change of instrument is recorded as a dated
  amendment, not silently.
- Recording consent stays per pair. Saying yes on the form never enrols someone into a recorded pair
  without a partner who also said yes.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fewer people register because the form is longer | ACCEPT | A drop in registration yeses is expected and is better data; observers still come |
| Confirmation and reminder emails silently lost (fire-and-forget, decisions.md 2026-09-07, P1256) | MITIGATE | The on-time reminder is part of the event-2 fix; check it sends for every completed registration |
| Not ready by 2026-09-29 | MITIGATE | Fallback for event #2 only: the same five questions as a plain form linked from the RSVP confirmation |
| Workplace answers are personal data about employers | MITIGATE | Host-only view; never shown to other attendees; covered by the privacy page |

**Non-Goals**
- Do NOT build automatic matching — the survey feeds manual matching.
- Do NOT change the event room's round flow; that is the event journey spec.
- Do NOT touch online or pilot events; this is physical Clarity Nights.

## Acceptance Criteria

- [ ] A new registrant for a Clarity Night can opt in or out, do the prep, answer the survey, choose R&D, and answer the workplace question, on a phone, without help
- [ ] A registrant who skips the opt-in, prep or survey is told they will observe
- [ ] The host sees, per event: completion, survey answers, R&D volunteers, workplace yeses
- [ ] The registration opt-in and the room tap are both visible for the same person and never merged
- [ ] Every completed registration gets its confirmation and on-time reminder, verified on event #2's list

## Open Questions

1. Which of this belongs to P1055 (the event's opt-in point set) versus here? P1055 predates event #1 and
   places the opt-in in the room; read it and amend it rather than build a second opt-in.
2. Does the event page for weekly events reuse one registration setup, so the host is not rebuilding the
   form each week?
3. Does the registration page need a short video of the opt-in moment from event #1? Source material:
   three phone clips from 2026-09-18 with timestamped transcripts, held locally in the founder's video
   library (`clarity-night-1-ai-safety-sep-2026/`, not in this repo). The 1:35 clip (~19:06) holds the
   opt-in exchange (*"you both opted in… what was your number? Eight."*). Decide here; produce a clip only
   if the page needs one. Attendee consent to publish is not yet asked.
   Update 2026-09-22: the 48-min main recording (starts 18:05) is also transcribed. Candidate stretches,
   all the founder speaking: **7:37–8:45** the three meanings of "understanding" (agreement / emotional /
   cognitive) · **19:38–20:58** the principle itself (right, promise, exception; the 0–10 question) ·
   **23:11–24:21** what opt-in vs opt-out means. The later two are interrupted by latecomers.

4. What does the registrant read before the opt-in/opt-out choice? Founder direction 2026-09-21: reuse the
   event-1 explanation of **cognitive understanding** (deck `public/presi3/`, "Cognitive Understanding?"
   slides + speaker notes) and the ready screen, as text/screens first; a clean recorded version may
   follow once the wording has held for an event or two. What is opted into (founder's correction,
   2026-09-21): the commitment is only to **answer "how much do you understand my intended meaning,
   0–10?"** when asked — the minimum principle. The "below 8, don't push the disagreement" use is a
   separate suggestion the host makes in the meeting, not part of what registration asks people to accept.

## Related

- [p1055](p1055_norm_measurement_instrument.md) — the CMP point set; the opt-in it defines
- P1114, P1179 — the event room and its opt-in tap
- decisions.md 2026-09-21 [product] (champion focus), 2026-09-18 [product] (the tap is the answer),
  2026-09-16 [product] ×2 (pair consent; minimum before the opt-in), 2026-09-07 [technical] (P1256)
