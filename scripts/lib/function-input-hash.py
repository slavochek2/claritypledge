#!/usr/bin/env python3
"""scripts/lib/function-input-hash.py — hash everything an edge function's bundle contains (P1620).

ONE implementation, used by BOTH stamp-deploy-manifest.sh (writes the hashes) and
check-deploy-manifest.sh (compares them), so the two cannot disagree about what a function's
inputs are.

Per function directory <fn> under the functions dir, the hash is sha256 over the sorted
(relative path, content) of:
  - <fn>/index.ts and every file it reaches, transitively (so _shared files and sibling files are
    included),
  - supabase/functions/deno.json(c) and deno.lock (version pins change a bundle),
  - <fn>/deno.json(c) when present.
*.test.ts files are never part of a bundle and are skipped. Bare / npm: / jsr: / https: specifiers
are covered by deno.json + deno.lock and are not traced. Import-map values that are relative
paths ARE traced.

Two passes decide what a file reaches:
  STRICT   a small JS/TS lexer removes comments and swaps every string / template / regex literal
           for a placeholder, so text inside comments or strings can neither hide a statement nor
           fake one. Static import / export-from / literal import() specifiers are resolved. This
           pass owns the fail-closed errors below.
  LIBERAL  over the RAW text, every quoted or backtick literal that starts ./ or ../ and resolves
           to a file inside the functions dir joins the trace, whatever the lexer thought of it.
           It never errors. Over-inclusion is acceptable; a miss is not.

Fail closed (strict pass). A function whose inputs cannot be established gets an entry in "errors"
and NO hash:
  - a relative import that does not resolve to a file (or leaves the functions dir),
  - a dynamic import() whose first argument is not a string / no-substitution template literal
    (a second options argument is fine),
  - import.meta.url / dirname / filename / resolve in a traced non-test file (a runtime file read
    the tracer cannot follow).
A function directory without index.ts hashes to "" (the long-standing shape of the `_shared` entry).

Usage: function-input-hash.py FUNCTIONS_DIR [--only NAME ...] [--files NAME]
Output (stdout, JSON): {"hashes": {name: hex-or-""}, "errors": {name: message}}
  --files NAME prints {"files": [relative paths in NAME's trace]} instead (diagnostics, oracle).
Exit 0 when it ran to completion (errors are data, the caller must read them); any other exit
code means the helper itself failed and the caller must NOT treat that as a clean result.
"""
import hashlib
import json
import os
import re
import sys

CODE_EXT = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts')

_PH = '"\x00%d"'
_STATIC = re.compile(
    r'(?<![\w$.])(?:import|export)\b\s*(?:[^"\';]*?\bfrom\s*)?"\x00(\d+)"', re.S)
_DYNAMIC_ANY = re.compile(r'(?<![\w$.])import\s*\(')
_DYNAMIC_LITERAL = re.compile(r'import\s*\(\s*"\x00(\d+)"\s*(?:,[^()]*)?\)', re.S)
_IMPORT_META = re.compile(r'(?<![\w$])import\s*\.\s*meta\s*\.\s*(?:url|dirname|filename|resolve)\b')
_RAW_REL = re.compile(r"""(['"`])(\.{1,2}/[^'"`\n\\$]*)\1""")
_REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
# A '/' after one of these words opens a regex, not a division. Misreading `return /"/` as division
# makes the lexer enter a string at that quote and swallow what follows, fail-closed checks included.
_REGEX_KEYWORDS = re.compile(r'(?<![\w$.])(?:return|typeof|instanceof|void|delete|throw|case|in|of|yield|await|do|else)\s*$')


class TraceError(Exception):
    pass


