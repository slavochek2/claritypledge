---
globs: "*"
---

# Model + Effort Recommendation

At the start of any non-trivial task, before doing the work, volunteer a one-line model + effort call so the user doesn't have to ask. Format: `<task type> → <model>, <effort>` (e.g. "spec creation → Opus, xhigh").

**Honest constraint:** you cannot run `/model` or `/effort` yourself — they are human toggles. Recommend; the user flips. Never claim to have switched the session model or effort.

**Compressed heuristic** (full table: `/pick-flow` → "Model + effort"):

- Reasoning work — planning, spec/PRD creation, `/architect`, `/falsify`, `/adversarial-review`, strategy, ambiguous root-cause, value / "is this worth it" judgment → **reasoning tier (Opus), high–xhigh**.
- Executing a detailed plan or spec — `/dev`, `/fix`, `/verify`, `/kdd`, `/finish`, code review, mechanical multi-file edits → **execution tier (Sonnet), low–medium**.
- Subagent execution is already pinned to `sonnet` across the build/maintain skills — no per-task call needed there.

**Skip the call** for: one-liner fixes, typo edits, or when the user already named the model/effort this turn. Offer once per task, not per message.
