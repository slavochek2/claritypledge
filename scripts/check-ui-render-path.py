#!/usr/bin/env python3
"""P955 UI-gate render-path detection.

Two modes:

  --generate   Build scripts/ui-gate-manifest.json: the set of source files
               transitively imported by src/App.tsx (the root of every route).
               Run this whenever routes/imports change.

  (default)    Decide whether the UI gate should FIRE for a set of staged files.
               Reads staged paths from argv (one per arg) or stdin (one per
               line). Prints "FIRE" or "SKIP" to stdout.

Firing policy (spec 2c — "when unsure, fire"):
  - Any staged `.tsx` under src/                  -> FIRE (any tsx is a potential render path)
  - Any staged `.ts` that is in the manifest set  -> FIRE (render-path hook/service/store)
  - Manifest missing / unreadable / parse error   -> FIRE (UNSURE; fail toward firing)
  - Otherwise                                      -> SKIP

Exit code is always 0; the caller branches on the printed token. Any unexpected
internal error prints FIRE and exits 0 — the gate must never silently go quiet.

Reference: features/p955_ui_build_loop.md § AD-3, § Phase 2(c)
"""

import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRY = "src/App.tsx"
MANIFEST = "scripts/ui-gate-manifest.json"
SRC_PREFIX = "src/"
EXTS = (".ts", ".tsx", ".js", ".jsx")

# Matches: import ... from 'x'  |  import 'x'  |  import('x')  |  export ... from 'x'
_IMPORT_RE = re.compile(
    r"""(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)"""
)


def _abs(rel):
    return os.path.join(REPO_ROOT, rel)


def _resolve(spec, importer_rel):
    """Resolve an import specifier to a repo-relative source path, or None.

    Handles `@/` alias -> `src/`, and relative `./` `../`. Tries direct file
    with each extension, then `/index.*`. Only returns paths under src/.
    """
    if spec.startswith("@/"):
        base = "src/" + spec[2:]
    elif spec.startswith("./") or spec.startswith("../"):
        base = os.path.normpath(os.path.join(os.path.dirname(importer_rel), spec))
    else:
        return None  # bare package import (node_modules) — not a render-path source

    candidates = [base + e for e in EXTS]
    candidates += [os.path.join(base, "index" + e) for e in EXTS]
    # If the spec already carries an extension, also try it verbatim.
    if base.endswith(EXTS):
        candidates.insert(0, base)

    for c in candidates:
        c_norm = c.replace("\\", "/")
        if c_norm.startswith(SRC_PREFIX) and os.path.isfile(_abs(c_norm)):
            return c_norm
    return None


def _imports_in(rel_path):
    try:
        with open(_abs(rel_path), "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return []
    specs = []
    for m in _IMPORT_RE.finditer(text):
        specs.append(m.group(1) or m.group(2))
    return [s for s in specs if s]


def build_render_path():
    """BFS the import graph from ENTRY; return a sorted list of reachable src files."""
    seen = set()
    queue = [ENTRY]
    seen.add(ENTRY)
    while queue:
        cur = queue.pop()
        for spec in _imports_in(cur):
            resolved = _resolve(spec, cur)
            if resolved and resolved not in seen:
                seen.add(resolved)
                queue.append(resolved)
    return sorted(seen)


def do_generate():
    render_path = build_render_path()
    out = {
        "generated_from": ENTRY,
        "note": "P955 UI-gate render path: source files transitively imported by App.tsx. "
        "Regenerate with scripts/gen-ui-gate-manifest.sh when routes/imports change.",
        "count": len(render_path),
        "render_path": render_path,
    }
    with open(_abs(MANIFEST), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
        fh.write("\n")
    print(f"Wrote {MANIFEST}: {len(render_path)} render-path files.")
    return 0


def _staged_from_input():
    args = [a for a in sys.argv[1:] if a != "--"]
    if args:
        return args
    data = sys.stdin.read() if not sys.stdin.isatty() else ""
    return [line.strip() for line in data.splitlines() if line.strip()]


def do_check():
    staged = _staged_from_input()
    if not staged:
        print("SKIP")
        return 0

    # Load manifest; UNSURE (fire) if missing/unparseable.
    try:
        with open(_abs(MANIFEST), "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
        render_set = set(manifest.get("render_path", []))
    except (OSError, ValueError):
        print("FIRE")  # manifest unreadable -> fail toward firing
        return 0

    for raw in staged:
        p = raw.replace("\\", "/").lstrip("./")
        if not p.startswith(SRC_PREFIX):
            continue
        if p.endswith(".tsx"):
            print("FIRE")
            return 0
        if p.endswith(".ts") and p in render_set:
            print("FIRE")
            return 0
    print("SKIP")
    return 0


def main():
    try:
        if "--generate" in sys.argv[1:]:
            return do_generate()
        return do_check()
    except Exception as exc:  # noqa: BLE001 — gate must never silently go quiet
        print("FIRE")
        print(f"# check-ui-render-path internal error (firing toward safety): {exc}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
