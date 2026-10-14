#!/usr/bin/env python3
"""
check-single-value-slots.py — SINGLE-VALUE slot reconciliation canary.

A strategy-doc heading that holds exactly ONE current answer (the page hero,
the active channel, the active market focus) is marked with an HTML comment,
on a line of its own, directly under the heading:

    <!-- SINGLE-VALUE: <slot-name> -->

A single-valued directive is written as a dated blockquote callout, e.g.:

    > **Active-focus lead (founder wedge, 2026-07-04 — ...).** Lead with ...
    > **Divergent-AI hook (2026-07-11, ...).** Lead the page with ...

This script counts the *unreconciled dated directives* in each slot. If >= 2
survive under one marker, that slot has competing single-valued directives
accumulating silently (the P987 failure: 2026-07-04 "Get to PMF faster" +
2026-07-11 "divergent-AI hook" both saying "lead the page with X").

WHAT IS SCANNED (P1009 widened this — the old scope let eight real shapes of a
competing lead through; see features/p1009_single_value_canary_evasions.md):

  * Region = the marker's whole SECTION: from the heading that owns the marker
    to the next heading of the same or a higher level. That includes lines
    between the heading and the marker, lines after the callout group's
    closing prose, and the section's subsections. (Previously the scan stopped
    at the first prose line under the marker.)
  * Only blockquote lines are candidates. Bold-led PROSE paragraphs are never
    directives — this is what keeps §Channels & Flywheel's mechanics prose out
    of the count, the reason the old scan was scoped to the callout group.
  * A marker must sit on a line of its own and outside a code fence. A marker
    quoted inline in prose, or shown as an example inside ``` fences, is not a
    slot. Fenced lines are skipped everywhere in a region.

WHAT COUNTS AS A DIRECTIVE: a blockquote item whose content starts with a bold
lead-in (`**...**`, after an optional list bullet), at any `>` depth, and that
carries a date ANYWHERE in the item — the lead-in, the rest of the line, or
its continuation lines. ISO dates (2026-07-22) and human formats (22 July
2026, July 22, 2026, July 2026, 22.07.2026) both count. An UNDATED bold
callout (a quoted tagline) is not a directive.

Blockquote lines are grouped into blocks (a run of `>` lines with no blank
line between). Within a block:
  * a bold line at the block's base depth, not a bullet, is a LEAD;
  * a `> - **...**` bullet attached under a lead is an ELABORATION of that lead
    (CHARTER convention) and is not counted — but a bullet that OPENS its own
    block has no lead to elaborate and is a standalone directive;
  * a nested `>>` bold line under a live lead is NOT a sanctioned elaboration
    shape and is counted;
  * anything inside a reconciled lead's block (bullets, nested quotes) is part
    of that retired callout and inherits its reconciliation.

A directive is treated as reconciled/subordinate (and NOT counted) when its
lead-in OPENS with a CLOSED bracketed token — [SUPERSEDED ...], [FALLBACK ...],
[Dormant ...], [Parked ...], [Demoted ...] (CHARTER.md single-valued-slot
convention). The bracket is required, not decorative: it is what distinguishes a
TAG ("[Dormant — coach market]") from a SENTENCE ("Dormant no longer — revived as
THE lead"). Prose "revert to ..." inside a falsifier does NOT count, and neither
does a bare leading token.
PRIMARY is NOT a reconciliation token: it marks the winner, and the winner is
exactly the directive that must stay counted.

KNOWN RESIDUAL (deliberate, P1009): a competing lead written as a `> - **...**`
bullet ATTACHED under the live lead is structurally identical to the sanctioned
dated elaboration bullet, and is not counted. Telling them apart needs either a
semantic judgment or a new bracket token for elaborations — a convention change,
not a parser change.

KNOWN LIMITATIONS (markdown edge cases, not handled — this is a warn-only canary,
so trust it no further than this list; P1009 final review):
  * Indented code blocks are not modelled: a ``` line indented 4+ spaces is read
    as a fence opener, so the rest of the file may be skipped (missed leads).
    Fences inside a blockquote (`> ````) are not detected, so dated bold lines in
    a quoted code example may be counted (spurious warning).
  * HTML comments are not modelled: a ``` line inside `<!-- ... -->` opens a
    fence that never closes, so the rest of the file may be skipped (missed leads).
  * Spaced nested quote prefixes (`>  > **B**`, two spaces) are not detected as
    nesting: the line reads as depth-1 continuation text and is not counted.
  * Retirement is not cleared by a NON-bold outdent line: an item after
    `> plain text` may still be scoped inside an earlier retired callout and go
    uncounted. Only a bold lead-in line pops the nesting.
  * Indented ATX headings (`  ## X`, 1-3 spaces) are not recognised as headings,
    so they do not end a section and the slot may mis-scope into the next one.

This is the deterministic core shared by:
  - /slava:maintain:docs-strategy-update Gate 8 (single-valued-slot reconciliation)
  - scripts/pre-commit-checks.sh SINGLE-VALUE canary (WARN, not BLOCK)
  - scripts/test-p1009-single-value-canary.sh (fixtures + real-doc controls)

Usage: check-single-value-slots.py [--list] <file.md> [<file.md> ...]
  --list  also print every slot found and each directive counted in it, even
          when the slot is clean (a parser that finds nothing must be visible).

Exit codes: 0 = all slots reconciled, 2 = >=1 slot unreconciled, 1 = usage error.
Output is data (quoted directive headers) — never eval'd by any caller.
"""
import re
import sys

