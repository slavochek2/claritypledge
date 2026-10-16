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
import time

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

# --- Review gate (P1505) ----------------------------------------------------
# The founder re-typed the end-of-build review standard 145 times in 119 sessions, and
# 76-80% of those asks followed work where no build skill ran (P1505 falsify review). So
# the trigger lives HERE, at the end of any turn, not inside /dev or /fix.
# Fires only when ALL hold: the turn announces completion (not a question, not negated);
# this session SUCCESSFULLY edited a reviewable file; and the latest review receipt
# (scripts/review_receipt.py) does not cover that file's current content.
# Edits are read from the WHOLE transcript (not the 2000-line window), so long sessions
# do not forget them. Known limit: shell edits and subagent edits are not seen.
REVIEW_EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")
# Reviewable = everything in a repo EXCEPT prose. A deny-list, so settings.json, workflows,
# package.json and rules are covered by default (P1505 review, Opus finding 8).
NOT_REVIEWABLE_PREFIXES = ("docs/", "features/", "content/")
DONE_RE = re.compile(
    r"\b(done|implemented|finished|complete[d]?|committed|shipped|fixed|pushed|merged|deployed|"
    r"ready (to ship|for (qa|uat|review|you))|all set|works now|landed|wrapped up)\b",
    re.IGNORECASE,
)
# A completion word right after one of these is not a completion claim.
# A completion word followed by one of these describes partial progress, not completion.
PARTIAL_AFTER_RE = re.compile(r"^\s*(with (part|step|phase|the first)|so far)\b", re.IGNORECASE)
TRAILING_QUESTION_RE = re.compile(r"[^.!?\n]*\?\s*$")
# Searched in the same clause, up to 30 chars before the word ("once this is done").
NEGATION_RE = re.compile(r"(\bnot\b|n't\b|\bonce\b|\buntil\b|\bif\b|\bbefore\b|\bnothing\b|\bto be\b|\bwhen\b)[^.!?\n]*$", re.IGNORECASE)
# Explicit, affirmative waivers only — never "do not skip review", never a quoted mention.
WAIVE_RE = re.compile(
    r"\b(skip|no need for|drop)( the| a| any)? (code |end-of-build )?reviews?\b|"
    r"\bno reviews? (needed|required|necessary)\b|\bwithout (a |any |the )?reviews?\b",
    re.IGNORECASE,
)
# A waiver with a negation or condition ANYWHERE in its clause is not a waiver
# ("Do not finish without a review", "Never ship without review").
WAIVE_NEGATED_RE = re.compile(r"(\bdo not\b|\bdon'?t\b|\bnever\b|\bnot\b|\bif\b|\bunless\b|\bwhy\b)[^.!?\n]*$", re.IGNORECASE)
QUOTED_RE = re.compile(r"\"[^\"]*\"|“[^”]*”|`[^`]*`")
REVIEW_TIME_BUDGET_S = 6.0   # hook timeout is 20s; leave room for gates 1-2 and their output
REVIEW_MAX_FILES = 300


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


def _load_receipts():
    """Import the receipt helper from this repo's scripts/. None if unavailable (fail open)."""
    try:
        scripts = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
        if scripts not in sys.path:
            sys.path.insert(0, scripts)
        import review_receipt  # noqa: E402
        return review_receipt
    except Exception:
        return None


def announces_completion(turn_text):
    """True when the turn claims the work is complete. A closing question ("Want me to
    commit?") is dropped first, so it neither hides a completion nor creates one."""
    text = TRAILING_QUESTION_RE.sub("", turn_text or "")
    for m in DONE_RE.finditer(text):
        if NEGATION_RE.search(text[max(0, m.start() - 30):m.start()]):
            continue
        if PARTIAL_AFTER_RE.search(text[m.end():m.end() + 24]):
            continue
        return True
    return False


def is_founder_message(entry):
    """A message the founder typed. Skill bodies (isMeta), task notifications, system
    reminders and tool results are user-TYPE entries too, and must never count as the
    founder's words (P1505 review round 2: /finish's own text read as a waiver)."""
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    origin = entry.get("origin")
    if isinstance(origin, dict) and origin.get("kind") and origin.get("kind") != "human":
        return False
    text = extract_text(get_message_content(entry)).strip()
    if not text:
        return False
    return not text.startswith(("<task-notification", "<system-reminder", "Base directory for this skill"))


def founder_waived(text):
    text = QUOTED_RE.sub(" ", text or "")
    for m in WAIVE_RE.finditer(text):
        if not WAIVE_NEGATED_RE.search(text[max(0, m.start() - 60):m.start()]):
            return True
    return False


