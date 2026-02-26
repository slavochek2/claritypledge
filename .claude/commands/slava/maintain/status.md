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

Dropped / open:
  ? [unresolved decisions, interrupted threads, or "we should..." items that didn't close]

Next:
  → [one concrete thing — the most important action right now]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rules

- **Done:** Only things completed or meaningfully advanced in this conversation
- **Problems:** Errors, failures, or blockers encountered in this session — surface even if you worked around them. Include minor friction (flaky tests, hook fights, repeated retries) — not just hard blockers. Never omit this section if anything went sideways.
- **Dropped / open:** Decisions deferred, threads that got interrupted mid-conversation, unresolved trade-offs, "we should..." items that never closed — anything you'd want to pick up next time
- **Next:** ONE command or action. Use this logic in order:
  1. If active work is clearly unfinished → `→ continue [specific next task]`
  2. If session looks like it's wrapping up (Done list is substantial, no clear next task):
     - If uncommitted changes exist → `→ commit, then /kdd`
     - If everything committed → `→ /kdd` (if work worth capturing) or `→ /day-end` (only after 20:30 local time — before that, suggest the next feature or task instead)
  3. If mid-session with clear next step → name it specifically
  - `.claude/` files or `CLAUDE.md` changed → also note `→ /claude-md "description"` to validate
  - UI files (`*.tsx`) modified → also note `→ /verify` for visual QA
- **Do NOT suggest `/kdd` or commit mid-session** when there's clearly more work ahead — only surface them when the session looks like it's winding down
- If nothing done yet: `Done: session just started`
- If no problems: omit the Problems section entirely
- If no open questions: omit that section
- **Never** scan features/, git log, or external state — answer from conversation memory only

## Related

- `/kdd` — Capture learnings after a feature worth remembering
- `/verify` — Visual QA in live browser
- `/claude-md` — Validate CLAUDE.md / rules changes before applying

## Activity Log (silent, auto-runs after every /status)

After outputting the status block, silently append one line to `.private/logs/activity.log` using the Bash tool. No output to user.

**Step 1 — extract these values from the output you just generated:**
- **active_val**: P-numbers from Done or Dropped/open, comma-separated no spaces (e.g. `P425,P437`), or `—`
- **blocked_val**: one phrase from Problems section, max 40 chars, no `|` characters (use semicolon instead), or `—`
- **next_val**: text after `→` in the Next line, max 50 chars, no `|` characters

**Step 2 — construct and run the exact command with real values substituted in.** Never write the words "active_val", "blocked_val", or "next_val" in the command — replace them with the actual extracted strings. Example of what a correct command looks like:

```bash
mkdir -p .private/logs
echo "2026-02-25T14:32 | check | active: P425,P437 | blocked: auth flow | next: /kdd to capture learnings" >> .private/logs/activity.log
```

The timestamp must use `$(date +%Y-%m-%dT%H:%M)` as a shell subshell — that part runs dynamically. The three value fields you fill in manually.
