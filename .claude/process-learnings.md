# Process Learnings

Proposed improvements that don't have a clear fix yet. When resolved, delete the entry and add a `[process]` entry to `docs/decisions.md`.

---

## Registry-to-disk drift for skill files

**Status:** proposed
**Observed:** 2026-02-28 — `/ss` skill was in the global skill registry but `.claude/commands/slava/ss.md` didn't exist on disk. Caused "Unknown skill" error. Required `git log --all` + `git show` to diagnose and restore.
**Root cause:** File was deleted from git at some point (possibly during a branch clean-up or rebase) while the registry entry survived.
**Problem:** No mechanism detects registry entries that have no corresponding file. Drift is invisible until the skill is invoked.
**Potential fixes to explore:**
- A `/maintain:cleanup` step that validates all registry skill entries have matching files
- Pre-commit check: if a `.claude/commands/slava/*.md` file is staged for deletion, warn if it appears in skill registry
**Blocking:** No obvious mechanical fix yet — needs design.
