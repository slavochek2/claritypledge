#!/usr/bin/env python3
"""Every /command named in an instruction file must resolve to a command that exists.

WHY THIS EXISTS (P1116, group 3). This is the root-cause fix for the dead-pointer class.
P1113 remapped a routing line in CLAUDE.md after its target had already been archived --
the rule pointed at a command that no longer existed, nothing caught it, and nothing today
prevents the next one. Instruction files are the one place where a broken reference is
invisible: no import fails, no test goes red, the agent simply reads a route to nowhere
and improvises. That is the same failure shape as an always-on rule that does not fire.

SCOPE, deliberately narrow: CLAUDE.md and .claude/rules/*.md -- the always-on layer, where
a dead pointer is re-read in every session. Skills and docs are not scanned; validate-doc-
links.cjs already covers markdown links, and widening this would turn a gate into a tax.

RESOLUTION follows how Claude Code actually resolves a command, verified against this
repo's tree rather than assumed:
    /slava:build:dev  ->  .claude/commands/slava/build/dev.md      (or .../dev/SKILL.md)
    /dev              ->  any command file whose basename is `dev` in either root
Both the project root (.claude/commands) and the user root (~/.claude/commands) count,
because CLAUDE.md legitimately routes to global skills (/kdd-private, /slava:think:falsify).

A reference that resolves ONLY inside an `archive/` namespace FAILS. Archiving is how a
command is retired, so a live routing line pointing into archive/ is precisely the P1113
defect, and it would otherwise look identical to a healthy pointer.

Usage:
    python3 scripts/validate-command-refs.py            # exit 0 = green, 1 = dead pointer
    python3 scripts/validate-command-refs.py --report   # list every resolved ref too
    python3 scripts/validate-command-refs.py --root DIR # scan a fixture tree (canary only;
                                                        # DIR also becomes the only command
                                                        # root, so ~/.claude never leaks in)
"""

import os
import re
import subprocess
import sys

_argv = sys.argv[1:]
HAVE_USER_ROOT = True
if "--root" in _argv and _argv.index("--root") + 1 >= len(_argv):
    sys.exit("validate-command-refs.py: --root requires a directory argument")
if "--root" in _argv:
    ROOT = os.path.abspath(_argv[_argv.index("--root") + 1])
    # A fixture must be hermetic: the user's real command tree would otherwise resolve
    # references the fixture never defined, and every negative case would pass vacuously.
    COMMAND_ROOTS = [os.path.join(ROOT, ".claude", "commands")]
else:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    COMMAND_ROOTS = [os.path.join(ROOT, ".claude", "commands")]
    # The user's global command tree is NOT in this repo. Five always-on routing lines
    # legitimately point into it (/slava:maintain:claude-md, /slava:build:simplify,
    # /slava:think:falsify, /falsify, /adversarial-review), so on a machine that has it we
    # resolve against it — but its ABSENCE must never fail the gate. It did, in the first
    # shipped version: with HOME elsewhere this produced 10 errors and, wired
    # unconditionally into pre-commit, blocked EVERY commit on a fresh clone, in CI, on a
    # second machine, and for every contributor to this public repo. The gate's own
    # remediation text then told them to "correct the reference" — i.e. to delete routes
    # that are correct. Found by the P1116 adversarial review; the canary could not catch
    # it because it always ran with the author's HOME.
    _USER_ROOT = os.path.expanduser("~/.claude/commands")
    HAVE_USER_ROOT = os.path.isdir(_USER_ROOT)
    if HAVE_USER_ROOT:
        COMMAND_ROOTS.append(_USER_ROOT)

_RULES_DIR = os.path.join(ROOT, ".claude", "rules")
TARGETS = [os.path.join(ROOT, "CLAUDE.md")] + sorted(
    os.path.join(_RULES_DIR, f)
    for f in (os.listdir(_RULES_DIR) if os.path.isdir(_RULES_DIR) else [])
    if f.endswith(".md")
)

