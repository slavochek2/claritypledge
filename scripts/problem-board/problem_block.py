#!/usr/bin/env python3
"""scripts/problem-board/problem_block.py — the problem block contract (P1319).

P1319 §Problem Block Format owns the format; P1320 parses it; nothing else
defines it. This file is the executable form of that table on the submit side:
/slava:problem:submit validates every block here and never emits one that fails.

Encoding (chosen at /dev, 2026-09-15): one JSON object inside a fenced code
block whose info string is `problem-block`:

    ```problem-block
    {"format_version": 1, "draft_id": "...", ...}
    ```

A bare JSON object (no fence) is also accepted on input, backticks inside its
strings and all. More than one problem-block fence — or one that is never
closed — is invalid: one block is one problem.

Usage:
  problem_block.py validate [FILE|-]   exit 0 valid · 1 invalid, every failing field named on stderr
  problem_block.py emit FILE           validate, then print the fenced block · 1 if invalid
                                       · 3 if FILE sits inside a git repository (drafts are private)
  problem_block.py new-id              print a fresh draft_id

Exit 2 = usage error or unreadable input.

Stdlib only: it has to run on a member's machine with nothing installed.
"""
import ipaddress
import json
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit

FORMAT_VERSION = 1
FENCE_INFO = "problem-block"

# Slot order and labels are fixed (P1180 §Stage 3): P1182 matches on the slot.
SLOTS = (("frame", "local"), ("obstacle", "portable"), ("hypothesis", "portable"))
WHOSE = ("member", "customer_seen_through_member")

TOP_KEYS = {"format_version", "draft_id", "whose_problem", "project", "story",
            "want_sentence", "claims", "links"}
REQUIRED_TOP = ("format_version", "draft_id", "whose_problem", "story",
                "want_sentence", "claims")
CLAIM_KEYS = {"slot", "label", "point", "anti_point", "blank_reason"}

# \A…\Z, not ^…$: Python's $ also matches before a trailing newline, which let a
# draft_id carrying "\n" validate (found by review, 2026-09-16).
DRAFT_ID_RE = re.compile(r"\A[A-Za-z0-9_-]{8,64}\Z")
FENCE_RE = re.compile(r"^```problem-block[ \t]*\n(.*?)^```[ \t]*$", re.S | re.M)
FENCE_OPEN_RE = re.compile(r"^```problem-block[ \t]*$", re.M)
PRIVATE_HOST_SUFFIXES = (".local", ".internal", ".localdomain")
PROJECT_MAX = 200


def _text(value):
    return isinstance(value, str) and value.strip() != ""


def enclosing_repo(path):
    """The git repository containing path, or None. Shared with candidates.py.

    Catches a working tree (.git directory), a worktree or submodule (.git FILE),
    and a bare repository (HEAD + objects/ + refs/ with no .git at all).
    """
    try:
        resolved = Path(path).resolve()
    except OSError:
        return None
    for candidate in (resolved, *resolved.parents):
        try:
            if (candidate / ".git").exists():
                return candidate
            if ((candidate / "HEAD").is_file() and (candidate / "objects").is_dir()
                    and (candidate / "refs").is_dir()):
                return candidate
        except OSError:
            continue
    return None


def extract(raw):
    """Return (obj, errors) from input holding one fenced block or a bare JSON object."""
    raw = raw.replace("\r\n", "\n")
    opened = len(FENCE_OPEN_RE.findall(raw))
    blocks = FENCE_RE.findall(raw)
    if opened > 1 or len(blocks) > 1:
        return None, [f"(block): {max(opened, len(blocks))} problem-block fences found; exactly one is allowed"]
    if opened == 1 and not blocks:
        return None, ["(block): a ```problem-block fence is opened and never closed"]
    body = blocks[0] if blocks else raw
    try:
        return json.loads(body), []
    except json.JSONDecodeError as e:
        return None, [f"(block): not valid JSON — {e.msg} at line {e.lineno} column {e.colno}"]


def _link_error(url):
    """None when the URL is a public http(s) link a stranger could open."""
    if not isinstance(url, str) or url.strip() != url or not url.strip():
        return "must be a public http(s) URL"
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return "must be a public http(s) URL"
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith(PRIVATE_HOST_SUFFIXES):
        return "points at a private host, which no reader can open"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return "points at a private address, which no reader can open"
    elif "." not in host:
        return "must be a public http(s) URL"
    return None


