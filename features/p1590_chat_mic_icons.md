---
status: week
type: story
rank: 82
workstream: product
created_date: '2026-10-29'
tags: [chat, voice, ui]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
---

# P1590: Chat composer mic icons that cannot be confused

## Problem

P1576 shipped two voice actions side by side in the chat composer: a grey in-field button that
dictates into the text field, and a round blue button that records and sends a voice note. The
blue button shows a waveform icon, which reads as "AI voice mode" rather than "voice note", and
WhatsApp/Telegram users expect a mic there. Risk: a user who meant to dictate sends audio
instead, which cannot be taken back like a typo.

Evidence: a 375px mockup of six variants, critiqued by Gemini 4 Argon (2026-10-29), rated today's
layout high mis-tap risk. Founder answered P1576 Open Question 0 with "different icons" and
approved this variant ("okok", 2026-10-29).

> Founder framing, verbatim: "Show me all the options and tell me what you recommend and why." Then, on A2 + blue mic: "okok"

## Decision (2026-10-29): founder's swapped icons

Drawn like the real composer (one box), today has one mic: grey mic dictates, blue waveform sends a
voice note. A blue mic plus a grey mic would put two mics in one box. Founder proposed the swap:
> "the wave and then ah-ah in gray and then blue mic ... it clarifies that the wave is the ah-ah in a sense that transcribe and people are not confused with other things where it's like in Gemini Go Live"

Approved: "good yes lets do". Earlier drafts (grey mic + Aa, keep as is) are rejected.

## Appetite

Blast radius: one component pair (composer). Reversibility: git revert. Decision density: zero,
decided above.

## Solution

- Round blue voice-note button: waveform icon becomes a standard mic (WhatsApp convention).
- In-field dictation button: waveform with a small "Aa" tag (voice becomes text). Only one mic in the box.
- Both stay visible at all times.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| "Aa" tag is cramped at phone width | MITIGATE | Check at 320px and 375px; keep the 40px touch target |
| Users still mis-tap | ACCEPT | Founder phone test after ship is the measure |

**Non-Goals**
- Do NOT change recording, dictation, or send behaviour; icons and accessible labels only.
- Do NOT hide either button based on field state.

## Acceptance Criteria

- [x] In an empty chat on a phone, the blue button shows a mic and the in-field button shows a waveform with "Aa"
- [x] Accessible labels unchanged: "Record a voice message" and "Dictate a message"
- [x] Screenshots at 320px, 375px and desktop show no overflow or clipping in the composer

## Related

- P1576 (shipped): chat mic dictation and voice notes, Open Question 0.
