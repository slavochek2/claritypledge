---
status: backlog
type: story
rank: 125488.0
workstream: foundation
created_date: 2026-02-26
tags:
  - sim
  - testing
  - two-party
---

# P447: Two-Party Simulation — Simultaneous Persona Runs

## Problem

ClarityPledge features (p422 agreement, live sessions) involve two parties interacting. Current `/sim` runs one persona at a time as a single user. This means we can't simulate the interactive two-party dynamic: Solo Founder creates, Invited Party accepts, both are in a live session together.

## Solution

Run two browser automation sessions simultaneously — one as each party — using different auth sessions. The `localhost` vs `127.0.0.1` URLs allow two separate authenticated sessions in the same browser (different cookie jars).

## Architecture

- Session A: `http://localhost:5001` — Solo Founder (initiator)
- Session B: `http://127.0.0.1:5001` — Invited Party (reactive participant)
- Both run as Claude in Chrome agents, coordinated by the `/sim` orchestrator
- Orchestrator sends messages between agents at decision points ("Session A has sent invite — Session B proceed to accept")

## Acceptance Criteria

- [ ] Two personas can be run simultaneously against the same local server
- [ ] Orchestrator script handles coordination between sessions at key handoff points
- [ ] Findings from both perspectives captured in the sim report
- [ ] Works for p422 (agreement create → invite → accept) and p426 (live session)

## Testing

Run `/sim p422 --two-party` with Solo Founder + Invited Party personas. Verify both complete the full agreement flow and findings are merged into a single report.
