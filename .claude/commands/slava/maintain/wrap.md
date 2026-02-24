---
name: wrap
description: End-of-session housekeeping — checks uncommitted changes, refreshes kanban, surfaces open questions. Lightweight close ritual, ~30 seconds. Run at end of any session, with or without /kdd.
when_to_use: End of any work session. Before context compaction. Any "are we clean?" moment.
---

# /wrap

Quick session close. Are we clean?

> **Principle:** Never end a session with invisible state. Make everything visible before you stop.

## Usage

```bash
/wrap    # End-of-session housekeeping
```

---

## Checklist (run in parallel)

```bash
git status --short                                              # uncommitted changes?
grep -rl "status: in.progress\|status: today" features/ 2>/dev/null  # open features?
python3 scripts/fix-frontmatter.py --dry-run 2>/dev/null | head -5   # frontmatter drift?
curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null  # refresh kanban
```

**Note:** `git stash` operations are never initiated by agents. Do not act on stash state without explicit user instruction.

---

## Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Wrap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Uncommitted: [list files, or "clean ✅"]
Open features: [P-numbers with in-progress status, or "none"]
Frontmatter: [issues found, or "clean ✅"]
Kanban: refreshed ✅

Open questions / decisions deferred:
  [list any unresolved things from this session, or "none"]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If uncommitted changes: ask "Commit now? (y/n)"
If open features not actioned: no action needed — just visibility.

---

## Relationship to /kdd

`/kdd` step 5.5 runs a **subset** of this checklist (git status + frontmatter + kanban refresh). It does NOT check open features or surface open questions. `/wrap` is the complete version.

Run `/wrap` solo when you want to close cleanly without the full knowledge capture ceremony. If you run `/kdd`, you still get basic housekeeping but not the full `/wrap` output.
