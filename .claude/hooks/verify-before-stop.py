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

Second, independent check: KDD output shape. When the last assistant message
carries the /kdd step-7.2 sentinel, it must also carry the why-confirmation,
the cost line, the do-nothing line and the ask, and must not use the trade-off
vocabulary the /slava:build:simplify contract bans. The skill emits the
sentinel, so this costs one regex on every other turn. Blocks at most twice per
session (RETRY_LIMIT) and then fails open — a format gate must not be able to
trap a session.
"""
import json
import os
import re
import sys
import tempfile

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

# --- KDD output-shape gate -------------------------------------------------
# The sentinel is the mandatory closing line of /kdd step 7.2. Tolerant of the
# agent substituting a real item number for the literal N.
KDD_SENTINEL_RE = re.compile(r"Confirm to apply, or \S+=skip to drop item", re.IGNORECASE)

# Each entry: (human name, regex that must match somewhere in the message).
KDD_REQUIRED = (
    ("the why, closed by an invitation to confirm", re.compile(r"Does that match what you saw\?", re.IGNORECASE)),
    ("the cost line", re.compile(r"\*\*What it costs you:\*\*", re.IGNORECASE)),
    ("the do-nothing line", re.compile(r"\*\*If we do nothing:\*\*", re.IGNORECASE)),
    ("the ask", re.compile(r"\*\*Your call:\*\*|One honest fix here:", re.IGNORECASE)),
)

# Banned by /slava:build:simplify section 2 — the agent's concerns, not the
# founder's. Scoped to KDD-sentinel messages only, so the blast radius is one
# skill's output.
KDD_BANNED_RE = re.compile(
    r"\b(maintainability|thinking cost|cognitive cost|error risk|tech(nical)? debt|elegan(ce|t)|sustainability)\b",
    re.IGNORECASE,
)

RETRY_LIMIT = 2
RETRY_DIR = os.path.join(tempfile.gettempdir(), "kdd-stop-retries")


def _retry_count(session_id, bump=False):
    """Best-effort per-session block counter. Any IO failure fails open (0)."""
    if not session_id:
        return 0
    safe = re.sub(r"[^A-Za-z0-9_-]", "", str(session_id))[:64]
    if not safe:
        return 0
    path = os.path.join(RETRY_DIR, safe)
    try:
        with open(path) as f:
            count = int(f.read().strip() or 0)
    except Exception:
        count = 0
    if bump:
        try:
            os.makedirs(RETRY_DIR, exist_ok=True)
            with open(path, "w") as f:
                f.write(str(count + 1))
        except Exception:
            pass
    return count


def kdd_violations(text):
    """Return a list of human-readable problems, or [] if the shape is fine."""
    if not KDD_SENTINEL_RE.search(text):
        return []  # not a KDD presentation — nothing to check
    problems = []
    missing = [name for name, pattern in KDD_REQUIRED if not pattern.search(text)]
    if missing:
        problems.append("it is missing " + "; ".join(missing))
    banned = sorted({m.group(0).lower() for m in KDD_BANNED_RE.finditer(text)})
    if banned:
        problems.append(
            "it uses trade-off vocabulary the /slava:build:simplify contract bans ("
            + ", ".join(banned)
            + ") — use business / cost / product / user / operator terms instead"
        )
    return problems


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

    if not last_assistant_text:
        sys.exit(0)

    problems = kdd_violations(last_assistant_text)
    if problems:
        session_id = data.get("session_id")
        if _retry_count(session_id) >= RETRY_LIMIT:
            sys.exit(0)  # already asked twice — fail open rather than trap the turn
        _retry_count(session_id, bump=True)
        sys.stderr.write(
            "BLOCKED: your /kdd item block does not hold: " + " AND ".join(problems) + ".\n"
            "Re-emit step 7.2 in the template shape: what went wrong in plain words, "
            "why it matters built on one real artifact from this session, "
            "'Does that match what you saw?', the cost line, the do-nothing line, "
            "the ask, and your pick. Internal identifiers stay behind the depth offer.\n"
        )
        sys.exit(2)

    if not CLAIM_RE.search(last_assistant_text):
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