def tokenize(src):
    """Lightweight JS/TS lexer. Returns (code_text, strings): comments dropped, each string,
    template and regex literal replaced by a placeholder (templates with substitutions are
    recorded as '${' so a dynamic import of one is treated as non-literal)."""
    out, strings = [], []
    i, n = 0, len(src)
    last = ''

    def scan_string(j, q):
        j += 1
        while j < n and src[j] != q:
            if src[j] == '\\':
                j += 1
            j += 1
        return j

    def scan_template(j):
        j += 1
        while j < n and src[j] != '`':
            if src[j] == '\\':
                j += 2
                continue
            if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                depth, j = 1, j + 2
                while j < n and depth:
                    c = src[j]
                    if c in '\'"':
                        j = scan_string(j, c)
                    elif c == '`':
                        j = scan_template(j)
                    elif c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                    j += 1
                continue
            j += 1
        return j

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if c == '/' and nxt == '/':
            while i < n and src[i] != '\n':
                i += 1
        elif c == '/' and nxt == '*':
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            out.append(' ')
        elif c in '\'"':
            j = scan_string(i, c)
            strings.append(src[i + 1:j])
            out.append(_PH % (len(strings) - 1))
            i, last = j + 1, '"'
        elif c == '`':
            j = scan_template(i)
            body = src[i + 1:j]
            strings.append('${' if '${' in body else body)
            out.append(_PH % (len(strings) - 1))
            i, last = j + 1, '"'
        elif c == '/' and (last == '' or last in _REGEX_PREV or _REGEX_KEYWORDS.search(''.join(out[-16:]))):
            j, in_class = i + 1, False
            while j < n and src[j] != '\n':
                if src[j] == '\\':
                    j += 1
                elif src[j] == '[':
                    in_class = True
                elif src[j] == ']':
                    in_class = False
                elif src[j] == '/' and not in_class:
                    break
                j += 1
            out.append('/R/')
            i, last = j + 1, 'R'
        else:
            out.append(c)
            if not c.isspace():
                last = c
            i += 1
    return ''.join(out), strings


def is_test(path):
    return path.endswith('.test.ts') or path.endswith('.test.tsx')


def read_bytes(path):
    with open(path, 'rb') as fh:
        return fh.read()


def load_import_map(path):
    """Relative-path values of a deno.json(c) imports map: {key: normalised path}."""
    out = {}
    if not os.path.isfile(path):
        return out
    try:
        text = read_bytes(path).decode('utf-8')
        if path.endswith('.jsonc'):
            code, strs = tokenize(text)
            code = re.sub(r'"\x00(\d+)"', lambda m: json.dumps(strs[int(m.group(1))]), code)
            text = re.sub(r',(\s*[}\]])', r'\1', code)
        data = json.loads(text)
    except ValueError as exc:
        raise TraceError('unparsable %s: %s' % (os.path.basename(path), exc))
    imports = data.get('imports', {}) if isinstance(data, dict) else {}
    base = os.path.dirname(path)
    for key, val in (imports or {}).items():
        if isinstance(val, str) and (val.startswith('./') or val.startswith('../')):
            out[key] = os.path.normpath(os.path.join(base, val))
    return out


def resolve_bare(spec, import_maps):
    for imap in import_maps:
        if spec in imap:
            return imap[spec]
        for key, val in imap.items():
            if key.endswith('/') and spec.startswith(key):
                return os.path.normpath(os.path.join(val, spec[len(key):]))
    return None


