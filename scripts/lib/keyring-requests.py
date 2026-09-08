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
    rows = []
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
            # Fall back to the PROGRAM, not the tail of its arguments. Taking the
            # last token printed fragments of inline scripts ("FormData()",
            # "Authorizatio") — noise where the answer should be.
            caller = f.get("caller", "").split()
            prog = os.path.basename(caller[0]) if caller else ""
            script = ""
            for tok in caller[1:4]:
                # An inline script arrives as one long argument; keep only a
                # filename-shaped fragment, never the code around it.
                m = re.search(r"([\w.-]+\.(?:mjs|js|sh|py|ts))", tok)
                if m:
                    script = os.path.basename(m.group(1))
                    break
            why = "(no reason) " + " ".join(x for x in (prog, script) if x) if prog \
                  else "(no reason given)"
        rows.append((age(stamp), f.get("key", "?")[:26],
                     spec_of(f.get("branch"), f.get("cwd"))[:8], why[:52]))

    # Collapse a run of identical requests. Five prompts in five minutes for one
    # key is the thing worth seeing, and five near-identical lines hide it.
    out = []
    for row in rows:
        if out and out[-1][1:4] == list(row[1:]):
            out[-1][4] += 1
            out[-1][0] = row[0]
        else:
            out.append([row[0], row[1], row[2], row[3], 1])
    for when, key, work, why, n in out:
        print("%-10s %-26s %-8s %s%s" % (
            when, key, work, why, ("   [x%d]" % n) if n > 1 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 10))
