#!/usr/bin/env python3
"""Render the credential request log as something answerable at a glance.

The raw log carries every field needed to investigate an unexpected request.
That makes it unreadable when all you want to know is: how long ago, which
piece of work, and what was it doing. This prints those three.
"""
import datetime
import os
import re
import sys


def age(stamp):
    try:
        then = datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return "?"
    secs = (datetime.datetime.now() - then).total_seconds()
    if secs < 90:
        return "just now"
    if secs < 3600:
        return "%dm ago" % (secs // 60)
    if secs < 86400:
        return "%dh ago" % (secs // 3600)
    return "%dd ago" % (secs // 86400)


def spec_of(branch, cwd):
    """Which piece of work: the P-number if the branch names one, else the
    worktree slot, else the branch."""
    m = re.match(r"^(?:feature|fix)/(p\d+)", branch or "")
    if m:
        return m.group(1)
    m = re.search(r"worktrees/(w\d+)", cwd or "")
    if m:
        return m.group(1)
    return branch or "?"


def main(path, limit):
    if not os.path.isfile(path):
        print("No credential requests recorded yet.")
        return 0
    with open(path) as fh:
        lines = [l for l in fh if l.strip()][-limit:]
    if not lines:
        print("No credential requests recorded yet.")
        return 0
    print("%-10s %-26s %-8s %s" % ("WHEN", "KEY", "WORK", "WHY"))
    for line in lines:
        f = {}
        parts = line.strip().split(" | ")
        stamp = parts[0] if parts else ""
        for part in parts[1:]:
            if "=" in part:
                k, v = part.split("=", 1)
                f[k.strip()] = v.strip()
        why = f.get("reason", "")
        if why in ("(no reason given)", ""):
            # Fall back to the calling command, which usually says enough.
            caller = f.get("caller", "")
            why = "· " + (os.path.basename(caller.split()[-1]) if caller else "no reason given")
        print("%-10s %-26s %-8s %s" % (
            age(stamp), f.get("key", "?")[:26],
            spec_of(f.get("branch"), f.get("cwd"))[:8], why[:60]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 10))
