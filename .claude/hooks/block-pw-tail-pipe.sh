#!/bin/bash
# PreToolUse hook (Bash matcher): block piping live Playwright output to tail/head.
#
# Why: piping the live line/list reporter truncates — tail cuts the per-test
# failure detail, head cuts the failed/flaky summary at the end. Either way the
# session misreads results and re-runs the whole suite (P888, P893 — second
# violation despite .claude/rules/tests.md banning it; this hook is the
# mechanical layer for that rule).
#
# Allowed: tail/head of a LOG FILE (e.g. `tail /tmp/pw.log`), and any command that
# merely MENTIONS playwright without running tests (`cat playwright.config.ts | head`,
# `ls node_modules/playwright | head`, a commit message naming `playwright.config.ts`,
# a grep pattern containing "playwright"). Only a live test RUN piped to head/tail is
# blocked. Match the run, not the word.
#
# RUN forms covered:
#   - direct:  `playwright test ...`  (also `npx playwright test`, `.bin/playwright test`)
#   - wrapped: `npm run test:e2e*`, `npm run smoke*`  (package.json scripts that exec
#     `playwright test`; `npm test` is vitest, intentionally NOT matched)
#
# How (2026-09-29 rewrite — the old check ANDed two whole-string greps, so
# `pgrep -fl "playwright test" | cut ...; lsof ... | head -1`, the redirect-then-grep
# pattern `npx playwright test > l.txt; grep FAIL l.txt | head`, and the repo's own JSON
# remedy `... > r.json; jq .stats r.json | head` were all denied):
#   1. blank quoted strings, drop comments and heredoc bodies;
#   2. split into statements at brace/paren depth 0 on ; && || & newline;
#   3. split each statement into pipeline stages at depth-0 `|` / `|&`;
#   4. deny when a stage contains the RUN and a LATER stage of the same pipeline starts
#      with head/tail. `| tee` (or anything) in between is allowed through.
#   Groups — `{ ...; }`, `( ... )`, `$( ... )` — are checked as a unit in their parent
#   pipeline (`{ npx playwright test; } | tail` is denied) and recursively on their own.
# Matching is case-insensitive (`| TAIL`, `PLAYWRIGHT TEST`).
#
# Known residuals (the rule's prose layer covers them): other truncators (`sed -n`,
# `awk 'NR<'`, `grep -m`, `less`/`more`) are NOT matched — flag-dependent, and the
# canonical recommended pattern itself pipes to `grep`. A run hidden inside a quoted
# string (`bash -c "playwright test | tail"`) is not matched either.
#
# FAILS OPEN: parse error, missing python3, or unexpected input => allow. A broken
# PreToolUse Bash hook blocks every shell command. Self-contained by design (committed to
# a public repo — no dependency on anything outside it).
# Canary: scripts/test-block-pw-tail-pipe.sh [hook-path]

INPUT=$(cat)

# read -d '' rather than SCRIPT=$(cat <<'PY' ...): macOS /bin/bash 3.2 cannot parse a
# heredoc with unbalanced quotes inside $( ), which turns the hook into a syntax error —
# bash exits 2, and exit 2 from a PreToolUse hook BLOCKS every Bash call.
IFS= read -r -d '' SCRIPT <<'PY'
import sys, json, re

def strip_shell(s):
    """Blank quoted strings (-> '_'), drop comments and heredoc bodies."""
    out = []
    i, n = 0, len(s)
    pending = []
    prev = ''
    while i < n:
        c = s[i]
        if c == '\\':
            if i + 1 < n:
                nx = s[i + 1]
                out.append(' ' if nx == '\n' else (nx if nx.isalnum() else '_'))
                i += 2
            else:
                i += 1
            prev = out[-1] if out else ''
            continue
        if c == "'":
            ansi = i > 0 and s[i - 1] == '$'
            j = i + 1
            while j < n and s[j] != "'":
                j += 2 if (ansi and s[j] == '\\') else 1
            out.append('_'); prev = '_'
            i = j + 1
            continue
        if c == '"':
            j = i + 1
            while j < n and s[j] != '"':
                j += 2 if s[j] == '\\' else 1
            out.append('_'); prev = '_'
            i = j + 1
            continue
        if c == '#' and (not out or prev in ' \t\n;&|(){}'):
            while i < n and s[i] != '\n':
                i += 1
            continue
        if c == '<' and s.startswith('<<', i) and not s.startswith('<<<', i):
            j = i + 2
            strip_tabs = False
            if j < n and s[j] == '-':
                strip_tabs = True; j += 1
            while j < n and s[j] in ' \t':
                j += 1
            delim = ''
            while j < n and s[j] not in ' \t\n;&|<>()':
                ch = s[j]
                if ch in '\'"':
                    k = s.find(ch, j + 1)
                    k = n if k < 0 else k
                    delim += s[j + 1:k]; j = k + 1
                elif ch == '\\':
                    delim += s[j + 1:j + 2]; j += 2
                else:
                    delim += ch; j += 1
            if delim:
                pending.append((delim, strip_tabs))
            out.append('<<_'); prev = '_'
            i = j
            continue
        if c == '\n' and pending:
            out.append('\n'); prev = '\n'
            i += 1
            for delim, strip_tabs in pending:
                while i < n:
                    e = s.find('\n', i)
                    line = s[i:] if e < 0 else s[i:e]
                    i = n if e < 0 else e + 1
                    if (line.lstrip('\t') if strip_tabs else line) == delim:
                        break
            pending = []
            continue
        out.append(c); prev = c
        i += 1
    return ''.join(out)

