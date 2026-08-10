#!/usr/bin/env python3
"""P1039 authoring-side gate: unscoped RLS policy detector.

Prevents the P1035-class bug: a non-SELECT RLS policy whose USING/WITH CHECK
clause is a literal `true` (or a role-identity function like
current_setting('role') / auth.role()) intended to scope the policy, but
missing a `TO <role>` clause -- silently defaulting to PUBLIC, i.e. every
role including unauthenticated. This exact pattern has recurred once
already in this codebase's history (see the P1039 spec for the two-incident
timeline).

A flagged migration must declare its intent:
  -- intentionally-public: <reason>
      the author affirms the policy is deliberately open to all roles,
      mirroring the existing "-- client-safe: <reason>" convention
      (scripts/check-migration-client-safety.sh, P887). The annotation is
      file-level, same as check-migration-client-safety.sh -- it exempts
      every violation in that migration file, not just one policy.

Detected shape (best-effort, NOT exhaustive -- see P1039 Non-Goals):
  CREATE POLICY ... FOR <ALL|INSERT|UPDATE|DELETE>  (SELECT is never
  flagged -- public reads are a normal, common pattern in this schema)
  ... USING(true) or WITH CHECK(true), or referencing
  current_setting('role')/auth.role() ... with no TO <role> clause.

Statement boundaries and keyword matches are computed against a copy of the
file with single-quoted string literals and `--` comments blanked out, so a
semicolon or the word "TO" inside a string/comment can't corrupt detection.

Scope: only newly staged migration files (git diff --cached, filter=A) --
not a retroactive scan of migration history (P1038 covers existing gaps).

Usage: check-rls-scope.py <migration.sql> [...]
Exit: 0 = all files pass; 1 = at least one violation (report on stdout).
Called by pre-commit-checks.sh for newly staged migrations.
"""
import os
import re
import sys

ANNOTATION_RE = re.compile(
    r"^[ \t]*--[ \t]*intentionally-public:[ \t]*\S", re.MULTILINE | re.IGNORECASE
)
POLICY_START_RE = re.compile(r"CREATE\s+POLICY\b", re.IGNORECASE)
COMMAND_RE = re.compile(r"\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)
TO_CLAUSE_RE = re.compile(r"\bTO\b\s*\S", re.IGNORECASE)
LITERAL_TRUE_RE = re.compile(r"\b(USING|WITH\s+CHECK)\s*\(\s*true\s*\)", re.IGNORECASE)
# Anchored on the *exact* quoted setting name so 'rolename'/'app.role' (a
# substring, not the role-identity setting) don't false-positive (P1039
# review finding).
ROLE_IDENTITY_RE = re.compile(
    r"current_setting\s*\(\s*(['\"])role\1|auth\.role\s*\(", re.IGNORECASE
)
NAME_RE = re.compile(r'CREATE\s+POLICY\s+("[^"]+"|\S+)', re.IGNORECASE)


def _strip_strings_and_comments(text):
    """Blank the contents of single-quoted string literals and `-- ...`
    line comments (length/newlines preserved) so keyword matching only sees
    real SQL syntax -- never literal string content or comment prose.
    Doubled '' inside a string is an escaped quote, not a terminator
    (mirrors Postgres string-literal syntax).
    """
    out = []
    i = 0
    n = len(text)
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "'":
                if i + 1 < n and text[i + 1] == "'":
                    out.append("  ")
                    i += 2
                    continue
                in_string = False
                out.append(" ")
                i += 1
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue
        if ch == "'":
            in_string = True
            out.append(" ")
            i += 1
            continue
        if ch == "-" and i + 1 < n and text[i + 1] == "-":
            while i < n and text[i] != "\n":
                out.append(" ")
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def find_violations(content):
    """Return [(policy_name, command), ...] for unscoped role-restricting
    policies in raw migration `content`.

    Two representations are used deliberately, not one:
    - Statement boundaries and the TO-clause/command checks run against a
      blanked copy (strings + comments erased) so a semicolon or the word
      "TO" sitting inside a string literal or comment can't corrupt them.
    - The role-identity/literal-true checks run against the RAW statement
      text, because blanking would erase the very content they need to see
      (e.g. the quoted 'role' argument in current_setting('role')). These
      regexes are structurally specific enough (an exact function call, an
      exact bare-keyword parenthesized expression) that raw-text matching
      doesn't reintroduce a string-literal false-positive risk.
    """
    cleaned = _strip_strings_and_comments(content)
    violations = []
    for m in POLICY_START_RE.finditer(cleaned):
        start = m.start()
        end = cleaned.find(";", start)
        stmt_raw = content[start:] if end == -1 else content[start : end + 1]
        stmt_code_only = _strip_strings_and_comments(stmt_raw)

        cmd_match = COMMAND_RE.search(stmt_code_only)
        command = cmd_match.group(1).upper() if cmd_match else "ALL"  # FOR omitted = ALL (Postgres default)
        if command == "SELECT":
            continue

        if TO_CLAUSE_RE.search(stmt_code_only):
            continue

        risky = bool(LITERAL_TRUE_RE.search(stmt_raw)) or bool(ROLE_IDENTITY_RE.search(stmt_raw))
        if not risky:
            continue

        name_match = NAME_RE.search(stmt_raw)
        name = name_match.group(1) if name_match else "?"
        violations.append((name, command))
    return violations


def main(argv):
    fail = False
    for path in argv:
        try:
            with open(path) as f:
                content = f.read()
        except OSError:
            continue

        has_annotation = bool(ANNOTATION_RE.search(content))
        violations = find_violations(content)
        base = os.path.basename(path)

        if violations and not has_annotation:
            print(f"  {base}:")
            for name, command in violations:
                print(
                    f"  VIOLATION: policy {name} (FOR {command}) has no scoping TO clause "
                    f"(e.g. TO service_role) but its USING/WITH CHECK looks role-scoped "
                    f"(literal true or a role-identity function) -- defaults to PUBLIC, "
                    f"including unauthenticated."
                )
            print("    Add one of these:")
            print("      -- intentionally-public: {why this policy is deliberately open to all roles}")
            print("      Or scope it: CREATE POLICY ... TO service_role ...")
            fail = True
        else:
            print(f"  ok: {base} (no unscoped role-restricting policies)")

    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
