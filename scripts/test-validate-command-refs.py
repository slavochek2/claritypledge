#!/usr/bin/env python3
"""Hermetic canary for scripts/validate-command-refs.py (P1116).

A gate you have not watched FAIL is unproven (epistemic gate 7). A validator is the worst
offender in that class: it exits 0 both when everything resolves and when it silently
scanned nothing. So every case below pins an exit code AND the reason for it, and the
fixture cases run against a throwaway tree with `--root`, so the real ~/.claude/commands
cannot resolve a reference the fixture never defined.

Usage: python3 scripts/test-validate-command-refs.py     # exit 0 = green
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VALIDATOR = os.path.join(ROOT, "scripts", "validate-command-refs.py")

failures = []
checked = 0


def run(args):
    p = subprocess.run([sys.executable, VALIDATOR] + args, capture_output=True, text=True,
                       timeout=60)
    return p.returncode, p.stdout + p.stderr


def case(label, args, want_rc, want_in_output=None, want_not_in_output=None):
    global checked
    checked += 1
    rc, out = run(args)
    problems = []
    if rc != want_rc:
        problems.append("exit %d, wanted %d" % (rc, want_rc))
    if want_in_output and want_in_output not in out:
        problems.append("output missing %r" % want_in_output)
    if want_not_in_output and want_not_in_output in out:
        problems.append("output unexpectedly contains %r" % want_not_in_output)
    if problems:
        failures.append("%s: %s\n      %s" % (label, "; ".join(problems), out.strip()[:400]))
        print("  FAIL %s -- %s" % (label, "; ".join(problems)))
    else:
        print("  ok   %s" % label)


def fixture(claude_md, rules=None, commands=()):
    """Build a throwaway repo tree. commands = iterable of paths under .claude/commands."""
    d = tempfile.mkdtemp(prefix="p1116-refs-")
    with open(os.path.join(d, "CLAUDE.md"), "w") as fh:
        fh.write(claude_md)
    rules_dir = os.path.join(d, ".claude", "rules")
    os.makedirs(rules_dir)
    for name, body in (rules or {}).items():
        with open(os.path.join(rules_dir, name), "w") as fh:
            fh.write(body)
    for rel in commands:
        full = os.path.join(d, ".claude", "commands", rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        open(full, "w").close()
    return d


print("== the real repo: must pass as it stands (Done-When: passes on CLAUDE.md after P1113) ==")
case("real repo resolves clean", [], 0, want_in_output="all resolve")
case("real repo, --report lists resolved refs", ["--report"], 0, want_in_output="  ok  ")

tmpdirs = []
try:
    print("== a deliberately broken pointer must FAIL ==")
    d = fixture("Run `/dev` then `/nonexistent-command` to finish.\n",
                commands=["slava/build/dev.md"])
    tmpdirs.append(d)
    case("dead pointer in CLAUDE.md", ["--root", d], 1,
         want_in_output="/nonexistent-command does not resolve")

    d = fixture("See CLAUDE.md.\n",
                rules={"git.md": "Route through `/ghost-skill` first.\n"},
                commands=["slava/build/dev.md"])
    tmpdirs.append(d)
    case("dead pointer in .claude/rules/", ["--root", d], 1,
         want_in_output="/ghost-skill does not resolve")

    print("== a pointer that resolves ONLY into archive/ must FAIL (the P1113 shape) ==")
    d = fixture("When shipping, run `/old-ship`.\n",
                commands=["slava/archive/old-ship.md"])
    tmpdirs.append(d)
    case("archived-only pointer", ["--root", d], 1,
         want_in_output="resolves ONLY into an archive namespace")

    print("== resolution forms that must PASS ==")
    d = fixture("Run `/dev`, `/slava:build:dev`, `/verify`, and `/slava:build:finish`.\n",
                commands=["slava/build/dev.md", "slava/build/verify/SKILL.md",
                          "slava/build/finish/SKILL.md"])
    tmpdirs.append(d)
    case("bare, namespaced, and SKILL.md forms", ["--root", d], 0, want_in_output="all resolve")

    print("== a MENTION marked retired is reported, not failed ==")
    d = fixture("## Business Layer (from /create-prd - legacy, now /product-owner enrichment)\n",
                commands=["slava/build/dev.md"])
    tmpdirs.append(d)
    case("retired-annotated mention", ["--root", d], 0,
         want_in_output="the line marks it retired")

    print("== non-command tokens must not be mistaken for pointers ==")
    d = fixture(
        "Files live in docs/technical/ and /Users/x/y. See https://claude.ai/code and and/or.\n"
        "Routes: /live, /me, /sessions. Built-ins: /model, /effort, /compact.\n"
        "Paths: `/tmp/pw.log`, `/src`, /*.md\n",
        commands=["slava/build/dev.md"])
    tmpdirs.append(d)
    case("paths, URLs, routes, built-ins", ["--root", d], 0, want_in_output="all resolve")

    print("== must NOT pass vacuously when there is nothing to resolve against ==")
    d = fixture("Run `/dev`.\n", commands=[])
    tmpdirs.append(d)
    case("empty command tree refuses to pass", ["--root", d], 1,
         want_in_output="refusing to pass vacuously")
finally:
    for d in tmpdirs:
        shutil.rmtree(d, ignore_errors=True)

print("---")
print("%d cases checked" % checked)
if failures:
    print("FAIL: %d case(s) regressed" % len(failures))
    for f in failures:
        print("   - %s" % f)
    sys.exit(1)
print("PASS: all cases behave as expected")
sys.exit(0)
