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
import sys

_argv = sys.argv[1:]
if "--root" in _argv:
    ROOT = os.path.abspath(_argv[_argv.index("--root") + 1])
    # A fixture must be hermetic: the user's real command tree would otherwise resolve
    # references the fixture never defined, and every negative case would pass vacuously.
    COMMAND_ROOTS = [os.path.join(ROOT, ".claude", "commands")]
else:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    COMMAND_ROOTS = [
        os.path.join(ROOT, ".claude", "commands"),
        os.path.expanduser("~/.claude/commands"),
    ]

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

# A MENTION IS NOT A POINTER -- the same distinction block-banned-git.py needed, applied
# to prose instead of shell. A line that itself marks the target as retired is describing
# history, not routing to it, and a dangling reference there is not the defect this gate
# exists to catch. Real instance, found by this validator on its first run:
#     ## Business Layer (from /create-prd -- legacy, now /product-owner enrichment)
# /create-prd was absorbed by /create-spec (P647) and /product-owner was never built; the
# line is accurate as written. These are REPORTED every run rather than skipped silently,
# so an annotation can never quietly become a hiding place.
RETIRED_CONTEXT = re.compile(
    r"\b(legacy|archived?|absorbed|deprecated|superseded|replaced by|formerly|"
    r"no longer|used to be|not yet built|future)\b", re.I)


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
                by_base.setdefault(name_parts[-1], []).append(full)
                by_path.setdefault(":".join(name_parts), []).append(full)
    return by_base, by_path


def is_archived(path):
    return os.sep + "archive" + os.sep in path


def strip_inline_noise(line):
    """Drop URLs so their path segments never become candidates."""
    return re.sub(r"https?://\S+", " ", line)


def main():
    report = "--report" in sys.argv
    by_base, by_path = command_files()
    if not by_base:
        print("✗ no command files found under any command root — refusing to pass vacuously")
        return 1

    dead, archived, resolved, annotated = [], [], [], []
    for target in TARGETS:
        if not os.path.isfile(target):
            continue
        rel_target = os.path.relpath(target, ROOT)
        with open(target, encoding="utf-8", errors="replace") as fh:
            for lineno, line in enumerate(fh, 1):
                clean = strip_inline_noise(line)
                for ref in CANDIDATE.findall(clean):
                    if ref in BUILTINS or ref in NOT_COMMANDS:
                        continue
                    name = ref[1:]
                    hits = by_path.get(name) or by_base.get(name.split(":")[-1]) or []
                    if hits and not all(is_archived(h) for h in hits):
                        resolved.append((rel_target, lineno, ref))
                    elif RETIRED_CONTEXT.search(clean):
                        annotated.append((rel_target, lineno, ref, line.strip()))
                    elif hits:
                        archived.append((rel_target, lineno, ref, hits[0]))
                    else:
                        dead.append((rel_target, lineno, ref))

    if report:
        for t, ln, ref in resolved:
            print("  ok  %s:%d  %s" % (t, ln, ref))

    for t, ln, ref, text in annotated:
        print("  note %s:%d  %s does not resolve, but the line marks it retired: %s"
              % (t, ln, ref, text[:100]))

    if not dead and not archived:
        print("✓ Command refs: %d references in %d instruction files all resolve"
              " (%d annotated-as-retired)" % (len(resolved), len(TARGETS), len(annotated)))
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
    return 1


if __name__ == "__main__":
    sys.exit(main())
