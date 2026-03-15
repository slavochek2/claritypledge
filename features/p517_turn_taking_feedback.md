---
status: week
type: story
rank: 5.0
tags: [live, ux, feedback, turn-taking]
---

# P517: Turn-Taking, Listener Guidance, and Real-Time Feedback

## Problem

During live sessions, it's not clear:
- Who is currently speaking (no explicit "token" indicator)
- What the listener should do (explain back? ask a question?)
- How much each person agrees/understands in real-time

## Scope (Single Feature)

This combines three related observations into one feature:
1. **Speaker token** — visual indicator of who holds the floor
2. **Listener guidance** — explicit choices: "Explain back what I heard" OR "Ask a question"
3. **Real-time feedback sliders** — continuous agreement/understanding signal from both participants

<!-- NOTE: Explain-back prompting (app prompts user to paraphrase) is a future enhancement for the slider version. Not part of MVP. -->

## User Stories

- As a listener, I want clear options for what to do next, so I'm not confused about my role
- As a speaker, I want to see who has the floor, so turn-taking is unambiguous
- As both participants, I want to signal agreement/understanding in real-time, so feedback is continuous, not just at structured checkpoints

## Status

Backlog — product evolution feature. Needs `/ux` design before implementation.
