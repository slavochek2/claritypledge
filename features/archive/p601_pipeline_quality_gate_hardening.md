---
status: rejected
type: task
rank: 1000027.0
workstream: foundation
created_date: "2026-03-28"
tags:
  - process
  - pipeline
  - quality
---

# TASK: P601 — Pipeline Quality Gate Hardening

## Goal

Implement 4 pipeline improvement initiatives identified by post-mortem analysis of P551/P590 Clarity Docs delivery. 20 manual fix commits were needed after "done" — all traced to rules that exist but aren't structurally enforced.

## Context

Post-mortem identified 6 root problems. Falsification narrowed 60 solutions to 24 survivors. Synthesis grouped them into 4 initiatives. Meta-insight: "Almost every problem traced back to a rule that exists but isn't structurally enforced."

## Initiatives (in priority order)

### I1: Visual QA as Hard Gate (2-3h)
**Problems addressed:** Visual QA structurally optional (P2)
- [ ] Edit `/verify` — Playwright as primary screenshot tool (not Chrome MCP)
- [ ] Edit `/ship` — require `/verify` artifacts before merge, display screenshots at decision point
- [ ] Edit `/dev` — spawn separate visual QA subagent (anti-confirmation-bias: no code context, only screenshots + checklist)
- [ ] Remove Chrome MCP fallback path from `/dev` UAT gate (no silent degradation)

### I2: Ground Before You Build (3-4h)
**Problems addressed:** Design system claims unverified (P1), product claims unverified (P4)
- [ ] Edit `/ui` — must read actual CSS/component files and quote file:line before making visual claims
- [ ] Edit `/dev` — Step 0: Playwright screenshots of every mentioned page BEFORE coding starts
- [ ] Edit `/spec-review` — add grounding pass: factual claims verified against source, ungrounded = BLOCK
- [ ] Trim `docs/design-system.md` — keep 10-line principles section only, strip token-level claims

### I3: Fill the Silence (2-3h)
**Problems addressed:** UX micro-decisions homeless (P3), missing feature detection (P5)
- [ ] Edit `/spec-review` — add "what's missing?" dimension (3 likely next-actions per flow) + "attack scenarios" (3 adversarial edge cases)
- [ ] Create `docs/technical/micro-decisions.md` — empty seed, grows from real decisions
- [ ] Edit `/dev` — if spec silent AND no default in micro-decisions.md: STOP and ask (not guess)

### I4: Tests That Catch Real Bugs (1-2h)
**Problems addressed:** Latent bugs survive delivery (P6)
- [ ] Edit `/generate-tests` — fixtures must model 2+ levels of relational depth, assert data shape completeness
- [ ] Edit `.claude/rules/tests.md` — ban presence-only assertions (`.toBeVisible()` alone insufficient, pair with count/content)

## Done When

- [ ] All 4 initiatives implemented
- [ ] Each initiative tested by running the relevant skill on a real feature
- [ ] Post-mortem `/postmortem` skill created (done: `.claude/commands/slava/maintain/postmortem/SKILL.md`)
