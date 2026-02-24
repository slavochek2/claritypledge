---
status: backlog
type: story
rank: 125468.0
workstream: C1
created_date: 2026-02-24
tags: []
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P420: Filing Chat V2 — Open-Ended AI Calibration Conversation

## Problem Statement

V1 filing is a single-story, linear flow: brain dump → AI mirrors back → author rates → corrections → story filed. This works for one story at a time but doesn't capture how calibration actually happens in conversation — where multiple stories surface, context builds across exchanges, and the AI itself can hold a perspective worth filing.

V2 is a peer-relationship model: an open-ended chat where multiple stories emerge, the AI can file stories on its own behalf (asking the user to verify its understanding), and the conversation itself becomes the unit of work rather than a single story.

## Business Requirements

_To be filled in._

Key questions to resolve:
- How does the user navigate between "chatting" and entering a single-story creation sub-flow?
- Should AI-authored stories (AI's perspective) be a separate story type, or same type with different author attribution?
- How do stories get linked to each other when they emerge from the same conversation session?

## User Stories

- As a user finishing a /live free-flow session, I want to continue into a chat where multiple stories from that session can be filed without breaking flow.
- As a user, I want the AI to surface its own understanding as a story candidate and ask me to verify it, so calibration goes both ways.
- As a user, I want to see all stories that emerged from one chat session grouped together.

## Outcomes

- Users can file multiple stories in one sitting without restarting a new filing flow each time.
- AI-perspective stories become a first-class artifact (not just user stories).
- Stories emerging from the same conversation are traceable to that shared context.

## Next Steps

- Decide: AI-authored stories — separate type or attribution field on existing type?
- Design: navigation model between free chat and single-story sub-flow (modal? inline? separate panel?)
- Spec P419 (Filing Chat V1) and P425 (AI Story Core Loop) must ship before V2 builds on them.
- Run `/create-prd` when ready to move from concept to implementation planning.
