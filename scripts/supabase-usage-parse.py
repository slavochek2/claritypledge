#!/usr/bin/env python3
"""supabase-usage-parse.py — P1525. Reads the text of a Supabase dashboard Usage page (what the
Claude in Chrome get_page_text tool returns) and says how close each metric is to its free-plan limit.

Usage: supabase-usage-parse.py [--warn-pct N] [FILE]     (page text on stdin when no FILE)
Output, redirect-safe by design (no angle brackets or pipes, .claude/rules/shell-safety.md):
  ROW <label> <used> <limit> <pct> <over|under>   one per metric, first occurrence only;
                                       over/under is decided on the exact value, pct is truncated
  BANNER: <text>                       a grace-period or over-quota banner, when the page has one
  PROJECTS: <a, b>                     project names under the database-size section
  USAGE: <ok|problem|not-run> <plain detail>
Exit 0 ok, 1 problem (a metric at or over the threshold, or a grace-period banner), 2 not-run (no usage rows: signed out
or the wrong page). The percentage is computed here from used and limit; the printed one is ignored.
"""
import argparse, os, re, sys

# A unit may follow either side ("900 MB / 1 GB"); sizes are normalised to bytes before dividing.
ROW_RE = re.compile(r"^([\d,]*\.?\d+)\s*([A-Za-z]+)?\s*/\s*([\d,]*\.?\d+)(?:\s*([A-Za-z]+))?(?:\s*\(\d+%\))?$")
SIZE = {"B": 1, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12}
BANNER_RE = re.compile(r"grace period has started|over its quota", re.I)


def num(s):
    return float(s.replace(",", ""))


def scaled(value, unit, other):
    """A size unit scales the number; a bare number takes the other side's unit ('0.5 / 1 GB')."""
    u = (unit or other or "").upper()
    return num(value) * SIZE.get(u, 1)


def clean(s, n=80):
    return re.sub(r"[<>|]", " ", s).strip()[:n]


def parse(text):
    lines = [l.strip() for l in text.splitlines()]
    rows, seen, banner, projects = [], set(), "", []
    for i, l in enumerate(lines):
        if not banner and BANNER_RE.search(l):
            banner = clean(l)
        if l == "Manage Database Size" and i > 0 and lines[i - 1]:
            projects.append(clean(lines[i - 1], 40))
        m = ROW_RE.match(l)
        if not m:
            continue
        j = i - 1
        while j >= 0 and not lines[j]:
            j -= 1
        if j < 0:
            continue
        label = re.sub(r"UPCOMING$", "", lines[j]).strip()
        if not label or label in seen:
            continue
        seen.add(label)
        used = scaled(m.group(1), m.group(2), m.group(4))
        limit = scaled(m.group(3), m.group(4), m.group(2))
        if limit <= 0:
            continue
        rows.append((label, m.group(1), m.group(3), int(used / limit * 100), used / limit * 100))
    return rows, banner, projects


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--warn-pct", type=float, default=float(os.environ.get("QUOTA_WARN_PCT", "70")))
    ap.add_argument("file", nargs="?")
    a = ap.parse_args()
    text = open(a.file, encoding="utf-8").read() if a.file else sys.stdin.read()
    rows, banner, projects = parse(text)
    if "Usage Summary" not in text:
        rows = []  # a wrong page with an "x / y" line must not read as healthy usage
    for label, used, limit, pct, exact in rows:
        # pct is truncated for display; the last field is the decision, made on the exact value.
        print("ROW %s %s %s %d %s" % (label.replace(" ", "_"), used, limit, pct,
                                      "over" if exact >= a.warn_pct else "under"))
    if banner:
        print("BANNER: " + banner)
    if projects:
        print("PROJECTS: " + ", ".join(projects))
    if not rows:
        print("USAGE: not-run the Supabase Usage page did not load — sign in at supabase.com/dashboard in Chrome")
        return 2
    bad = sorted((r for r in rows if r[4] >= a.warn_pct), key=lambda r: -r[4])
    top = max(rows, key=lambda r: r[4])
    if not bad and banner:
        # The banner is about the PREVIOUS cycle, so early in a new one every metric can sit low
        # while restrictions are days away: that is still a problem, not ok.
        print("USAGE: problem grace period active, metrics under %g%% (highest %s %d%%)"
              % (a.warn_pct, top[0], top[3]))
        return 1
    if not bad:
        print("USAGE: ok all %d metrics under %g%% of the free plan (highest %s %d%%)"
              % (len(rows), a.warn_pct, top[0], top[3]))
        return 0
    shown = []
    for r in bad[:3]:
        cand = ", ".join(shown + ["%s %d%%" % (r[0], r[3])])
        if shown and len(cand) > 56:
            break
        shown.append("%s %d%%" % (r[0], r[3]))
    more = " +%d more" % (len(bad) - len(shown)) if len(bad) > len(shown) else ""
    print("USAGE: problem %s%s of the free plan" % (", ".join(shown), more))
    return 1


if __name__ == "__main__":
    sys.exit(main())
