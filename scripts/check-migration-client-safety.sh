#!/bin/bash
# scripts/check-migration-client-safety.sh — P887 authoring-side gate.
#
# A migration containing client-breaking SQL shapes must declare its coupling:
#   -- requires-frontend: <frontend-commit-sha>
#       migrate.sh --env prod hard-blocks the apply until that commit is an
#       ancestor of origin/main (the coupled frontend is deployed)
#   -- client-safe: <reason>
#       the author affirms deployed clients are unaffected
#
# Detected shapes (best-effort, NOT exhaustive — e.g. a column rename is
# client-breaking but looks innocuous; the post-migrate prod smoke in
# migrate.sh remains the backstop for unenumerable cases):
#   REVOKE ... FROM ... anon|authenticated
#   DROP POLICY
#   ALTER TABLE ... DROP COLUMN
#   ALTER COLUMN ... TYPE
#   DROP FUNCTION                 (P1473 — a dropped or re-signed RPC: PGRST202 /
#                                  42501 for every deployed caller)
#   REVOKE ... ON <object> FROM ... PUBLIC, unless the SAME file creates that
#   object                        (P1473 — a revoke on an EXISTING object. Per
#                                  statement: a function counts as created here only
#                                  if this file has CREATE [OR REPLACE] FUNCTION of
#                                  the same name (schema defaults to public) and, when
#                                  the REVOKE gives argument types, the same types.
#                                  Tables/views/sequences/schemas likewise need their
#                                  CREATE in the file. Revoking PUBLIC from what the
#                                  file itself creates is routine hardening.)
#
# How the SQL is read. A stdlib-python tokenizer (modelled on check-rls-scope.py) splits
# the file into code, comments, 'strings', "identifiers" and $tag$...$tag$ bodies. A
# dollar body always ends at its own closing tag, and string/dollar CONTENT is never
# comment context. An unterminated comment, string, identifier or dollar quote at EOF
# is an error (exit 2), never "blank the rest".
#   - Older arms (REVOKE from anon/authenticated, DROP POLICY, DROP COLUMN, TYPE)
#     grep the file line by line with comments blanked (bodies and strings verbatim,
#     comments inside a body that tokenizes as SQL blanked too).
#   - DROP FUNCTION and REVOKE ... FROM PUBLIC are matched per statement
#     (whitespace-normalized, so a keyword pair split across lines still matches) in
#     the top-level code with strings and bodies blanked, in every dollar-quoted body
#     (DO blocks, function bodies), and in each constant string passed directly to
#     EXECUTE — all read recursively as SQL.
#   - A CREATE only narrows a REVOKE if it is top-level executable code; a CREATE
#     inside a string, comment or body never counts.
#
# Known limitations:
#   - CREATE OR REPLACE FUNCTION with a new argument list (an overload) is NOT
#     detected; the correct authoring shape is DROP FUNCTION then CREATE, which is.
#   - Dynamic SQL assembled at run time (EXECUTE format(...), 'a' || x) is NOT
#     analysed; only constant EXECUTE strings and dollar bodies are.
#   - A dollar-quoted body is read as SQL even when it is a plain literal (e.g.
#     COMMENT ... IS $$...$$) or a function body that only runs when called, so
#     either can flag (fail-closed).
#   - FROM "PUBLIC" (quoted) is treated as PUBLIC and flagged (fail-closed).
#   - Argument-type comparison normalizes common aliases (int/int4, bool,
#     varchar, timestamptz, ...) and folds case, so quoted type names that differ
#     only by case (public."Role" vs public.role) compare equal; any other
#     spelling difference flags.
#
# Usage: check-migration-client-safety.sh <migration.sql> [...]
# Exit: 0 = all files pass; 1 = at least one violation (report on stdout);
#       2 = the SQL helper failed (python3 missing, or unterminated SQL) — fails closed.
# Called by pre-commit-checks.sh for newly staged migrations. P886 incident.
#
# Output contract: status lines contain no redirect-parseable tokens (P783).

set -e

BREAKING_SHAPES='REVOKE[[:space:]].*FROM.*(anon|authenticated)|DROP[[:space:]]+POLICY|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN|ALTER[[:space:]]+COLUMN.*TYPE'

