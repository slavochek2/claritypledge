---
globs: "*"
---

# Model + Effort Recommendation

At the start of any non-trivial task, before doing the work, volunteer a one-line model + effort call so the user doesn't have to ask. Format: `<task type> → <model>, <effort>` (e.g. "spec creation → Opus, xhigh").

**Honest constraint:** you cannot run `/model` or `/effort` yourself — they are human toggles. Recommend; the user flips. Never claim to have switched the session model or effort.

**Universal capability and delegation policy lives in `~/.agents/model-routing.md`.** In Claude,
the harness adapter is `/recommend-model-effort` (`~/.claude/commands/recommend-model-effort.md`):
Claude subscription lanes, its live quota, native model roster, and the optional external Gemini
executor. This rule is only the Claude always-on trigger. The cp-specific per-command list remains
in `/pick-flow` under "Model + effort".

**Three cp facts that rule doesn't cover:**

- **Never ask the user for their quota** — read `~/.claude/.quota-cache.json`. Missing file → fall back to default lanes and say so; never guess a percentage.
- **Subagent execution is already pinned to `sonnet` across the build/maintain skills** — no per-task call needed there.
- **Eligible external Gemini work goes through `~/.agents/bin/delegate-gemini`, never raw `dsh`** — eligibility must be established before the wrapper's defense-in-depth scan (exit 2 = do it inline, never edit the payload to get past it).

**Skip the call** for: one-liner fixes, typo edits, or when the user already named the model/effort this turn. Offer once per task, not per message.
