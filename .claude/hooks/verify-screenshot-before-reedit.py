#!/usr/bin/env python3
"""PreToolUse (Edit|Write) hook: block re-editing a UI file blind after the
founder reported not seeing a change, until a screenshot/browser check runs.

Mechanizes the existing visual-qa.md / CLAUDE.md "Working Style Patterns" rule
("Don't see it after a UI change" -> screenshot before editing again), which
was being bypassed via memory alone. Fails open (exit 0) whenever it can't
confidently tell.

visual-qa.md's own process spawns a SEPARATE SUBAGENT for visual QA (so the
implementer doesn't grade its own screenshot) — that subagent's tool calls
live in a different transcript this hook can't see. So a direct screenshot
tool call OR an Agent/Task delegation (the visible signal of that subagent
being spawned) both count as evidence.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _transcript_lib import (
    BROWSER_TOOL_PREFIXES,
    extract_text,
    extract_tool_uses,
    get_message_content,
    iter_transcript,
)

NOT_SEEING_RE = re.compile(
    r"\b(don'?t see|not showing|nothing changed|still broken|doesn'?t show|"
    r"not working|didn'?t change|no visible change|still not (showing|working)|"
    r"looks the same|still don'?t see)\b",
    re.IGNORECASE,
)
UI_PATH_RE = re.compile(r"\.(tsx|jsx|css)$")
EVIDENCE_TOOL_PREFIXES = BROWSER_TOOL_PREFIXES
EVIDENCE_TOOL_NAMES = ("Agent", "Task")


def load_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def is_evidence_tool(name):
    if name in EVIDENCE_TOOL_NAMES:
        return True
    return any(name == p or name.startswith(p) for p in EVIDENCE_TOOL_PREFIXES)


def main():
    data = load_input()
    tool_input = data.get("tool_input") or {}
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""
    if not UI_PATH_RE.search(file_path):
        sys.exit(0)  # only guards UI source files

    transcript_path = data.get("transcript_path")
    if not transcript_path:
        sys.exit(0)  # fail open

    entries = list(iter_transcript(transcript_path))
    if not entries:
        sys.exit(0)

    flagged = False
    evidence_after_flag = False
    for entry in entries:
        etype = entry.get("type")
        content = get_message_content(entry)
        if etype == "user":
            text = extract_text(content)
            if text and NOT_SEEING_RE.search(text):
                flagged = True
                evidence_after_flag = False
        elif etype == "assistant" and flagged:
            for tu in extract_tool_uses(content):
                if is_evidence_tool(tu.get("name", "")):
                    evidence_after_flag = True

    if not flagged or evidence_after_flag:
        sys.exit(0)

    sys.stderr.write(
        "BLOCKED: the founder reported not seeing a UI change, and no screenshot/QA "
        "check has run since. Per visual-qa.md / CLAUDE.md 'Working Style Patterns' -- "
        "take a screenshot (/screenshot-debug or a browser tool) before editing again.\n"
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
