---
status: backlog
type: story
disclosure: public
rank: 1000098
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - import
  - mirror-agent
  - data-in
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1457: Bring conversations in — import sources so the mirror agent can find moments

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"So as long as there is no data, there is nothing. Somehow people need to bring the data inside."*

## Intention

A mirror agent can only flag possible illusions of understanding in conversations it can see.
Let a user bring their conversations in: WhatsApp (via Beeper or a managed Docker container),
Slack, Fireflies/meeting transcripts, and our own /live and /transcribe sessions and event
recordings. Imported threads become chat threads the user (and their mirror agent) can work on.

## How the idea was born

2026-10-12. The founder: *"so as long as there is no data, there is nothing. Somehow people
need to bring the data inside."* On sources: *"it can be WhatsApp or it can be transcripts
from Slack or... Firefly... or /transcribe from Clarity Pledge... or /live."* On events: *"I
cannot organize so many events, but we already have WhatsApp import, pretty simple... and that
is also a way of charging people."* The P1437 prototype mocks one WhatsApp import so the
journey has a start.

## How it relates

- **P1437**: mocks this ("WhatsApp import · 7 messages"). This spec makes it real.
- **Placeholder P1458 (agents on other people)** and the mirror agent's flags digest both need it.
- **Events / live / transcription workstreams**: our own transcripts are the first source that
  needs no third-party integration.
- Blocks: the agent's flags digest working on real data.

## Why it matters

Chain: **data in** → find the moment. Without data the agent has nothing to flag and the user
must bring every moment by hand.

## Hypotheses to record (UNTESTED)

- **Events first.** Our own event transcripts are the cheapest first source.
  Falsifier: event attendees do not open flagged moments from their own session.
- **Managed WhatsApp container is chargeable.** Falsifier: no user pays for a managed import
  after a free trial.

## Deliberately out / trade-offs considered

- Live two-way sync (replying from Clarity Chat into WhatsApp). Import only, first.
- Per-customer custom integrations: later, when a customer asks.
- **Consent:** importing a chat imports the other person's words without their agreement.
  Needs a stated rule before any real build (visibility only to the importer, retention, delete).

## Open questions

- What is the consent model for the other person's messages?
- Where does the import run: our server, the user's container, the user's machine?
- Which source first: events (we own it) or WhatsApp (where conflicts live)?

## Done-when for promoting out of placeholder

- P1437 shows the flow works on mocked data, and a tester wants it on their own chats.