# A candidate is a slash-token not preceded by a path/URL character, so `docs/x`,
# `https://a.io/b`, `and/or` and `/Users/...` never reach the resolver.
CANDIDATE = re.compile(r"(?:^|[^A-Za-z0-9_/.:~\\-])(/[a-z][a-z0-9-]*(?::[a-z0-9-]+)*)")

# Built-in CLI commands: real, invocable, but backed by no file in any command tree.
BUILTINS = {
    "/model", "/effort", "/compact", "/clear", "/config", "/help", "/init", "/login",
    "/logout", "/resume", "/review", "/loop", "/code-review", "/ultrareview", "/schedule",
    "/agents", "/context", "/cost", "/doctor", "/memory", "/permissions", "/vim",
    "/terminal-setup", "/statusline", "/mcp", "/bug", "/exit", "/hooks", "/output-style",
    "/workflows", "/fast",
}

# NOT commands: app routes, filesystem paths, and glob fragments that happen to share the
# leading-slash shape. Each entry is a deliberate declaration, not a blanket suppression --
# an undeclared unresolved token FAILS, which is what makes the gate mean anything.
NOT_COMMANDS = {
    # product routes (src/App.tsx)
    "/live", "/app", "/me", "/agreements", "/sessions", "/chat", "/tree", "/point",
    "/coach", "/founder", "/offers", "/webinar", "/experiment", "/letter", "/join",
    "/events",
    # filesystem paths written with a leading slash in prose
    "/src", "/tmp", "/file", "/server", "/p", "/uat", "/docs", "/features", "/scripts",
    "/e2e", "/supabase", "/public", "/dist", "/node-modules", "/or", "/exclude",
}

# A HISTORICAL MENTION IS DECLARED, NEVER INFERRED.
#
# The first version inferred it: a line containing "legacy", "archived", "no longer" etc.
# excused any unresolvable ref on it. The P1116 adversarial review broke that twice --
# "The /dead-command flow is no longer optional, always run it" passed (an ACTIVE mandatory
# routing line), and one marker amnestied every ref on its line. Narrowing the vocabulary
# and requiring proximity fixed both cases and still leaked on "Legacy note. Always run
# /dead-one" -- because prose about legacy and a retired pointer are not distinguishable by
# proximity, at any window size.
#
# So the escape is now explicit: name the exact "<file>:<ref>" here with a reason. Prose can
# never trigger it, and every exception is greppable and reviewable in one place. Empty
# today, which is the point -- the repo has no dead pointers.
KNOWN_RETIRED = {
    # ".claude/rules/example.md:/old-command": "P123 archived it; line is historical.",
}


def command_files():
    """basename -> [paths], and namespaced-path -> [paths], across both command roots."""
    by_base, by_path = {}, {}
    for root in COMMAND_ROOTS:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for fn in filenames:
                if not fn.endswith(".md"):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root)
                parts = rel.split(os.sep)
                if fn == "SKILL.md":
                    name_parts = parts[:-1]
                else:
                    name_parts = parts[:-1] + [fn[:-3]]
                if not name_parts:
                    continue
                by_path.setdefault(":".join(name_parts), []).append(full)
                # PAYLOAD FILES ARE NOT COMMANDS. `rules/` and `references/` hold content a
                # skill loads, not invokable commands, and indexing them by basename let
                # `/js-early-exit` and `/conn-pooling` satisfy references to commands that
                # do not exist (P1116 adversarial review).
                if "rules" not in parts[:-1] and "references" not in parts[:-1]:
                    by_base.setdefault(name_parts[-1], []).append(full)
    return by_base, by_path


def is_archived(path):
    return os.sep + "archive" + os.sep in path


def strip_inline_noise(line):
    """Drop URLs so their path segments never become candidates."""
    return re.sub(r"https?://\S+", " ", line)


