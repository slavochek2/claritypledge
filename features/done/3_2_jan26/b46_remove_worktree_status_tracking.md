# B46: Remove Worktree Status Tracking

## Problem

The `worktree_status` table can't be kept accurate:
- Agents don't maintain state across sessions
- Cloud can't see local, local can't see cloud
- Stale data creates false confidence (worse than no data)

## Decision

Delete it. Git branches are the source of truth for "what code is where."

## Tasks

### Database
- [ ] Drop `worktree_status` table (Supabase prod: `besjtuodziykmjidubzw`)

### CLAUDE.md
- [ ] Delete "Worktree Status Tracking (IMPORTANT)" section entirely (~lines 120-160)
- [ ] Replace with simple guidance: "To see what's on a worktree, check the branch: `git log --oneline -5`"

### telegram-command-handler.py
- [ ] Remove `get_all_worktree_status()` function
- [ ] Remove `update_worktree_status()` function
- [ ] Remove `format_worktree_status()` function
- [ ] Simplify `/status` command to show only:
  - Is agent running? (tmux check via SSH)
  - Current branch + last commit
  - Current task (from `/tmp/current-task.txt`)

### Cleanup
- [ ] Delete `features/b45_cloud_agent_status_not_updating.md` (superseded by this)
- [ ] Remove worktree_status mention from `features/p47_prototypes_subdomain.md` (line 152)
