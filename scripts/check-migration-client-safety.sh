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
# Shape detection reads a comment-free view: `--` and nesting-aware /* */ comments
# are blanked (string-, identifier- and dollar-quote-aware, newlines kept), so prose
# never trips the gate and a commented-out CREATE never narrows a real REVOKE.
#
# Known limitations:
#   - CREATE OR REPLACE FUNCTION with a new argument list (an overload) is NOT
#     detected; the correct authoring shape is DROP FUNCTION then CREATE, which is.
#   - Dynamic SQL (DO blocks, EXECUTE format(...)) is matched only as literal text:
#     a statement assembled from fragments can be missed; a REVOKE whose target
#     cannot be parsed (e.g. built with %I) is flagged, never assumed created.
#   - FROM "PUBLIC" (quoted) is treated as PUBLIC and flagged (fail-closed).
#   - Argument-type comparison normalizes common aliases (int/int4, bool,
#     varchar, timestamptz, ...) only; an unrecognized spelling difference flags.
#
# Usage: check-migration-client-safety.sh <migration.sql> [...]
# Exit: 0 = all files pass; 1 = at least one violation (report on stdout);
#       2 = the SQL helper failed (python3 missing or crashed) — fails closed.
# Called by pre-commit-checks.sh for newly staged migrations. P886 incident.
#
# Output contract: status lines contain no redirect-parseable tokens (P783).

set -e

BREAKING_SHAPES='REVOKE[[:space:]].*FROM.*(anon|authenticated)|DROP[[:space:]]+POLICY|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+COLUMN|ALTER[[:space:]]+COLUMN.*TYPE|DROP[[:space:]]+FUNCTION'

# SQL helper (python3 stdlib only — already required by check-rls-scope.py, whose
# tokenizer this mirrors). Modes:
#   strip <file>          the file with comments blanked, newlines preserved
#   revoke-public <file>  one line per REVOKE ... FROM PUBLIC on an object the file
#                         does not create: "<kind>  <target>" (P783-sanitized)
SQL_HELPER=$(cat <<'PY'
import re, sys

DOLLAR_TAG = re.compile(r"\$([^\W\d]\w*)?\$")

def strip_comments(text):
    out, i, n = [], 0, len(text)
    state, depth, tags = "normal", 0, []
    def blank(c):
        return c if c == "\n" else " "
    while i < n:
        ch = text[i]
        if state == "block":
            if text.startswith("/*", i):
                depth += 1; out.append("  "); i += 2; continue
            if text.startswith("*/", i):
                depth -= 1; out.append("  "); i += 2
                if depth == 0:
                    state = "normal"
                continue
            out.append(blank(ch)); i += 1; continue
        if state in ("squote", "estring", "dquote"):
            # A dollar-quoted body ends at its tag even if a quote inside it was
            # unbalanced (e.g. COMMENT ... IS $$it's$$): keeps the error local.
            if tags and text.startswith(tags[-1], i):
                out.append(tags[-1]); i += len(tags[-1]); tags.pop(); state = "normal"; continue
            if state == "estring" and ch == "\\" and i + 1 < n:
                out.append(text[i:i + 2]); i += 2; continue
            close = '"' if state == "dquote" else "'"
            if ch == close:
                if i + 1 < n and text[i + 1] == close:
                    out.append(text[i:i + 2]); i += 2; continue
                state = "normal"
            out.append(ch); i += 1; continue
        # normal (top level or inside a dollar-quoted body, which is SQL/plpgsql)
        if text.startswith("/*", i):
            state, depth = "block", 1; out.append("  "); i += 2; continue
        if text.startswith("--", i):
            while i < n and text[i] != "\n":
                out.append(" "); i += 1
            continue
        if ch == "'":
            prev = text[i - 1] if i else ""
            prev2 = text[i - 2] if i > 1 else ""
            state = "estring" if prev in "Ee" and prev and not (prev2.isalnum() or prev2 == "_") else "squote"
            out.append(ch); i += 1; continue
        if ch == '"':
            state = "dquote"; out.append(ch); i += 1; continue
        m = DOLLAR_TAG.match(text, i)
        if m:
            tag = m.group(0)
            if tags and tag == tags[-1]:
                tags.pop()
            else:
                tags.append(tag)
            out.append(tag); i = m.end(); continue
        out.append(ch); i += 1
    return "".join(out)

IDENT = r'(?:"[^"]+"|[A-Za-z_][\w$]*)'
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
    parts, depth, cur = [], 0, ""
    for c in s:
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        if c == "," and depth == 0:
            parts.append(cur); cur = ""
        else:
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

def revoke_public_hits(code):
    funcs, rels = created_objects(code)
    hits = []
    for stmt in code.split(";"):
        st = " ".join(stmt.split())
        m = re.search(r"\bREVOKE\b(.*?)\bON\b\s+(.*)\bFROM\b\s+(.*)$", st, re.I)
        if not m or re.search(r"\bDEFAULT\s+PRIVILEGES\b", st[:m.start()], re.I):
            continue                                    # default privileges: future objects only
        grantees = re.split(r"\s+(?:CASCADE|RESTRICT|GRANTED\s+BY)\b", m.group(3), flags=re.I)[0]
        if not GRANTEE_PUBLIC.search(grantees):
            continue
        on = m.group(2).strip()
        bulk = re.match(r"ALL\s+(FUNCTIONS|ROUTINES|PROCEDURES|TABLES|SEQUENCES)\s+IN\s+SCHEMA\s+(.*)", on, re.I)
        if bulk:
            kind = "function" if bulk.group(1).upper() in ("FUNCTIONS", "ROUTINES", "PROCEDURES") else "table"
            hits.append((kind, "ALL " + bulk.group(1).upper() + " IN SCHEMA " + bulk.group(2).strip()))
            continue
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

mode, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8", errors="replace") as f:
    code = strip_comments(f.read())
if mode == "strip":
    sys.stdout.write(code)
elif mode == "revoke-public":
    for kind, target in revoke_public_hits(code):
        print(kind + "\t" + re.sub(r"[<>|]", "_", " ".join(target.split()))[:160])
else:
    sys.exit("unknown mode " + mode)
PY
)
sql_helper() { python3 -c "$SQL_HELPER" "$@"; }