# Own line only: a marker quoted inline in prose ("§UVP `<!-- SINGLE-VALUE: x -->`
# carried three leads") is a mention, not a slot.
MARKER_RE = re.compile(r'^\s*<!--\s*SINGLE-VALUE:\s*([A-Za-z0-9_-]+)\s*-->\s*$')
HEADING_RE = re.compile(r'^(#{1,6})\s')
# A fence delimiter: a run of 3+ backticks or tildes, then the rest of the line. Whether it
# opens or closes is decided in _fenced_flags (CommonMark rules), not by this regex.
# Indentation is accepted leniently (CommonMark allows 0-3 spaces, more inside list items).
FENCE_RE = re.compile(r'^[ \t]*(`{3,}|~{3,})(.*)$')
# The `>` prefix of a blockquote line, at any depth: ">", ">>", "> >".
QUOTE_PREFIX_RE = re.compile(r'^\s*((?:>\s?)+)')
BULLET_RE = re.compile(r'^(?:[-*+]|\d+[.)])\s+')
# Bold lead-in: everything up to the closing **, or to end of line if it never closes.
LEAD_RE = re.compile(r'^\*\*(.*?)(?:\*\*|$)')

_MONTH = (r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|'
          r'Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?')
DATE_RE = re.compile(
    r'\b20\d\d-\d\d-\d\d\b'                                    # 2026-07-22
    r'|\b\d{1,2}(?:st|nd|rd|th)?\s+' + _MONTH + r',?\s+20\d\d\b'   # 22 July 2026
    r'|\b' + _MONTH + r'\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d\d\b'   # July 22, 2026
    r'|\b' + _MONTH + r'\s+20\d\d\b'                               # July 2026
    r'|\b\d{1,2}[./]\d{1,2}[./]20\d\d\b'                       # 22.07.2026 / 22/07/2026
    r'|\b20\d\d/\d{1,2}/\d{1,2}\b',                            # 2026/07/22
    re.IGNORECASE,
)
# Structured reconciliation tokens — checked ONLY on the lead-in, and ONLY as a
# CLOSED bracketed prefix ("[SUPERSEDED 2026-07-03 → ...]", "[FALLBACK — ...]").
#
# The bracket is load-bearing and is NOT cosmetic: it is the only thing separating a
# TAG from a SENTENCE. "[Dormant]" is a tag; "Dormant no longer — revived as THE lead"
# is a live promotion. Without the bracket both reconcile, and the failure is
# asymmetric — missing a RETIREMENT token fails closed (a spurious red), while
# silencing a REVIVAL token fails open: two live heroes under one slot, exit 0.
# Revivals are the highest-stakes edit a single-valued slot receives. (An earlier
# revision here made the bracket optional to keep a non-conforming callout green;
# adversarial review 2026-07-23 showed that re-admitted the exact "dormant-revivable"
# bypass this anchoring was written to close — \b fires on the hyphen. The correct
# resolution was to bracket the callout, which changes its delimiter and not its
# meaning. See decisions.md 2026-07-23 [process].)
#
# PRIMARY is deliberately NOT a token: it marks the WINNING lead. Counting it as
# reconciled meant that following the "primary + [FALLBACK]" instruction dropped the
# counted set to 0, and the next untagged lead could only reach 1 — exit 0 forever.
RECONCILED_RE = re.compile(
    r'^\s*\[(SUPERSEDED|FALLBACK|[Dd]ormant|[Pp]arked|[Dd]emoted)\b[^]]*\]', re.UNICODE
)


def _fenced_flags(lines):
    """Per line: True when the line is inside (or is a delimiter of) a code fence.

    CommonMark: the opener's character and length are remembered; a closer is the SAME
    character, AT LEAST as long, followed only by whitespace. A line with an info string
    (```python) can open a fence but never close one, and a backtick opener's info string
    may not contain a backtick. Getting this wrong is not cosmetic: a 4-backtick example
    that shows a bare ```python line would otherwise flip the state and hide every real
    slot after it (P1009 review). An unclosed fence runs to end of file, as in CommonMark.
    """
    flags = []
    fence = None        # (char, length) of the open fence, or None
    for line in lines:
        m = FENCE_RE.match(line)
        if fence is None:
            if m and not (m.group(1)[0] == '`' and '`' in m.group(2)):
                fence = (m.group(1)[0], len(m.group(1)))
                flags.append(True)
                continue
            flags.append(False)
        else:
            flags.append(True)
            if (m and m.group(1)[0] == fence[0] and len(m.group(1)) >= fence[1]
                    and m.group(2).strip() == ''):
                fence = None
    return flags


