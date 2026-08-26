---
name: status
description: Session snapshot — what happened in THIS conversation. Problems, open questions, next step. Read-only, no actions taken.
when_to_use: After context compaction. Mid-session "where are we?". Before /kdd to confirm what to capture.
version: 1.0.0
---

## Dispatch

Before spawning: compose a session summary from this conversation — list Done items, Problems, Dropped/open threads, and what's Next. The subagent cannot see conversation history; this summary is its only source of session context.

Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: the skill instructions below + the session summary you composed above.
The subagent runs the required git commands and formats the status block using both live git state and the provided session summary.
Report subagent output verbatim, then run the Activity Log step yourself (the subagent cannot append to local files reliably — do the `echo >>` in the main session).

# /status

This conversation only.

> **Scope:** What happened since this chat opened. Not git history, not the backlog, not other sessions.

## Output format (≤15 lines, no preamble)

Before outputting, run these commands to get live state:
1. `git branch --show-current` — for the "Working on" line
2. `git worktree list` — split into: worktrees used THIS session ("Working on") vs others ("Other worktrees")
3. `git stash list` — to check for stashes (include ⚠ Stashes section if any exist)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Working on: {branch or worktree where THIS session's changes landed} ← e.g. "main", "w1 → feature/p492-... (port 5100)", "main + w1"
Other worktrees: {w2 → feature/pM-...} ← only worktrees NOT used in this session; omit line if none
⚠ Stashes: {stash@{0}: description} ← include only if stashes exist; omit section if none
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
     - If uncommitted changes exist → `→ commit, then /ship pN` (if P-number work) or `→ commit, then /kdd`
     - If everything committed and P-number work was done → `→ /ship pN to close spec + deploy` (if not yet shipped this session)
     - If everything committed and already shipped → `→ /kdd` (if work worth capturing) or `→ /day` (only after 20:30 local time — before that, suggest the next feature or task instead)
  3. If mid-session with clear next step → name it specifically
  - `.claude/` files or `CLAUDE.md` changed → also note `→ /slava:maintain:claude-md "description"` to validate
  - UI files (`*.tsx`) modified → also note `→ /verify` for visual QA
  - If `.finish-reviewed` doesn't exist and session has uncommitted or recently committed changes → note `→ /finish` to review before shipping
- **Do NOT suggest `/kdd` or commit mid-session** when there's clearly more work ahead — only surface them when the session looks like it's winding down
- If nothing done yet: `Done: session just started`
- If no problems: omit the Problems section entirely
- If no open questions: omit that section
- **Never** scan features/ or review the full backlog — the template's git state commands are the only external state allowed

## Related

- `/kdd` — Capture learnings after a feature worth remembering
- `/verify` — Visual QA in live browser
- `/slava:maintain:claude-md` — Validate CLAUDE.md / rules changes before applying

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