def _claims(claims):
    if not isinstance(claims, list):
        return ["claims: must be a list"]
    if len(claims) != 3:
        return [f"claims: exactly 3 required, found {len(claims)}"]
    errs = []
    filled = 0
    for i, (claim, (slot, label)) in enumerate(zip(claims, SLOTS)):
        f = f"claims[{i}]"
        if not isinstance(claim, dict):
            errs.append(f"{f}: must be an object")
            continue
        for key in sorted(set(claim) - CLAIM_KEYS):
            errs.append(f"{f}.{key}: unknown field")
        if claim.get("slot") != slot:
            errs.append(f"{f}.slot: must be '{slot}' (slot order is fixed: frame, obstacle, hypothesis)")
        if claim.get("label") != label:
            errs.append(f"{f}.label: must be '{label}' for the {slot} slot")
        if "blank_reason" in claim:
            if not _text(claim["blank_reason"]):
                errs.append(f"{f}.blank_reason: must be non-empty text when present")
            for key in ("point", "anti_point"):
                if key in claim:
                    errs.append(f"{f}.{key}: a blank slot carries no text")
            continue
        filled += 1
        for key in ("point", "anti_point"):
            if not _text(claim.get(key)):
                errs.append(f"{f}.{key}: required non-empty text (or set blank_reason)")
        if _text(claim.get("point")) and _text(claim.get("anti_point")) \
                and claim["point"].strip() == claim["anti_point"].strip():
            errs.append(f"{f}.anti_point: must be a rival position, not the point repeated")
    if filled == 0:
        errs.append("claims: all three slots are blank — a submission with nothing to take a position on "
                    "is a run to report, not a block to emit")
    return errs


def validate(obj):
    """Return every failing field as 'field: reason'. Empty list = valid."""
    if not isinstance(obj, dict):
        return ["(block): must be a JSON object"]
    errs = [f"{key}: unknown field" for key in sorted(set(obj) - TOP_KEYS)]
    errs += [f"{key}: required field missing" for key in REQUIRED_TOP if key not in obj]

    if "format_version" in obj:
        v = obj["format_version"]
        if type(v) is not int or v != FORMAT_VERSION:
            errs.append(f"format_version: unknown version {v!r}; this validator knows {FORMAT_VERSION}")
    if "draft_id" in obj and not (isinstance(obj["draft_id"], str) and DRAFT_ID_RE.match(obj["draft_id"])):
        errs.append("draft_id: must be 8-64 characters of letters, digits, '-' or '_'")
    if "whose_problem" in obj and obj["whose_problem"] not in WHOSE:
        errs.append(f"whose_problem: must be one of {', '.join(WHOSE)}")
    if "project" in obj:
        p = obj["project"]
        if not _text(p) or "\n" in p or len(p) > PROJECT_MAX:
            errs.append(f"project: when present, one non-empty line of at most {PROJECT_MAX} "
                        "characters (omit the field for no project)")

    story = obj.get("story")
    if "story" in obj and not _text(story):
        errs.append("story: must be non-empty text")
    if "want_sentence" in obj:
        want = obj["want_sentence"]
        if not _text(want):
            errs.append("want_sentence: must be non-empty text")
        elif _text(story) and want.strip() not in story:
            errs.append("want_sentence: must appear verbatim inside story")

    if "claims" in obj:
        errs += _claims(obj["claims"])

    if "links" in obj:
        links = obj["links"]
        if not isinstance(links, list):
            errs.append("links: must be a list of http(s) URLs")
        else:
            for i, url in enumerate(links):
                problem = _link_error(url)
                if problem:
                    errs.append(f"links[{i}]: {problem}")
    return errs


def fenced(obj):
    return f"```{FENCE_INFO}\n{json.dumps(obj, ensure_ascii=False, indent=2)}\n```"


def _read(path):
    if path in (None, "-"):
        return sys.stdin.read()
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def main(argv):
    if not argv:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    cmd, rest = argv[0], argv[1:]
    if cmd in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    if cmd == "new-id":
        print(uuid.uuid4())
        return 0
    if cmd not in ("validate", "emit") or len(rest) > 1 or (cmd == "emit" and len(rest) != 1):
        print(f"usage: problem_block.py validate [FILE|-] | emit FILE | new-id  (got: {' '.join(argv)})",
              file=sys.stderr)
        return 2

    if cmd == "emit":
        repo = enclosing_repo(rest[0])
        if repo is not None:
            print(f"refusing to emit: {rest[0]} is inside the git repository at {repo}. Drafts hold corpus "
                  "content and live with the candidate list, outside every repository.", file=sys.stderr)
            return 3
    try:
        raw = _read(rest[0] if rest else None)
    except (OSError, UnicodeDecodeError) as e:
        print(f"cannot read input: {e}", file=sys.stderr)
        return 2

    obj, errs = extract(raw)
    if not errs:
        errs = validate(obj)
    if errs:
        print("INVALID problem block", file=sys.stderr)
        for e in errs:
            print(f"  {e}", file=sys.stderr)
        return 1
    if cmd == "validate":
        print(f"VALID problem block — draft_id {obj['draft_id']}")
    else:
        print(fenced(obj))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
