"""Migration directories of in-flight work: every OTHER git worktree of this repo.

Test is where an unshipped branch applies its migrations before /ship, so a table or
policy can be live on test while main has no migration for it. The drift checks call
that "created by no migration" and gate on it every day until the branch ships, which
reports normal pipeline state as a security finding (founder, /day 2026-10-29).

This module only ENUMERATES. Each check parses the returned directories with its own
parser and decides what an in-flight object means. Prod is never exempt: nothing
reaches prod except through main.
"""
import os
import subprocess


def inflight_migration_dirs(main_root):
    """[(branch, migrations_dir)] for every worktree except the main checkout."""
    try:
        out = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=main_root, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    found, path, branch = [], None, None
    for line in out.splitlines() + [""]:
        if line.startswith("worktree "):
            path, branch = line[len("worktree "):], None
        elif line.startswith("branch "):
            branch = line[len("branch "):].removeprefix("refs/heads/")
        elif not line and path:
            mig = os.path.join(path, "supabase", "migrations")
            if (os.path.realpath(path) != os.path.realpath(main_root)
                    and branch not in (None, "main") and os.path.isdir(mig)):
                found.append((branch, mig))
            path, branch = None, None
    return found
