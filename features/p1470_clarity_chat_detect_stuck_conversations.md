---
status: backlog
type: story
rank: 319
workstream: clarity-chat
created_date: '2026-10-13'
tags:
  - clarity-chat
  - mirror-agent
  - detection
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1470: Detect stuck conversations — one scan on import, then rarely

## Problem

**Situation:** The Clarity Chat prototype (P1469) assumes the mirror agent finds "stuck
conversations": moments where two people may mean different things by the same words. It shows
them as cards (one quote, "If you don't mean the same thing: …", Clarify / Dismiss).

**Complication:** No detector exists for this. `/slava:understanding:detect` is the closest piece,
but it targets work decisions and scores stakes in time and money first, so relational moments may
not rank. And how often a person has such moments is unknown: for the founder it is rare, and the
frequency likely depends on the role.

**Question:** Who has stuck conversations often enough for automatic detection to pay, and what
would detect them reliably?

> Founder framing, verbatim (2026-10-13): *"Maybe we cannot build it because we don't know if there
> is a use case. … If our users are something like Scrum Masters that have a lot of stuck
> conversations or misunderstandings or something, then sure. But we don't know."*

## Hypotheses (recorded, untested)

- **H-role:** people who coordinate others (scrum masters, coordinators, people making high-stakes
  decisions with several parties) have stuck conversations often enough for automatic detection to
  matter. UNTESTED. Falsifier: a sample of such users' one-to-one chats yields no moment a month
  they would send a letter about.
- **H-shape:** one scan of the whole history at import, then a light daily check that speaks only
  when it finds something, beats a fixed cadence (a weekly "top 3" pads with weak moments when real
  ones are rare). UNTESTED.

## Appetite

Blast radius: one new capability, private data. Reversibility: high (nothing ships without it).
Decision density: high: who the user is decides whether to build at all.

## Approach

1. Decide the target user (H-role) before building; until then the prototype's entry is the user's
   own pick ("Ask <agent name>").
2. Draft the detection rules for a two-person exchange: quote-anchored, ranked by what is still
   unchecked, and returning nothing rather than padding.
3. Test on a known-positive set (conversations the user already knows were stuck, not named to the
   detector) and an open set; the user scores the top results.
4. Only if useful: make it a skill (`understanding` namespace), with Codex reviewing the skill's
   text only.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Other people's private messages sent to external models | MITIGATE | Run detection only where the user's data already is; never send message content to a second vendor for review |
| A detector that pads weak moments trains users to ignore it | MITIGATE | Return nothing when nothing qualifies; never a fixed count |
| Opening old wounds by surfacing past conflicts | ACCEPT | The user chooses Clarify or Dismiss; nothing is sent without them |

**Non-Goals**
- Do NOT build before the target user is decided.
- Do NOT scan group chats in the first version; misunderstandings there are mostly between others.

## Done-When

- [ ] Target user decided and recorded, with the evidence behind it.
- [ ] Detection rules tested on a known-positive set and an open set; results scored by the user.
- [ ] Decision recorded: build the skill, or keep only the user's own pick.

## Related

- [P1469](p1469_clarity_chat_letter_loop_v6.md) (the prototype assumes this works) ·
  [P1457](p1457_clarity_chat_data_import.md) (import, which triggers the first scan).
- `/slava:understanding:detect` (closest existing piece; evidence-anchoring rules reusable).
