#!/usr/bin/env python3
"""Exit 1 (and name the line) when a migration holds a psql backslash command outside a string,
comment or dollar-quoted body. psql runs these from stdin anywhere on a line (\\! is a shell in the
db container, \\c switches database), so a migration must be plain SQL. P1557 review."""
import re, sys

def meta_lines(sql):
    i, n, line, out = 0, len(sql), 1, []
    while i < n:
        c = sql[i]
        if c == '\n':
            line += 1; i += 1
        elif sql.startswith('--', i):
            j = sql.find('\n', i); i = n if j < 0 else j
        elif sql.startswith('/*', i):
            # Block comments nest in PostgreSQL and psql: track depth, never stop at the first */.
            j, depth = i + 2, 1
            while j < n and depth:
                if sql.startswith('/*', j): depth += 1; j += 2
                elif sql.startswith('*/', j): depth -= 1; j += 2
                else: j += 1
            line += sql.count('\n', i, j); i = j
        elif c == '"':
            # A quoted identifier: "" is an escaped quote; nothing inside starts a string or comment.
            j = i + 1
            while j < n:
                if sql[j] == '"':
                    if j + 1 < n and sql[j + 1] == '"': j += 2; continue
                    break
                j += 1
            line += sql.count('\n', i, j); i = j + 1
        elif c == "'":
            # Backslash escapes a quote only in E'...' strings; in a standard string (the default,
            # standard_conforming_strings = on) it is a literal, so 'a\' ends at its second quote.
            escapes = i > 0 and sql[i - 1] in 'eE' and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] == '_'))
            j = i + 1
            while j < n:
                if escapes and sql[j] == '\\' and j + 1 < n: j += 2; continue
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'": j += 2; continue
                    break
                j += 1
            line += sql.count('\n', i, j); i = j + 1
        elif c == '$':
            m = re.match(r'\$([A-Za-z_][A-Za-z0-9_]*)?\$', sql[i:])
            if m:
                tag = m.group(0); j = sql.find(tag, i + len(tag)); j = n if j < 0 else j + len(tag)
                line += sql.count('\n', i, j); i = j
            else:
                i += 1
        elif c == '\\':
            out.append(line); i += 1
        else:
            i += 1
    return out

if __name__ == '__main__':
    bad = 0
    for path in sys.argv[1:]:
        with open(path, encoding='utf-8') as f:
            hits = meta_lines(f.read())
        for ln in hits:
            print(f'{path}:{ln}: psql backslash command outside a string'); bad = 1
    sys.exit(bad)
