# Process Learnings

Friction log for workflow, tooling, and agent behavior. Surfaced in `/weekly` step 2.5.

**Format:** Each entry has a `Status:` field. `/weekly` surfaces all `Status: proposed` entries.

---

## 2026-02-25: Over-phasing instinct on skill file changes

**Status:** done
**Root cause:** Risk calibration mismatch
**Friction:** Proposed phased rollout (implement /status append first, wire /day-end + /weekly consumers later) treating skill prompt edits like code deployments. User correctly pushed back — consumers are just prompt instructions, full implementation costs the same as partial.
**Proposed fix:** Applied inline — MEMORY.md updated with rule: "phased rollout = overhead for skill file edits." Decisions.md has full context.
**Resolved:** 2026-02-25

---

## 2026-02-25: Meta-reflections from /kdd were ephemeral by default

**Status:** done
**Root cause:** No designated home for process observations that don't rise to a full decision
**Friction:** /kdd step 6 outputs meta-reflections to chat only. Reusable patterns (e.g. "review agent as quality gate") were lost after session unless manually captured.
**Proposed fix:** Applied — three-tier routing: reusable workflow patterns → decisions.md [process]; actionable friction → this file; quick behavioral notes → MEMORY.md. /kdd step 6 already says "if action is small, apply it now."
**Resolved:** 2026-02-25
