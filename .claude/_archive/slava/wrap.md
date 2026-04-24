---
name: wrap
description: End-of-session close. Commits uncommitted changes, refreshes kanban, surfaces open questions. Zero questions — just acts.
when_to_use: End of any work session. The one command to run when you're done.
archived_reason: "replaced by autonomous commit rule in CLAUDE.md + /slava:maintain:kdd for session close"
disable-model-invocation: true
---

# /wrap

One command to close the session. No questions asked.

> **Principle:** Never end a session with invisible state or uncommitted work.

## What it does (in order)

```bash
git status --short                                              # what's uncommitted?
grep -rl "status: in.progress\|status: today" features/ 2>/dev/null  # open features?
python3 scripts/fix-frontmatter.py --dry-run 2>/dev/null | head -5   # frontmatter drift?
```

Then:

1. **If uncommitted changes exist** → fix any auto-fixable lint, stage explicit files, commit with a generated message. No asking.
2. **Frontmatter drift** → run `python3 scripts/fix-frontmatter.py` and re-stage.
3. **Refresh kanban** → `curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null`
4. **Surface open questions** → scan conversation for unresolved decisions, deferred TODOs, open "we should..." threads. List them in output.

**Only pause if:** a test failure suggests the commit might be wrong, or a secrets scan hits. Otherwise, commit.

**Never:** stash, reset, or take destructive git actions.

## Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Wrapped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Committed: <hash> — <message>   [or "nothing to commit"]
Open features: P427 (in-progress)   [or "none"]
Kanban: refreshed ✅

Open questions:
  ? Should /ship be archived now that /wrap auto-commits?
  [or "none"]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Relationship to other skills

- `/status` — read-only snapshot of this conversation (no actions). Run when you need to reorient mid-session.
- `/ship` — the commit primitive `/wrap` uses internally. Run directly only when you want JUST a commit with no session ceremony.
- `/kdd` — run after /wrap when the session had decisions or patterns worth capturing.
