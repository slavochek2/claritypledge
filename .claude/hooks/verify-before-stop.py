#!/usr/bin/env python3
"""Stop hook: block ending the turn on an unverified "it's live/working/fixed" claim.

Fires on every Stop event. Reads the session transcript, and if the last
assistant message contains completion-claim language ("should be live now",
"it's fixed") with no verifying tool call (browser check, curl, git log
origin/main) since the last Edit/Write, blocks the turn (exit 2) instead of
letting it end. Fails open (exit 0) whenever it can't confidently tell —
the goal is to catch the "forgot to check" case, not to police every claim.

Verification is judged ONLY by tool_use calls, never by scanning free text
for keywords like "curl" — a user or assistant message that merely mentions
verification (without a tool call actually running) must not count.
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

CLAIM_RE = re.compile(
    r"\b(should (be |work )?(live|working)( now)?|"
    r"is now (live|working|fixed|deployed)|"
    r"it'?s (live|fixed|working|deployed)( now)?|"
    r"(deployed|shipped) successfully|"
    r"now live|live now|confirmed (live|working|fixed))\b",
    re.IGNORECASE,
)
VERIFY_BASH_RE = re.compile(r"\b(curl|git log origin/main|vercel inspect|vercel ls)\b", re.IGNORECASE)
VERIFY_TOOL_PREFIXES = BROWSER_TOOL_PREFIXES + ("WebFetch",)
EDIT_TOOLS = ("Edit", "Write")


def load_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def is_verifying_tool_use(tu):
    name = tu.get("name", "")
    if any(name == p or name.startswith(p) for p in VERIFY_TOOL_PREFIXES):
        return True
    if name == "Bash":
        cmd = (tu.get("input") or {}).get("command", "") or ""
        if VERIFY_BASH_RE.search(cmd):
            return True
    return False


def main():
    data = load_input()
    if data.get("stop_hook_active"):
        sys.exit(0)  # already blocked once this turn — avoid an infinite loop

    transcript_path = data.get("transcript_path")
    if not transcript_path:
        sys.exit(0)  # can't verify — fail open

    entries = list(iter_transcript(transcript_path))
    if not entries:
        sys.exit(0)

    last_assistant_text = ""
    for entry in reversed(entries):
        if entry.get("type") == "assistant":
            text = extract_text(get_message_content(entry))
            if text.strip():
                last_assistant_text = text
                break

    if not last_assistant_text or not CLAIM_RE.search(last_assistant_text):
        sys.exit(0)  # no completion-claim language — nothing to check

    seen_edit = False
    verified_since_edit = False
    for entry in entries:
        if entry.get("type") != "assistant":
            continue
        content = get_message_content(entry)
        for tu in extract_tool_uses(content):
            name = tu.get("name", "")
            if name in EDIT_TOOLS:
                seen_edit = True
                verified_since_edit = False
            elif is_verifying_tool_use(tu):
                verified_since_edit = True

    if not seen_edit or verified_since_edit:
        sys.exit(0)

    sys.stderr.write(
        "BLOCKED: your last message claims something is live/working/fixed, but no "
        "verification (browser check, curl against the deployed URL, or `git log "
        "origin/main`) has run since the last Edit/Write. Verify first and cite the "
        "output, or retract the claim.\n"
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