# SQL helper (python3 stdlib only — already required by check-rls-scope.py). Modes:
#   strip <file>    the file with comments blanked, newlines preserved
#   analyze <file>  one line per statement hit, P783-sanitized:
#                     drop<TAB><target>              DROP FUNCTION
#                     revoke<TAB><kind><TAB><target> REVOKE ... FROM PUBLIC on an
#                                                    object the file does not create
SQL_HELPER=$(cat <<'PY'
import re, sys

DOLLAR_TAG = re.compile(r"\$([^\W\d]\w*)?\$")

class Unterminated(Exception):
    pass

def tokenize(text):
    """[(kind, raw, body)], kind in code|comment|squote|dquote|dollar. body: string
    content (quotes unescaped) or dollar-body text. Raises Unterminated at EOF."""
    toks, i, n, start = [], 0, len(text), 0
    def flush(j):
        if j > start:
            toks.append(("code", text[start:j], None))
    while i < n:
        ch = text[i]
        if text.startswith("--", i):
            flush(i)
            j = text.find("\n", i)
            j = n if j < 0 else j
            toks.append(("comment", text[i:j], None)); i = start = j; continue
        if text.startswith("/*", i):
            flush(i)
            depth, j = 1, i + 2
            while depth:
                a, b = text.find("/*", j), text.find("*/", j)
                if b < 0: raise Unterminated("block comment")
                if 0 <= a < b:
                    depth += 1; j = a + 2
                else:
                    depth -= 1; j = b + 2
            toks.append(("comment", text[i:j], None)); i = start = j; continue
        if ch == "'":
            flush(i)
            prev, prev2 = text[i - 1:i], text[i - 2:i - 1] if i > 1 else ""
            esc = prev in ("E", "e") and not (prev2.isalnum() or prev2 == "_")
            j = i + 1
            while True:
                if j >= n: raise Unterminated("string")
                if esc and text[j] == "\\":
                    j += 2; continue
                if text[j] == "'":
                    if text[j + 1:j + 2] == "'":
                        j += 2; continue
                    break
                j += 1
            toks.append(("squote", text[i:j + 1], text[i + 1:j].replace("''", "'")))
            i = start = j + 1; continue
        if ch == '"':
            flush(i)
            j = i + 1
            while True:
                k = text.find('"', j)
                if k < 0: raise Unterminated("quoted identifier")
                if text[k + 1:k + 2] == '"':
                    j = k + 2; continue
                break
            toks.append(("dquote", text[i:k + 1], None)); i = start = k + 1; continue
        if ch == "$" and not (i and (text[i - 1].isalnum() or text[i - 1] in "_$")):
            m = DOLLAR_TAG.match(text, i)
            if m:
                flush(i)
                tag = m.group(0)
                k = text.find(tag, m.end())
                if k < 0: raise Unterminated("dollar quote " + tag)
                toks.append(("dollar", text[i:k + len(tag)], text[m.end():k]))
                i = start = k + len(tag); continue
        i += 1
    flush(n)
    return toks

def blank(s):
    return re.sub(r"[^\n]", " ", s)

def dollar_parts(raw, body):
    t = (len(raw) - len(body)) // 2
    return raw[:t], raw[t:t + len(body)], raw[t + len(body):]

def strip_view(toks):
    out = []
    for kind, raw, body in toks:
        if kind == "comment":
            out.append(blank(raw))
        elif kind == "dollar":
            open_tag, inner, close_tag = dollar_parts(raw, body)
            try:
                inner = strip_view(tokenize(inner))
            except Unterminated:
                pass                                    # not SQL (e.g. a literal): verbatim
            out.append(open_tag + inner + close_tag)
        else:
            out.append(raw)
    return "".join(out)

def exec_view(toks):
    """Executable code only: comments, string content and dollar bodies blanked."""
    out = []
    for kind, raw, body in toks:
        if kind == "comment":
            out.append(blank(raw))
        elif kind == "squote":
            out.append("'" + blank(raw[1:-1]) + "'")
        elif kind == "dollar":
            open_tag, inner, close_tag = dollar_parts(raw, body)
            out.append(open_tag + blank(inner) + close_tag)
        else:
            out.append(raw)
    return "".join(out)

def sql_texts(toks):
    """The executable view of this level, then every nested level read as SQL:
    each dollar body, and each constant string passed directly to EXECUTE."""
    yield exec_view(toks)
    last_code = ""
    for kind, raw, body in toks:
        nested = None
        if kind == "dollar":
            nested = body
        elif kind == "squote" and re.search(r"\bEXECUTE\s*$", last_code, re.I):
            nested = body
        if kind == "code":
            last_code = raw
        elif kind != "comment":
            last_code = ""
        if nested is None:
            continue
        try:
            yield from sql_texts(tokenize(nested))
        except Unterminated:
            yield nested

IDENT = r'(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)'
QNAME = IDENT + r'(?:\s*\.\s*' + IDENT + r')?'
MULTIWORD_TYPE_START = {"double", "character", "timestamp", "time", "bit", "interval", "national"}
ALIASES = {
    "int": "integer", "int4": "integer", "int8": "bigint", "int2": "smallint",
    "bool": "boolean", "varchar": "character varying", "float8": "double precision",
    "float4": "real", "timestamptz": "timestamp with time zone",
    "timestamp": "timestamp without time zone", "timetz": "time with time zone",
    "char": "character", "decimal": "numeric",
}

def norm_name(q):
    parts = [p.strip() for p in re.split(r'\.(?=(?:[^"]*"[^"]*")*[^"]*$)', q)]
    parts = [p[1:-1] if p.startswith('"') else p.lower() for p in parts]
    if len(parts) == 1:
        parts.insert(0, "public")
    return ".".join(parts)

def balanced(text, i):
    """text[i] == '(' -> (inner, index after ')'), or (None, i) if unbalanced."""
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "(":
            depth += 1
        elif text[j] == ")":
            depth -= 1
            if depth == 0:
                return text[i + 1:j], j + 1
    return None, i

def split_top(s):
    """Split on commas outside (), [] and quotes."""
    parts, depth, cur, quote = [], 0, "", None
    for c in s:
        if quote:
            if c == quote:
                quote = None
        elif c in "'\"":
            quote = c
        elif c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append(cur); cur = ""; continue
        cur += c
    if cur.strip():
        parts.append(cur)
    return parts

def norm_type(arg):
    a = re.split(r"\s+DEFAULT\s+|\s*=\s*", arg.strip(), maxsplit=1, flags=re.I)[0]
    a = re.sub(r"\([^)]*\)", "", a)                    # typmods: varchar(10)
    toks = a.split()
    if toks and toks[0].lower() in ("in", "out", "inout", "variadic"):
        if toks[0].lower() == "out":
            return None                                 # OUT args are not part of the signature
        toks = toks[1:]
    if len(toks) >= 2 and toks[0].lower().strip('"') not in MULTIWORD_TYPE_START:
        toks = toks[1:]                                 # drop the parameter name
    t = " ".join(toks).lower().replace('"', "")
    t = re.sub(r"^(public|pg_catalog)\.", "", t)
    arr = ""
    while t.endswith("[]"):
        arr += "[]"; t = t[:-2].strip()
    return ALIASES.get(t, t) + arr

def sig(argstr):
    return tuple(x for x in (norm_type(a) for a in split_top(argstr)) if x is not None)

def created_objects(code):
    funcs, rels = {}, set()
    for m in re.finditer(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(" + QNAME + r")\s*\(", code, re.I):
        inner, _ = balanced(code, m.end() - 1)
        funcs.setdefault(norm_name(m.group(1)), set()).add(sig(inner) if inner is not None else None)
    for m in re.finditer(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY|UNLOGGED)\s+)?"
                         r"(TABLE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?(" + QNAME + r")", code, re.I):
        kind = "schema" if m.group(1).upper() == "SCHEMA" else "relation"
        name = m.group(2)
        rels.add((kind, name.strip('"').lower() if kind == "schema" else norm_name(name)))
    return funcs, rels

GRANTEE_PUBLIC = re.compile(r'(?:^|,)\s*(?:GROUP\s+)?"?public"?\s*(?=,|$)', re.I)
DROP_FN = re.compile(r"\bDROP\s+FUNCTION\b(?:\s+IF\s+EXISTS\b)?\s*(.*)", re.I)

def revoke_hits(st, funcs, rels):
    m = re.search(r"\bREVOKE\b(.*?)\bON\b\s+(.*)\bFROM\b\s+(.*)$", st, re.I)
    if not m or re.search(r"\bDEFAULT\s+PRIVILEGES\b", st[:m.start()], re.I):
        return []                                       # default privileges: future objects only
    grantees = re.split(r"\s+(?:CASCADE|RESTRICT|GRANTED\s+BY)\b", m.group(3), flags=re.I)[0]
    if not GRANTEE_PUBLIC.search(grantees):
        return []
    hits = []
    on = m.group(2).strip()
    bulk = re.match(r"ALL\s+(FUNCTIONS|ROUTINES|PROCEDURES|TABLES|SEQUENCES)\s+IN\s+SCHEMA\s+(.*)", on, re.I)
    if bulk:
        kind = "function" if bulk.group(1).upper() in ("FUNCTIONS", "ROUTINES", "PROCEDURES") else "table"
        return [(kind, "ALL " + bulk.group(1).upper() + " IN SCHEMA " + bulk.group(2).strip())]
    km = re.match(r"(FUNCTION|ROUTINE|PROCEDURE|SCHEMA|SEQUENCE|TABLE|DATABASE|TYPE|DOMAIN|LANGUAGE|"
                  r"FOREIGN\s+DATA\s+WRAPPER|FOREIGN\s+SERVER|LARGE\s+OBJECT|TABLESPACE)\b\s*", on, re.I)
    word = km.group(1).upper() if km else "TABLE"
    rest = on[km.end():] if km else on
    if word in ("FUNCTION", "ROUTINE", "PROCEDURE"):
        for target in split_top(rest):
            target = target.strip()
            tm = re.match(r"(" + QNAME + r")\s*(\(.*\))?$", target, re.S)
            if not tm:
                hits.append(("function", target or "?")); continue
            name = norm_name(tm.group(1))
            want = sig(tm.group(2)[1:-1]) if tm.group(2) else None
            have = funcs.get(name, set())
            if have and (want is None or want in have):  # narrowing: created in this file
                continue
            hits.append(("function", name + (tm.group(2) or "")))
    else:
        kind = {"TABLE": "table", "SEQUENCE": "sequence", "SCHEMA": "schema"}.get(word, word.lower())
        for target in split_top(rest):
            target = target.strip()
            if word == "SCHEMA":
                if ("schema", target.strip('"').lower()) in rels:
                    continue
            elif re.fullmatch(QNAME, target) and ("relation", norm_name(target)) in rels:
                continue
            hits.append((kind, target or "?"))
    return hits

def analyze(toks):
    funcs, rels = created_objects(exec_view(toks))     # top-level executable CREATEs only
    hits = []
    for text in sql_texts(toks):
        for stmt in text.split(";"):
            st = " ".join(stmt.split())
            dm = DROP_FN.search(st)
            if dm:
                hits.append(("drop", dm.group(1) or "?"))
            hits.extend(("revoke",) + h for h in revoke_hits(st, funcs, rels))
    return hits

def clean(s):
    return re.sub(r"[<>|]", "_", " ".join(s.split()))[:160]

mode, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8", errors="replace") as f:
    text = f.read()
try:
    toks = tokenize(text)
except Unterminated as e:
    sys.stderr.write("  unterminated " + str(e) + " at end of file\n")
    sys.exit(2)
if mode == "strip":
    sys.stdout.write(strip_view(toks))
elif mode == "analyze":
    for h in analyze(toks):
        print("\t".join(clean(x) for x in h))
else:
    sys.exit("unknown mode " + mode)
PY
)
sql_helper() { python3 -c "$SQL_HELPER" "$@"; }

