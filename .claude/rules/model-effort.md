---
globs: "*"
---

# Model + Effort Recommendation

At the start of any non-trivial task, before doing the work, volunteer a one-line model + effort call so the user doesn't have to ask. Format: `<task type> → <model>, <effort>` (e.g. "spec creation → Opus, xhigh").

**Honest constraint:** you cannot run `/model` or `/effort` yourself — they are human toggles. Recommend; the user flips. Never claim to have switched the session model or effort.

**Full routing logic lives in the global skill `/recommend-model-effort`** (`~/.claude/commands/recommend-model-effort.md`) — cost lanes (subscription vs free credits vs cash), the live quota read from `~/.claude/.quota-cache.json`, the benchmark roster, and when to delegate bulk work to free Gemini. It is the single source of truth; this rule is the always-on trigger and deliberately carries no table. The cp-specific per-command list is in `/pick-flow` → "Model + effort".

**Three cp facts that rule doesn't cover:**

- **Never ask the user for their quota** — read `~/.claude/.quota-cache.json`. Missing file → fall back to default lanes and say so; never guess a percentage.
- **Subagent execution is already pinned to `sonnet` across the build/maintain skills** — no per-task call needed there.
- **Delegating bulk work to free Gemini goes through `~/.claude/bin/delegate-gemini`, never raw `dsh`** — the wrapper is the gate that refuses secrets/PII/private paths (exit 2 = do it inline, never edit the payload to get past it).

**Skip the call** for: one-liner fixes, typo edits, or when the user already named the model/effort this turn. Offer once per task, not per message.
