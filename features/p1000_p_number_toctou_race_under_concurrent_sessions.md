---
status: backlog
type: task
rank: 81
created_date: '2026-07-16'
tags:
  - infrastructure
  - process
  - concurrent-sessions
  - tooling
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1000: P-number and rank assignment races under concurrent sessions

## Problem

**Situation:** This repo routinely runs multiple concurrent Claude Code sessions/worktrees against one shared `features/` directory and one shared git checkout. `./scripts/next-p-number.sh` computes the next P-number by scanning the filesystem and git history at read time — no lock, no reservation.

**Complication:** During P997's KDD follow-up (2026-07-16), `next-p-number.sh` returned 998; the agent authored a full spec, a `decisions.md` entry, and an `INDEX.md` line referencing "P998" by hand across three files. Before commit, a concurrent session independently claimed P998 for an unrelated spec (`features/p998_shared_sa_remaining_consumers.md`) in the gap between the read and the commit — caught only by the pre-commit hook's duplicate-P-number check, which is a correctness backstop, not a prevention mechanism. Recovery cost: reset the commit, re-run the script (999), rename the file, and grep-and-fix three hand-typed cross-references. A `rank` collision happened in the same window (both sessions computed the same next-rank via `max existing + 1.0`).

This exact class of danger was named and deferred in [docs/decisions.md](../docs/decisions.md) 2026-06-10 `[process]` ("Concurrent-session danger is the ship-race atom") as a "candidate infra spec if the race recurs" — it has now recurred.

**Question:** How do we close (or at least narrow) the gap between reading a P-number/rank and committing the file that claims it, without adding a reservation-lifecycle burden (stale locks from abandoned sessions) that outweighs the toil it saves?

## Appetite

Low-medium blast radius (touches `next-p-number.sh`, the `create-spec` skill's numbering step, possibly `features.md`'s frontmatter conventions — all agent-tooling, no application code, no runtime users affected). Fully reversible (script/skill changes, no data migration). Low-medium decision density — the mechanism choice (recheck-only vs. deferred-binding vs. reservation lock) is an engineering trade-off the implementing agent can decide per `.claude/rules/rules.md`'s "Engineering Tradeoffs Are the Engineer's Call."

## Solution

Narrow the P-number/rank TOCTOU window using the cheapest combination that actually reduces recovery toil, informed by this session's finding:

1. **Recheck immediately before commit.** After the spec file is fully authored, re-run `next-p-number.sh` (or an equivalent lightweight check) right before `git add`/`git commit`. If the number has since been claimed by another file on disk, abort and rename before the commit, not after.
2. **Defer number binding where cheap.** Where a spec's prose doesn't need to reference its own number until late (title, frontmatter), consider whether a placeholder-then-substitute pattern reduces the "grep three files" cost of a late collision to "one substitution." Evaluate whether this is worth the added authoring complexity versus just re-running step 1 diligently — this is not mandated, only worth evaluating.
3. **Recompute `rank` alongside the P-number recheck**, since both races happened in the same window this session.

A file-lock/reservation mechanism (`features/reserved/pN` markers or similar) is explicitly a **fallback**, not the default: it closes the race completely but adds a reservation-lifecycle problem (stale reservations from crashed/abandoned sessions) and needs a shell-safety review. Only build it if the recheck-based approach proves insufficient in practice.

## Risks / Non-Goals

### Risks
- **Reservation-lock lifecycle risk (if that path is taken):** an abandoned session's reservation could permanently block a number. **MITIGATE — prefer recheck-based approaches first; if a lock is built, give it a TTL or require it to be tied to a live worktree the claim script can verify still exists.**
- **Over-engineering a rare race into a heavy mechanism.** This has now happened twice in the visible history (this session + the original 2026-06-10 note) — not weekly. **MITIGATE — start with the cheapest fix (recheck-before-commit); do not build the reservation lock speculatively.**

### Non-Goals
- Do NOT build a general distributed-locking system for `features/` — scope strictly to P-number/rank assignment.
- Do NOT change the ship/merge race handling (`git-ops.sh`, `main.lock`) — that's a separate, already-documented atom (2026-06-10 decision) with its own mitigations.
- Do NOT make P-number assignment synchronous/blocking across sessions (e.g., a server) — this is a single-repo, single-machine, low-frequency race; the fix should stay a local script/skill change.

### Alternatives Considered
- **Do nothing — rely on the pre-commit duplicate check.** Rejected as the sole mitigation: it already exists and already caught this session's collision, but it only detects after the toil (renaming files, fixing cross-references) has already been spent. The goal here is reducing that toil, not adding a first line of defense that doesn't exist.
- **Full reservation-lock system as the default.** Rejected as the starting point (see Risks) — treat as fallback only if lighter approaches prove insufficient.

### Rollback Strategy
Revert the script/skill changes. No data or schema involved; purely agent-tooling.

## Done-When

- [ ] `next-p-number.sh` (or the `create-spec` skill) rechecks the claimed number immediately before commit, and demonstrably catches a simulated same-window collision
- [ ] Rank collision is covered by the same recheck, not just the P-number
- [ ] Decision on placeholder/deferred-binding (build it or explicitly skip it, with reasoning) recorded in the spec or its KDD follow-up
- [ ] `docs/decisions.md` 2026-06-10 "ship-race atom" entry's "candidate infra spec" note is updated to reference this spec's resolution

## Origin

Flagged by `/kdd` on 2026-07-16 as a recurrence of the gap named in [docs/decisions.md](../docs/decisions.md) 2026-06-10 `[process]`: *"the structural fix... is specced nowhere... Candidate infra spec if the race recurs."* It recurred during this same KDD session (P998 collision, resolved by renumbering to P999).