OPEN, CLOSE = '({', ')}'

def split_depth0(s, kind):
    """kind='stmt': split on ; && || & newline.  kind='pipe': split on | and |&
    (never ||). Only at paren/brace depth 0."""
    parts, cur, depth, i, n = [], [], 0, 0, len(s)
    while i < n:
        c = s[i]
        if c in OPEN:
            depth += 1
        elif c in CLOSE:
            depth = max(0, depth - 1)
        elif depth == 0:
            nx = s[i + 1] if i + 1 < n else ''
            pv = s[i - 1] if i > 0 else ''
            if kind == 'stmt':
                if c in ';\n' or (c == '&' and nx == '&') or (c == '|' and nx == '|'):
                    parts.append(''.join(cur)); cur = []
                    i += 2 if (c in '&|' or (c == ';' and nx == ';')) else 1
                    continue
                if c == '&' and pv not in '<>|' and nx != '>':
                    parts.append(''.join(cur)); cur = []
                    i += 1
                    continue
            else:
                if c == '|' and nx != '|' and pv != '|':
                    parts.append(''.join(cur)); cur = []
                    i += 2 if nx == '&' else 1
                    continue
        cur.append(c)
        i += 1
    parts.append(''.join(cur))
    return parts

def groups(s):
    """Inner text of each depth-0 ( ... ) / { ... } group in s."""
    res, depth, start = [], 0, 0
    for i, c in enumerate(s):
        if c in OPEN:
            if depth == 0:
                start = i + 1
            depth += 1
        elif c in CLOSE and depth > 0:
            depth -= 1
            if depth == 0:
                res.append(s[start:i])
    if depth > 0:
        res.append(s[start:])
    return res

RUN_RE = re.compile(r'(playwright\s+test|npm\s+run\s+(test:e2e|smoke))', re.I)
TRUNC_RE = re.compile(r'\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:\S*/)?(?:tail|head)(?![A-Za-z0-9_-])', re.I)

def offends(s, budget=[200]):
    budget[0] -= 1
    if budget[0] < 0:
        return False
    for stmt in split_depth0(s, 'stmt'):
        stages = split_depth0(stmt, 'pipe')
        seen_run = False
        for st in stages:
            if seen_run and TRUNC_RE.match(st):
                return True
            if RUN_RE.search(st):
                seen_run = True
        for g in groups(stmt):
            if offends(g, budget):
                return True
    return False

def main():
    try:
        d = json.loads(sys.stdin.read())
        cmd = (d.get('tool_input') or {}).get('command') or ''
    except Exception:
        return
    if not isinstance(cmd, str) or not RUN_RE.search(cmd):
        return
    if not offends(strip_shell(cmd)):
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "BLOCKED (.claude/rules/tests.md — Reading Playwright Output): piping live "
            "Playwright reporter output to tail/head loses failure detail (tail) or the "
            "failed/flaky summary (head), forcing a full re-run. Use instead: npx playwright "
            "test ... > /tmp/pw.log 2>&1; grep -E \"[0-9]+ (passed|failed|flaky)\" /tmp/pw.log "
            "— then read failure sections from /tmp/pw.log directly (tail/head on the log "
            "FILE is fine). For ship/fix decisions use the JSON reporter.")}}))

try:
    main()
except Exception:
    pass
PY

# Fail open: python3 missing/crashing prints nothing => allow. Only a complete deny
# object is forwarded.
OUT=$(printf '%s' "$INPUT" | python3 -c "$SCRIPT" 2>/dev/null) || OUT=''
[[ "$OUT" == *'"permissionDecision": "deny"'* ]] && printf '%s\n' "$OUT"
exit 0