def trace(entry, functions_dir, import_maps):
    root = os.path.realpath(functions_dir)
    seen = {}
    stack = [entry]
    while stack:
        path = stack.pop()
        real = os.path.realpath(path)
        if real in seen:
            continue
        if not (real == root or real.startswith(root + os.sep)):
            raise TraceError('import leaves the functions directory: %s' % path)
        if not os.path.isfile(real):
            raise TraceError('relative import does not resolve to a file: %s'
                             % os.path.relpath(path, functions_dir))
        raw = read_bytes(real)
        seen[real] = raw
        if not real.endswith(CODE_EXT):
            continue
        raw_text = raw.decode('utf-8', 'replace')
        text, strings = tokenize(raw_text)
        rel = os.path.relpath(real, root)
        if _IMPORT_META.search(text):
            raise TraceError('import.meta file access in %s (a runtime file read cannot be traced)' % rel)
        for m in _DYNAMIC_ANY.finditer(text):
            lit = _DYNAMIC_LITERAL.match(text, m.start())
            if not lit or strings[int(lit.group(1))] == '${':
                raise TraceError('dynamic import() with a non-literal argument in %s' % rel)
        specs = [strings[int(m.group(1))] for m in _STATIC.finditer(text)]
        specs += [strings[int(m.group(1))] for m in _DYNAMIC_LITERAL.finditer(text)]
        for spec in specs:
            if spec.startswith('./') or spec.startswith('../'):
                target = os.path.normpath(os.path.join(os.path.dirname(real), spec))
            elif spec.startswith('/'):
                target = spec
            else:
                target = resolve_bare(spec, import_maps)
                if target is None:
                    continue  # remote / npm / jsr: pinned by deno.json + deno.lock
            if is_test(target):
                continue
            stack.append(target)
        # Liberal pass: never errors, independent of anything the lexer got wrong above.
        for m in _RAW_REL.finditer(raw_text):
            target = os.path.normpath(os.path.join(os.path.dirname(real), m.group(2)))
            tr = os.path.realpath(target)
            if os.path.isfile(tr) and tr.startswith(root + os.sep) and not is_test(tr):
                stack.append(target)
    return seen, root


def collect(fn_dir, functions_dir):
    """{realpath: bytes} of every input of the function, or None when it has no index.ts."""
    index = os.path.join(fn_dir, 'index.ts')
    if not os.path.isfile(index):
        return None, None
    cfgs = [os.path.join(fn_dir, 'deno.json'), os.path.join(fn_dir, 'deno.jsonc'),
            os.path.join(functions_dir, 'deno.json'), os.path.join(functions_dir, 'deno.jsonc')]
    maps = [load_import_map(c) for c in cfgs]
    files, root = trace(index, functions_dir, maps)
    for extra in cfgs + [os.path.join(functions_dir, 'deno.lock')]:
        if os.path.isfile(extra):
            files[os.path.realpath(extra)] = read_bytes(extra)
    return files, root


def hash_function(fn_dir, functions_dir):
    files, root = collect(fn_dir, functions_dir)
    if files is None:
        return ''
    h = hashlib.sha256()
    for real in sorted(files, key=lambda p: os.path.relpath(p, root)):
        rel = os.path.relpath(real, root).encode('utf-8')
        h.update(rel + b'\0' + str(len(files[real])).encode() + b'\0' + files[real] + b'\0')
    return h.hexdigest()


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 64
    functions_dir = argv[1]
    only, list_files = [], None
    i = 2
    while i < len(argv):
        if argv[i] == '--only' and i + 1 < len(argv):
            only.append(argv[i + 1])
            i += 2
        elif argv[i] == '--files' and i + 1 < len(argv):
            list_files = argv[i + 1]
            i += 2
        else:
            sys.stderr.write('unknown argument: %s\n' % argv[i])
            return 64
    if not os.path.isdir(functions_dir):
        sys.stderr.write('not a directory: %s\n' % functions_dir)
        return 64
    if list_files is not None:
        try:
            files, root = collect(os.path.join(functions_dir, list_files), functions_dir)
        except TraceError as exc:
            json.dump({'error': str(exc)}, sys.stdout)
            sys.stdout.write('\n')
            return 0
        json.dump({'files': sorted(os.path.relpath(p, root) for p in (files or {}))}, sys.stdout)
        sys.stdout.write('\n')
        return 0
    names = only or sorted(
        d for d in os.listdir(functions_dir)
        if os.path.isdir(os.path.join(functions_dir, d)))
    hashes, errors = {}, {}
    for name in names:
        fn_dir = os.path.join(functions_dir, name)
        if not os.path.isdir(fn_dir):
            errors[name] = 'no such function directory'
            continue
        try:
            hashes[name] = hash_function(fn_dir, functions_dir)
        except TraceError as exc:
            errors[name] = str(exc)
    json.dump({'hashes': hashes, 'errors': errors}, sys.stdout, sort_keys=True)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