FAIL=0
for FILE in "$@"; do
  [ -f "$FILE" ] || continue
  if ! CODE=$(sql_helper strip "$FILE") || ! HITS=$(sql_helper analyze "$FILE"); then
    echo "  ERROR: $(basename "$FILE"): SQL helper failed (python3 missing, or unterminated SQL) — failing closed."
    exit 2
  fi
  SHAPE_HIT=0
  grep -qiE "$BREAKING_SHAPES" <<<"$CODE" && SHAPE_HIT=1
  if [ "$SHAPE_HIT" = 1 ] || [ -n "$HITS" ]; then
    if grep -qiE '^[[:space:]]*-- requires-frontend:[[:space:]]*[0-9a-fA-F]{7,40}' "$FILE" \
       || grep -qiE '^[[:space:]]*-- client-safe:[[:space:]]*[^[:space:]]' "$FILE"; then
      echo "  ok: $(basename "$FILE") (client-breaking shapes, annotation present)"
    else
      echo "  VIOLATION: $(basename "$FILE") contains client-breaking SQL but no coupling annotation."
      # tr: echoed SQL must not re-introduce redirect-parseable tokens (P783)
      grep -nE "$BREAKING_SHAPES" -i <<<"$CODE" | head -5 | sed -E 's/[[:space:]]+$//' | tr '<>|' '___' | sed 's/^/    /'
      while IFS=$'\t' read -r WHAT A B; do
        case "$WHAT" in
          drop)   echo "    DROP FUNCTION $A" ;;
          revoke) echo "    REVOKE ... FROM PUBLIC on a $A this file does not create: $B" ;;
        esac
      done <<<"$HITS"
      echo "    Add one of these header comments:"
      echo "      -- requires-frontend: {frontend-commit-sha}   (migrate.sh blocks prod apply until deployed)"
      echo "      -- client-safe: {why deployed clients are unaffected}"
      FAIL=1
    fi
  fi
done

exit $FAIL
