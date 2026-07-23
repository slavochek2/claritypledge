#!/usr/bin/env python3
"""
check-single-value-slots.py — SINGLE-VALUE slot reconciliation canary.

A strategy-doc heading that holds exactly ONE current answer (the page hero,
the active channel, the active market focus) is marked with an HTML comment:

    <!-- SINGLE-VALUE: <slot-name> -->

placed immediately under the heading. A single-valued directive is written as
a dated blockquote callout, e.g.:

    > **Active-focus lead (founder wedge, 2026-07-04 — ...).** Lead with ...
    > **Divergent-AI hook (2026-07-11, ...).** Lead the page with ...

This script scans the contiguous blockquote-callout group directly under each
marker (blank lines allowed; the group ends at the first non-blank line that
is not a blockquote, or at a heading) and counts the *unreconciled dated
directives* in it. Scoping to the callout group — not the whole section — is
deliberate: a section like §Channels & Flywheel mixes the channel *bet* (the
single-valued answer) with flywheel *mechanics* prose that is not a competing
answer, so a whole-section count would be noise.

A directive is treated as reconciled/subordinate (and NOT counted) when its
lead-in OPENS with a structured token — SUPERSEDED, FALLBACK, dormant, parked,
demoted — with or without the CHARTER.md bracket ("[FALLBACK — ...]" is the
prescribed form; older callouts write "**Dormant (...)**"). Prose "revert to ..."
inside a falsifier does NOT count, and neither does the token appearing
mid-sentence: an unanchored match let a copy-edit that moved "dormant-revivable"
into a lead-in silently discount a genuine competing directive.
PRIMARY is NOT a reconciliation token: it marks the winner, and the winner is
exactly the directive that must stay counted.

If >= 2 unreconciled directive blocks survive under one marker, that slot has
competing single-valued directives accumulating silently (the P987 failure:
2026-07-04 "Get to PMF faster" + 2026-07-11 "divergent-AI hook" both saying
"lead the page with X"). The script reports it.

This is the deterministic core shared by:
  - /slava:maintain:docs-strategy-update Gate 8 (single-valued-slot reconciliation)
  - scripts/pre-commit-checks.sh SINGLE-VALUE canary (WARN, not BLOCK)

Exit codes: 0 = all slots reconciled, 2 = >=1 slot unreconciled, 1 = usage error.
Output is data (quoted directive headers) — never eval'd by any caller.
"""
import re
import sys

MARKER_RE = re.compile(r'<!--\s*SINGLE-VALUE:\s*([A-Za-z0-9_-]+)\s*-->')
HEADING_RE = re.compile(r'^#{1,3}\s')
BLOCKQUOTE_RE = re.compile(r'^\s*>')
# A single-valued directive is a STANDALONE dated callout: > **...20YY-MM-DD...**
# A leading "- " (a list bullet: "> - **facet (date):**") is an elaboration
# item, NOT a competing lead — excluded by requiring no dash after the ">".
DIRECTIVE_RE = re.compile(r'^\s*>\s*\*\*(.*?20\d\d-\d\d-\d\d.*?)\*\*')
# Structured reconciliation tokens — checked ONLY on the lead-in text, not the body,
# and ONLY as the bracketed prefix CHARTER.md prescribes ("[SUPERSEDED ... ]",
# "[FALLBACK — ...]"). Anchoring matters: an unanchored [Dd]ormant matched the word
# anywhere in the lead-in, so a copy-edit that moved "dormant-revivable" into a lead
# silently discounted a genuine competing directive.
# PRIMARY is deliberately NOT a token: it marks the WINNING lead. Counting it as
# reconciled meant that following the "primary + [FALLBACK]" instruction dropped the
# counted set to 0, and the next untagged lead could only reach 1 — exit 0 forever.
RECONCILED_RE = re.compile(
    r'^\s*\[?(SUPERSEDED|FALLBACK|[Dd]ormant|[Pp]arked|demoted)\b', re.UNICODE
)


def scan_file(path):
    """Return list of (slot_name, [directive_header, ...]) for unreconciled slots."""
    try:
        with open(path, encoding='utf-8') as fh:
            lines = fh.readlines()
    except (OSError, UnicodeDecodeError) as exc:
        print(f"check-single-value-slots: cannot read {path}: {exc}", file=sys.stderr)
        return None

    findings = []
    i = 0
    n = len(lines)
    while i < n:
        m = MARKER_RE.search(lines[i])
        if not m:
            i += 1
            continue
        slot = m.group(1)
        # Region = the contiguous blockquote-callout group directly under the
        # marker. Skip leading blank lines; then consume blank + blockquote lines;
        # stop at the first non-blank non-blockquote line, or at any heading.
        j = i + 1
        while j < n and lines[j].strip() == '':
            j += 1
        directives = []
        while j < n:
            line = lines[j]
            if HEADING_RE.match(line):
                break
            if line.strip() == '' or BLOCKQUOTE_RE.match(line):
                dm = DIRECTIVE_RE.match(line)
                if dm:
                    header = dm.group(1).strip()
                    if not RECONCILED_RE.search(header):
                        directives.append(header)
                j += 1
                continue
            break  # non-blank, non-blockquote line ends the callout group
        if len(directives) >= 2:
            findings.append((slot, directives))
        i = max(j, i + 1)
    return findings


def main(argv):
    paths = argv[1:]
    if not paths:
        print("usage: check-single-value-slots.py <file.md> [<file.md> ...]", file=sys.stderr)
        return 1

    any_unreconciled = False
    read_error = False
    for path in paths:
        findings = scan_file(path)
        if findings is None:
            read_error = True
            continue
        for slot, directives in findings:
            any_unreconciled = True
            print(f"SINGLE-VALUE slot '{slot}' in {path} has "
                  f"{len(directives)} competing unreconciled directives:")
            for d in directives:
                print(f"    - {d}")
            print("  Reconcile to ONE current answer (mark the loser(s) with a "
                  "SUPERSEDED / FALLBACK token) — a single-valued slot holds one lead.")

    if read_error:
        return 1
    return 2 if any_unreconciled else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
