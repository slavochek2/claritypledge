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

Second, independent check: KDD output shape. When the assistant turn carries the
/kdd step-7.2 sentinel and an item heading, EVERY item in it must carry the
why-confirmation, the cost line, the do-nothing line and the ask, and the turn
must not use the trade-off vocabulary the /slava:build:simplify contract bans.

Two ordering invariants, both learned by measuring rather than reasoning:

  1. The claim gate is the SAFETY gate; the KDD gate is a FORMAT gate. Both are
     computed every run and reported together. A format problem must never
     consume the one block available per turn (stop_hook_active caps it at one)
     and thereby let an unverified deployment claim ship.
  2. RETRY_LIMIT suppresses the KDD PORTION only — never the hook. Exhausting it
     used to return from main() above the claim check, killing the safety gate
     for the rest of the session.

Trap protection is really done by stop_hook_active (one block per turn) and by
Claude Code's documented 8-consecutive-block override. RETRY_LIMIT only advances
across separate user turns; it exists so a persistently malformed presentation
stops nagging. If its counter cannot be written, the format gate DISABLES itself
(an unwritable counter must not arm a gate that can never reach its own limit).
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

# --- KDD output-shape gate -------------------------------------------------
# The sentinel is the mandatory closing line of /kdd step 7.2. Tolerant of the
# agent substituting a real item number for the literal N.
KDD_SENTINEL_RE = re.compile(r"Confirm to apply, or \S+=skip to drop item", re.IGNORECASE)
KDD_ITEM_RE = re.compile(r"\*\*Item \S+\s*—", re.IGNORECASE)

# Each entry: (human name, regex that must match somewhere in the message).
KDD_REQUIRED = (
    ("the why, closed by an invitation to confirm", re.compile(r"Does that match what you saw\?", re.IGNORECASE)),
    ("the cost line", re.compile(r"\*\*What it costs you:\*\*", re.IGNORECASE)),
    ("the do-nothing line", re.compile(r"\*\*If we do nothing:\*\*", re.IGNORECASE)),
    ("the ask", re.compile(r"\*\*Your call:\*\*|One honest fix here:|\*\*Blocked on your call:\*\*", re.IGNORECASE)),
)

# Banned by /slava:build:simplify section 2 — the agent's concerns, not the
# founder's. Scoped to KDD-sentinel messages only, so the blast radius is one
# skill's output.
KDD_BANNED_RE = re.compile(
    r"\b(maintainability|thinking cost|cognitive cost|error risk|tech(nical)? debt|elegan(ce|t)|sustainability)\b",
    re.IGNORECASE,
)

RETRY_LIMIT = 2
RETRY_DIR = os.path.join(
    os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"),
    ".kdd-stop-retries",
)


def _retry_count(session_id, bump=False):
    """Per-session KDD-block counter.

    Returns RETRY_LIMIT (i.e. "budget exhausted, stop blocking on format") on any
    IO failure. Returning 0 there would mean "no blocks yet, keep blocking" — with
    an unwritable counter the gate could then never reach its own limit and would
    block every turn forever. Failing toward the disabled state is the safe
    direction for a FORMAT gate; the claim gate runs regardless.
    """
    if not session_id:
        return RETRY_LIMIT
    safe = re.sub(r"[^A-Za-z0-9_-]", "", str(session_id))[:64]
    if not safe:
        return RETRY_LIMIT
    path = os.path.join(RETRY_DIR, safe)
    try:
        with open(path) as f:
            count = int(f.read().strip() or 0)
    except FileNotFoundError:
        count = 0
    except Exception:
        return RETRY_LIMIT
    if bump:
        try:
            os.makedirs(RETRY_DIR, mode=0o700, exist_ok=True)
            with open(path, "w") as f:
                f.write(str(count + 1))
        except Exception:
            return RETRY_LIMIT
    return count


def kdd_violations(text):
    """Return a list of human-readable problems, or [] if the shape is fine."""
    if not (KDD_SENTINEL_RE.search(text) and KDD_ITEM_RE.search(text)):
        # Not a KDD presentation. The item heading is required alongside the
        # sentinel so that a session *maintaining* this skill — which quotes the
        # closing line verbatim — is not blocked on every turn.
        return []

    problems = []

    # Per ITEM, not per message. The skill's normal output is two items behind a
    # single closing sentinel, so a message-wide search let one well-formed item
    # satisfy every pattern while its sibling carried nothing at all.
    segments = KDD_ITEM_RE.split(text)[1:] or [text]
    for idx, segment in enumerate(segments, start=1):
        missing = [name for name, pattern in KDD_REQUIRED if not pattern.search(segment)]
        if missing:
            where = f"item {idx}" if len(segments) > 1 else "it"
            problems.append(f"{where} is missing " + "; ".join(missing))

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

    # The KDD check reads the WHOLE assistant turn, not just its last message.
    # /kdd step 7.X (append to the suppression log) runs AFTER 7.2 presentation,
    # so the skill itself produces a trailing "Suppression log updated." message
    # — checking only the last message let that disarm the gate entirely.
    turn_chunks = []
    for entry in reversed(entries):
        if entry.get("type") == "user":
            break
        if entry.get("type") == "assistant":
            text = extract_text(get_message_content(entry))
            if text.strip():
                turn_chunks.append(text)
    turn_text = "\n".join(reversed(turn_chunks))

    if not last_assistant_text and not turn_text:
        sys.exit(0)

    # --- Gate 1 (SAFETY): unverified completion claim. Computed first and never
    #     suppressed by anything below it.
    claim_problem = False
    if last_assistant_text and CLAIM_RE.search(last_assistant_text):
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
        claim_problem = seen_edit and not verified_since_edit

    # --- Gate 2 (FORMAT): KDD output shape, subject to a per-session budget.
    #     Exhausting that budget silences THIS gate only — never gate 1.
    problems = kdd_violations(turn_text)
    session_id = data.get("session_id")
    if problems:
        # Bump BEFORE deciding: a read alone cannot tell whether the counter is
        # persistable, so a read-then-decide order blocked forever on a counter
        # that could never advance. _retry_count returns RETRY_LIMIT when it
        # cannot persist, which disables this gate.
        if _retry_count(session_id, bump=True) >= RETRY_LIMIT:
            problems = []

    if not problems and not claim_problem:
        sys.exit(0)

    messages = []
    if claim_problem:
        messages.append(
            "BLOCKED: your last message claims something is live/working/fixed, but no "
            "verification (browser check, curl against the deployed URL, or `git log "
            "origin/main`) has run since the last Edit/Write. Verify first and cite the "
            "output, or retract the claim."
        )
    if problems:
        messages.append(
            "BLOCKED: your /kdd item block does not hold: " + " AND ".join(problems) + ".\n"
            "Re-emit step 7.2 in the template shape: what went wrong in plain words, "
            "why it matters built on one real artifact from this session, "
            "'Does that match what you saw?', the cost line, the do-nothing line, "
            "the ask, and your pick. Internal identifiers stay behind the depth offer."
        )
    sys.stderr.write("\n\n".join(messages) + "\n")
    sys.exit(2)


if __name__ == "__main__":
    main()
