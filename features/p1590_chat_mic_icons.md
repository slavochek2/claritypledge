---
status: week
type: story
rank: 82
workstream: product
created_date: '2026-10-29'
tags: [chat, voice, ui]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

## Appetite

Blast radius: one component pair (composer). Reversibility: git revert. Decision density: zero,
decided above.

## Solution

- Round blue voice-note button: waveform icon becomes a standard mic (WhatsApp convention).
- In-field dictation button: mic with a small "Aa" tag, so the two buttons never look identical.
- Both stay visible at all times (founder rejected hide-until-typing: it hides dictation from an empty chat).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| "Aa" tag is cramped at phone width | MITIGATE | Check at 320px and 375px; keep the 40px touch target |
| Users still mis-tap | ACCEPT | Founder phone test after ship is the measure |

**Non-Goals**
- Do NOT change recording, dictation, or send behaviour; icons and accessible labels only.
- Do NOT hide either button based on field state.

## Acceptance Criteria

- [ ] In an empty chat on a phone, the blue button shows a mic and the in-field button shows a mic with "Aa"
- [ ] Accessible labels unchanged: "Record a voice message" and "Dictate a message"
- [ ] Screenshots at 320px, 375px and desktop show no overflow or clipping in the composer

## Related

- P1576 (shipped): chat mic dictation and voice notes, Open Question 0.
