---
name: status
description: Session snapshot — what happened in THIS conversation. Problems, open questions, next step. Read-only, no actions taken.
when_to_use: After context compaction. Mid-session "where are we?". Before /kdd to confirm what to capture.
---

# /status

This conversation only. No git commands, no scanning features/, no project-wide view.

> **Scope:** What happened since this chat opened. Not git history, not the backlog, not other sessions.

## Output format (≤15 lines, no preamble)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done:
  ✓ Added ESLint auto-fix hook + wired into settings.json
  ✓ Two CLAUDE.md rules (prod-first debug, browser verify)
  ✓ /ship skill created

Problems / blockers:
  ⚠ [anything that failed or is stuck in this session]

Open questions:
  ? [unresolved decisions or deferred threads from this chat]

Next:
  → [one concrete thing — the most important action right now]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rules

- **Done:** Only things completed or meaningfully advanced in this conversation
- **Problems:** Errors, failures, or blockers encountered in this session — surface even if you worked around them
- **Open questions:** Decisions deferred, unresolved trade-offs, "we should..." threads that didn't close
- **Next:** ONE command or action. Infer the right skill from what was done — don't default to a generic line:
  - Substantial work shipped (feature, fix, refactor) → `→ /kdd` to capture learnings
  - `.claude/` files or `CLAUDE.md` changed → `→ /claude-md "description"` to validate
  - UI files (`*.tsx`) modified → `→ /verify` for visual QA
  - Active in-progress work remains → `→ continue [specific next task]`
  - Nothing outstanding → `→ /day-end` or `done`
- If nothing done yet: `Done: session just started`
- If no problems: omit the Problems section entirely
- If no open questions: omit that section
- **Never** scan features/, git log, or external state — answer from conversation memory only

## Related

- `/kdd` — Capture learnings after a feature worth remembering
- `/verify` — Visual QA in live browser
- `/claude-md` — Validate CLAUDE.md / rules changes before applying