def read_target(path):
    """Content of `path` AS IT WOULD BE COMMITTED: the index if tracked, else the worktree.

    Reading the worktree made this gate hostile in a repo whose own git.md treats concurrent
    sessions on a shared checkout as the norm: a co-tenant's half-written rules file, staged
    by nobody, blocked every OTHER session's unrelated commit — and the failure text told the
    blocked session to go edit that in-flight work. Verified before the fix (P1116
    adversarial review). Reading the index is also the more correct semantics for a commit
    gate: judge what is being committed. It does not weaken the archive-later case, which is
    the reason this check is not scoped to staged files — when a command is archived, the
    referring file is unchanged in the index and its now-dangling ref still fails.
    """
    if "--root" not in _argv:
        rel = os.path.relpath(path, ROOT)
        try:
            p = subprocess.run(["git", "show", ":" + rel], cwd=ROOT,
                               capture_output=True, text=True, timeout=10)
            if p.returncode == 0:
                return p.stdout.splitlines(True)
        except Exception:
            pass
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.readlines()


def main():
    report = "--report" in sys.argv
    by_base, by_path = command_files()
    if not by_base:
        print("✗ no command files found under any command root — refusing to pass vacuously")
        return 1

    dead, archived, resolved, annotated, unverifiable = [], [], [], [], []
    for target in TARGETS:
        if not os.path.isfile(target):
            continue
        rel_target = os.path.relpath(target, ROOT)
        for lineno, line in enumerate(read_target(target), 1):
            clean = strip_inline_noise(line)
            for ref in CANDIDATE.findall(clean):
                if ref in BUILTINS or ref in NOT_COMMANDS:
                    continue
                name = ref[1:]
                # A NAMESPACED ref must match its namespace. Falling back to the bare
                # leaf let `/slava:maintain:dev` (fictional namespace) resolve via
                # `slava/build/dev.md` — which is the P1113 defect this gate exists to
                # catch, passing green (P1116 adversarial review).
                hits = by_path.get(name) or []
                if not hits and ":" not in name:
                    hits = by_base.get(name) or []
                if hits and not all(is_archived(h) for h in hits):
                    resolved.append((rel_target, lineno, ref))
                elif "%s:%s" % (rel_target, ref) in KNOWN_RETIRED:
                    annotated.append((rel_target, lineno, ref, line.strip()))
                elif hits:
                    archived.append((rel_target, lineno, ref, hits[0]))
                elif not HAVE_USER_ROOT:
                    # Cannot resolve what we cannot see. Report, never fail.
                    unverifiable.append((rel_target, lineno, ref))
                else:
                    dead.append((rel_target, lineno, ref))

    if report:
        for t, ln, ref in resolved:
            print("  ok  %s:%d  %s" % (t, ln, ref))

    for t, ln, ref, text in annotated:
        print("  note %s:%d  %s does not resolve; declared in KNOWN_RETIRED: %s"
              % (t, ln, ref, KNOWN_RETIRED.get("%s:%s" % (t, ref), "")[:80]))
    for t, ln, ref in unverifiable:
        print("  note %s:%d  %s unverifiable — it may live in ~/.claude/commands, which is "
              "not present on this machine" % (t, ln, ref))

    if not dead and not archived:
        extra = ""
        if annotated:
            extra += ", %d annotated-as-retired" % len(annotated)
        if unverifiable:
            extra += ", %d unverifiable (no user command tree)" % len(unverifiable)
        print("✓ Command refs: %d references in %d instruction files resolve%s"
              % (len(resolved), len(TARGETS), extra))
        return 0

    for t, ln, ref, path in archived:
        print("✗ %s:%d  %s resolves ONLY into an archive namespace (%s)"
              % (t, ln, ref, os.path.relpath(path, ROOT) if path.startswith(ROOT) else path))
    for t, ln, ref in dead:
        print("✗ %s:%d  %s does not resolve to any command" % (t, ln, ref))
    print("")
    print("An instruction file routes to a command that does not exist. Fix one of:")
    print("  - the reference is a typo or the command moved  -> correct the reference")
    print("  - the command was archived                      -> route to its replacement")
    print("  - the token is NOT a command (a route, a path)  -> declare it in")
    print("    scripts/validate-command-refs.py NOT_COMMANDS, with a reason")
    print("  - the line is a HISTORICAL mention of a retired command -> add")
    print("    \"<file>:<ref>\" to KNOWN_RETIRED, with a reason")
    return 1


if __name__ == "__main__":
    sys.exit(main())
