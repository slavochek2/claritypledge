---
status: backlog
type: story
rank: 4.0
milestone: M3
tags: [connections, social-graph, clarity-partner, known-unknown]
prepped_date: '2026-02-24'
depends_on: [p422]
delivery_stage: draft
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-24
---

# P431: Connections Model

Future feature — not scheduled.

## Problem Statement

As the platform grows, users need a way to understand their relationships with others beyond just active agreements. A connections model would introduce relationship types and enable richer social discovery.

**Proposed connection types:**
- **Known** — both users recognize each other (have had at least one /live session together)
- **Unknown** — one-sided recognition (e.g. public figure)
- **Clarity Partner** — have an active Clarity Partner Agreement (P422)

**Why it matters:**
- Enables semi-public visibility (2nd-degree connections can see agreements) — currently deferred
- Enables messaging / Clarity Chat between connected users
- Enables "people you may know" discovery
- Clarity Partner becomes an upgrade of a Known connection

**Data model note (from P422):** P422 already stores both parties as user references (not ephemeral identifiers). These references seed the connections model without requiring migration.

**Deferred because:** P422 validates the agreement concept first. Connections are only valuable once there are enough agreements to make the graph meaningful.

## Next Steps
Do not prioritize until P422 has proven adoption (≥10 active agreements).