def session_edits(transcript_path):
    """Paths successfully edited this session, read from the WHOLE transcript.
    A tool call whose result is an error is not an edit."""
    requested, failed = [], set()
    try:
        with open(transcript_path, errors="replace") as f:
            for line in f:
                if '"tool_use"' not in line and '"tool_result"' not in line:
                    continue
                try:
                    entry = json.loads(line)
                except Exception:
                    continue
                content = get_message_content(entry)
                if not isinstance(content, list):
                    continue
                for b in content:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "tool_use" and b.get("name") in REVIEW_EDIT_TOOLS:
                        inp = b.get("input") or {}
                        p = inp.get("file_path") or inp.get("notebook_path")
                        if p:
                            requested.append((b.get("id"), p))
                    elif b.get("type") == "tool_result" and b.get("is_error"):
                        failed.add(b.get("tool_use_id"))
    except Exception:
        return []
    seen, out = set(), []
    for tid, p in requested:
        if tid in failed or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def unreviewed_edits(transcript_path, entries, turn_text):
    """Reviewable files this session edited whose current content has no review receipt.
    Fails open (returns []) on any error or when over its time budget."""
    start = time.monotonic()
    try:
        if not announces_completion(turn_text):
            return []
        paths = session_edits(transcript_path)[:REVIEW_MAX_FILES]
        if not paths:
            return []
        rr = _load_receipts()
        if rr is None:
            return []
        reviewable = []
        for p in paths:
            if time.monotonic() - start > REVIEW_TIME_BUDGET_S:
                return []
            loc = rr.locate(p)
            if not loc:
                continue
            rel = loc[1].split("::", 1)[-1].replace(os.sep, "/")
            if rel.startswith(NOT_REVIEWABLE_PREFIXES) or (rel.endswith(".md") and not rel.startswith(".claude/")):
                continue
            reviewable.append(p)
        missing = rr.unreviewed(reviewable)
        if not missing:
            return []
        # The founder can waive it: their latest typed message explicitly says skip review.
        # The waiver is recorded, so a later docs-only turn does not re-raise these files.
        for entry in reversed(entries):
            if is_founder_message(entry):
                text = extract_text(get_message_content(entry))
                if founder_waived(text):
                    rr.waive(missing, "founder: " + text.strip()[:120])
                    return []
                break
        return missing
    except Exception:
        return []


def main():
    data = load_input()
    # A block forces the agent to keep working; the stop that follows must not run unchecked
    # (P1505 review, Opus finding 2). On that follow-up stop only gate 1 (SAFETY) runs, and
    # only while its own per-session budget lasts — the loop guard stays intact.
    followup = bool(data.get("stop_hook_active"))

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

    if followup:
        if claim_problem and _retry_count(f"{data.get('session_id')}-claim", bump=True) < 2:
            sys.stderr.write(
                "BLOCKED: your last message claims something is live/working/fixed, but no "
                "verification has run since the last Edit/Write. Verify first and cite the "
                "output, or retract the claim.\n"
            )
            sys.exit(2)
        sys.exit(0)

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

    # --- Gate 3 (REVIEW, P1505): completion announced over unreviewed edits. Computed
    #     after gate 1 and reported alongside it — never instead of it.
    # The review gate's "turn" runs back to the founder's last message, across tool calls:
    # a completion announced before a final `git status` is still a completion.
    review_chunks = []
    for entry in reversed(entries):
        if is_founder_message(entry):
            break
        if entry.get("type") == "assistant":
            text = extract_text(get_message_content(entry))
            if text.strip():
                review_chunks.append(text)
    review_turn_text = "\n".join(reversed(review_chunks))
    unreviewed = unreviewed_edits(transcript_path, entries, review_turn_text)

    if not problems and not claim_problem and not unreviewed:
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
    if unreviewed:
        shown = ", ".join(unreviewed[:8]) + (f" (+{len(unreviewed) - 8} more)" if len(unreviewed) > 8 else "")
        messages.append(
            "BLOCKED (P1505 review gate): you announced completion, but these files you edited "
            "have no independent review of their current content: " + shown + ".\n"
            "Run the end-of-build review standard now: /slava:build:finish on exactly these files "
            "(snapshot, reviewers by stakes, then the receipt via scripts/review_receipt.py). "
            "Report '<received> of <spawned>' and every finding as FIXED or for the founder. "
            "If the founder said to skip review, say so plainly instead."
        )
    sys.stderr.write("\n\n".join(messages) + "\n")
    sys.exit(2)


if __name__ == "__main__":
    main()
