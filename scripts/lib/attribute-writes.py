#!/usr/bin/env python3
"""Attribute file writes to the Claude Code session that made them (P1287).

Reads transcript paths on stdin (one per line) and candidate repo-relative paths from
argv; prints TSV records "<path>\t<mtime>\t<session>\t<project>\t<STRONG|WEAK>".

Why a parser and not a regex: the transcript is JSON, and every regex shape tried before
this leaked in a way a hostile review reproduced. `[^"]*` stops at the first escaped quote
inside a heredoc and misses real writes; `.*` runs past the end of one tool_use block and
credits a LATER block's file_path to an EARLIER block's tool name — so a Read of a peer's
file, sitting in the same record as our own Edit, classified that peer's file as ours. That
is the exact failure the whole design exists to prevent. Parsing binds each file_path to
the tool call it actually belongs to, and decodes JSON escaping for free.

STRONG evidence means the path is the TARGET of a write. Only STRONG may license a commit;
WEAK (the path merely appears in a mutating command) can only decline to.
"""
import json, os, re, sys

CANDIDATES = sys.argv[1:]
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
MUTATORS = re.compile(r"(>|\btee\b|\bsed\s+-i|\bcp\b|\bmv\b|\bopen\(|\bwrite_text\(|\.write\()")


def rel(path, root):
    """Normalize a transcript's file_path to a repo-relative path."""
    if not isinstance(path, str):
        return None
    p = os.path.normpath(path)
    if os.path.isabs(p):
        # Any checkout of this repo — main or a worktree — maps onto the same relative path.
        for marker in ("/claritypledge/", "/claritypledge-"):
            i = p.rfind(marker)
            if i != -1:
                tail = p[i + len(marker):]
                tail = tail.split("/", 1)[1] if marker.endswith("-") and "/" in tail else tail
                return tail
        return p.lstrip("/")
    return p


def strong_in_command(cmd, cand):
    """Is `cand` the target of a write in this shell command (not merely named by it)?

    Each shape pins the path to the position a write actually puts its target in. The
    loose forms these replaced credited `cp peer.md /tmp/x` and `grep f 2>/dev/null` as
    writes to peer.md and f.
    """
    q = re.escape(cand)
    shapes = [
        # redirect target: `> path`, `>> path` — but NOT `2>/dev/null … path`, since the
        # path must follow the operator directly.
        rf">>?\s*['\"]?{q}(['\"\s;|&)]|$)",
        rf"\btee\s+(-a\s+)?['\"]?{q}(['\"\s;|&)]|$)",
        rf"\bsed\s+-i\S*\s+[^|;&]*?['\"]?{q}(['\"\s;|&)]|$)",
        # cp/mv DESTINATION only: the path must be the final argument of the command.
        rf"\b(cp|mv)\s+(-\S+\s+)*\S+\s+['\"]?{q}['\"]?\s*($|[;|&])",
        # a script-language write whose target is the literal path
        rf"(open|write_text)\(\s*['\"]{q}['\"]",
        rf"['\"]{q}['\"]\s*,\s*['\"][wa]",
    ]
    return any(re.search(s, cmd) for s in shapes)


def blocks(rec):
    msg = rec.get("message")
    content = msg.get("content") if isinstance(msg, dict) else None
    return content if isinstance(content, list) else []


for line in sys.stdin:
    f = line.strip()
    if not f:
        continue
    try:
        mtime = int(os.path.getmtime(f))
    except OSError:
        continue
    sid = os.path.basename(f)[: -len(".jsonl")]
    proj = os.path.basename(os.path.dirname(f))
    found = {}  # path -> strength

    with open(f, errors="replace") as fh:
        for raw in fh:
            if not any(c in raw for c in CANDIDATES):
                continue  # cheap reject before the expensive parse
            try:
                rec = json.loads(raw)
            except (ValueError, TypeError):
                continue
            for b in blocks(rec):
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                name, inp = b.get("name"), b.get("input")
                if not isinstance(inp, dict):
                    continue
                if name in EDIT_TOOLS:
                    # Bound to THIS block's input — the whole point of parsing.
                    target = rel(inp.get("file_path"), proj)
                    for c in CANDIDATES:
                        if target == c or (target or "").endswith("/" + c):
                            found[c] = "STRONG"
                elif name == "Bash":
                    cmd = inp.get("command")
                    if not isinstance(cmd, str):
                        continue
                    mutating = MUTATORS.search(cmd) is not None
                    for c in CANDIDATES:
                        if c not in cmd:
                            continue
                        if strong_in_command(cmd, c):
                            found[c] = "STRONG"
                        elif mutating and found.get(c) != "STRONG":
                            found[c] = "WEAK"

    for c, strength in found.items():
        print(f"{c}\t{mtime}\t{sid}\t{proj}\t{strength}")
