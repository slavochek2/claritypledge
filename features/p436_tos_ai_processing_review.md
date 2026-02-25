---
status: backlog
type: task
rank: 6
tags: [legal, ai, tos, stories]
created_date: 2026-02-25
blocked_by: [p425]
---

# P436: Review ToS for AI Processing Coverage

## Problem Statement

P425 ships a story-filing loop that sends user brain dumps and story content to the Anthropic Claude API. Before broadly promoting this feature, we need to confirm our Terms of Service explicitly covers AI processing of user-submitted content — or update them if not.

A one-time in-app disclosure is shown to users before the first Claude API call (P425 spec §Data Protection). This task confirms the legal backing for that disclosure.

## What Needs Checking

1. Does the current ToS cover transmitting user content to third-party AI providers (Anthropic)?
2. Is Anthropic's data retention / processing policy acceptable given our user expectations?
3. Does the disclosure copy in P425 match what the ToS says?

## When to Run

After P425 ships. Not a blocker for C1 (workshop) — the in-app disclosure in P425 is sufficient for the first workshop. Run this before broad public rollout.

## Acceptance Criteria

- [ ] ToS reviewed against Anthropic's data processing terms
- [ ] Either: ToS confirmed adequate, OR: ToS updated with AI processing clause
- [ ] In-app disclosure copy (P425) aligned with ToS language