def _heading_level(line):
    m = HEADING_RE.match(line)
    return len(m.group(1)) if m else 0


def _section_bounds(lines, fenced, marker_idx):
    """(start, end) of the section that owns the marker at marker_idx.

    start = the line after the nearest preceding heading (or 0);
    end   = the next heading of the same or a higher level (or EOF).
    A marker with no heading above it owns the text up to the next heading.
    """
    owner_level = 6
    start = 0
    for k in range(marker_idx - 1, -1, -1):
        if not fenced[k] and _heading_level(lines[k]):
            owner_level = _heading_level(lines[k])
            start = k + 1
            break
    end = len(lines)
    for k in range(marker_idx + 1, len(lines)):
        level = 0 if fenced[k] else _heading_level(lines[k])
        if level and level <= owner_level:
            end = k
            break
    return start, end


def _blocks(lines, fenced, start, end, skip):
    """Yield runs of consecutive blockquote lines in [start, end), as (depth, content)."""
    block = []
    for k in range(start, end):
        m = None if (fenced[k] or k == skip) else QUOTE_PREFIX_RE.match(lines[k])
        if m:
            depth = m.group(1).count('>')
            block.append((depth, lines[k][m.end():].strip()))
            continue
        if block:
            yield block
            block = []
    if block:
        yield block


def _directives_in_block(block):
    """Return the counted directive lead-ins in one blockquote block.

    `stack` holds the items enclosing the current line, outermost first, as
    (depth, is_bullet, retired, standalone). `retired` is EFFECTIVE: an item inside a
    retired callout is retired however deep it is nested. Outdenting pops back to the
    enclosing item, so its state is restored.
    """
    items = []          # [lead_in, text, counted_candidate]
    stack = []
    current = None
    for depth, content in block:
        bullet = BULLET_RE.match(content)
        body = content[bullet.end():] if bullet else content
        lead = LEAD_RE.match(body)
        if not lead:
            if current is not None:
                current[1] += ' ' + content   # continuation: dates here date the item
            continue
        lead_in = lead.group(1).strip()
        retired = bool(RECONCILED_RE.search(lead_in))
        item = [lead_in, body, False]
        # Pop what this line is not nested inside: anything deeper; a sibling lead at the
        # same depth; a sibling bullet at the same depth, unless that bullet is standalone
        # (it then acts as the lead its siblings elaborate).
        while stack:
            top_depth, top_bullet, _, top_standalone = stack[-1]
            if top_depth > depth or (top_depth == depth and (
                    not bullet or (top_bullet and not top_standalone))):
                stack.pop()
                continue
            break
        parent = stack[-1] if stack else None
        if parent is None:
            # A lead, or a bullet / nested quote with no lead above it in the block:
            # standalone — it elaborates nothing, so it is a directive.
            item[2] = not retired
        elif parent[2]:
            item[2] = False          # inside a retired callout, at any depth
        elif bullet:
            item[2] = False          # sanctioned elaboration of the live lead
        else:
            item[2] = not retired    # a nested `>>` lead inside a live callout
        stack.append((depth, bool(bullet), retired or (parent is not None and parent[2]),
                      parent is None))
        items.append(item)
        current = item
    return [lead_in for lead_in, text, counted in items if counted and DATE_RE.search(text)]


def scan_file(path):
    """Return list of (slot_name, [directive_header, ...]) for every slot found."""
    try:
        with open(path, encoding='utf-8') as fh:
            lines = fh.readlines()
    except (OSError, UnicodeDecodeError) as exc:
        print(f"check-single-value-slots: cannot read {path}: {exc}", file=sys.stderr)
        return None

    fenced = _fenced_flags(lines)
    slots = []
    for i, line in enumerate(lines):
        m = None if fenced[i] else MARKER_RE.match(line)
        if not m:
            continue
        start, end = _section_bounds(lines, fenced, i)
        directives = []
        for block in _blocks(lines, fenced, start, end, skip=i):
            directives.extend(_directives_in_block(block))
        slots.append((m.group(1), directives))
    return slots


def main(argv):
    args = argv[1:]
    list_mode = False
    if args and args[0] == '--list':
        list_mode = True
        args = args[1:]
    paths = args
    if not paths:
        print("usage: check-single-value-slots.py [--list] <file.md> [<file.md> ...]",
              file=sys.stderr)
        return 1

    any_unreconciled = False
    read_error = False
    for path in paths:
        slots = scan_file(path)
        if slots is None:
            read_error = True
            continue
        for slot, directives in slots:
            if list_mode:
                print(f"slot '{slot}' in {path}: {len(directives)} counted directive(s)")
                for d in directives:
                    print(f"    - {d}")
            if len(directives) < 2:
                continue
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
