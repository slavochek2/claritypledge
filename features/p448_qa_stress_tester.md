---
status: backlog
type: task
rank: 125489.0
workstream: foundation
created_date: 2026-02-26
tags:
  - sim
  - testing
  - stress
  - qa
---

# P448: QA Stress Tester — Adversarial Sim Pass

## Problem

User persona sims (Solo Founder, Coach, etc.) follow realistic usage patterns. They don't probe edge cases, malformed inputs, boundary conditions, or adversarial behavior. A dedicated stress-testing pass is needed to surface robustness issues that real users would eventually hit.

## Solution

A second pass within `/sim` that runs after user persona sims. The Stress Tester is not a user persona — it's an adversarial QA agent that:
- Submits empty inputs, very long inputs, special characters
- Clicks buttons rapidly (race conditions)
- Navigates away mid-flow and returns
- Attempts actions in wrong sequence
- Tries with no network (simulated offline)
- Tests mobile viewport behavior

## Pipeline Position

```
/sim pN --personas     # user experience pass (default)
/sim pN --stress       # adversarial pass (optional, run when hardening for production)
```

## Acceptance Criteria

- [ ] Stress tester agent defined as a separate adversarial persona file
- [ ] `/sim --stress` flag triggers the adversarial pass
- [ ] Findings categorized separately from UX findings (bugs vs experience)
- [ ] At least 10 adversarial test patterns documented

## Notes

- Lower priority than user persona sims — implement after `/sim` core is stable
- Browser automation constraints (no true concurrency) limit rapid-click testing
- Most valuable for: form submissions, chat input, agreement signing flow