FAIL=0
for FILE in "$@"; do
  [ -f "$FILE" ] || continue
  if ! CODE=$(sql_helper strip "$FILE") || ! REVOKE_HITS=$(sql_helper revoke-public "$FILE"); then
    echo "  ERROR: $(basename "$FILE"): SQL helper failed (python3 required) — failing closed."
    exit 2
  fi
  SHAPE_HIT=0
  grep -qiE "$BREAKING_SHAPES" <<<"$CODE" && SHAPE_HIT=1
  if [ "$SHAPE_HIT" = 1 ] || [ -n "$REVOKE_HITS" ]; then
    if grep -qiE '^[[:space:]]*-- requires-frontend:[[:space:]]*[0-9a-fA-F]{7,40}' "$FILE" \
       || grep -qiE '^[[:space:]]*-- client-safe:[[:space:]]*[^[:space:]]' "$FILE"; then
      echo "  ok: $(basename "$FILE") (client-breaking shapes, annotation present)"
    else
      echo "  VIOLATION: $(basename "$FILE") contains client-breaking SQL but no coupling annotation."
      # tr: echoed SQL must not re-introduce redirect-parseable tokens (P783)
      grep -nE "$BREAKING_SHAPES" -i <<<"$CODE" | head -5 | sed -E 's/[[:space:]]+$//' | tr '<>|' '___' | sed 's/^/    /'
      while IFS=$'\t' read -r KIND TARGET; do
        [ -n "$KIND" ] && echo "    REVOKE ... FROM PUBLIC on a $KIND this file does not create: $TARGET"
      done <<<"$REVOKE_HITS"
      echo "    Add one of these header comments:"
      echo "      -- requires-frontend: {frontend-commit-sha}   (migrate.sh blocks prod apply until deployed)"
      echo "      -- client-safe: {why deployed clients are unaffected}"
      FAIL=1
    fi
  fi
done

exit $FAIL
