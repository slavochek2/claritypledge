#!/usr/bin/env python3
"""P1039 authoring-side gate: unscoped RLS policy detector.

Prevents the P1035-class bug: a non-SELECT RLS policy whose USING/WITH CHECK
clause is a literal `true` (or a role-identity function like
current_setting('role') / auth.role() / auth.jwt()->>'role')
intended to scope the policy, but missing a `TO <role>` clause (or whose TO
clause is PUBLIC) -- silently defaulting to PUBLIC, i.e. every role
including unauthenticated. This exact pattern has recurred once already in
this codebase's history (see the P1039 spec for the two-incident timeline).

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
  ... USING(true) or WITH CHECK(true), or referencing a role-identity
  function ... with no TO <role> clause, or a TO clause whose role list
  includes PUBLIC. ALTER POLICY ... TO PUBLIC (widening an existing
  policy) is flagged independently of CREATE POLICY.

Statement boundaries and keyword matches are computed against a copy of the
file with single-quoted strings, double-quoted identifiers, `/* */` block
comments (nesting-aware), `$$...$$`/`$tag$...$tag$` dollar-quoted strings,
and `--` line comments all blanked out (P1041 -- an earlier version handled
only single quotes and `--` comments; a policy's own double-quoted name, or
an apostrophe inside an unmodeled construct, could defeat detection
entirely). The role-identity/literal-true checks still run against the raw,
unblanked statement text -- blanking would erase the very content they need
to see (e.g. the quoted 'role' argument in current_setting('role')).

Scope: only newly staged migration files (git diff --cached) -- not a
retroactive scan of migration history (P1038 covers existing gaps).

Usage: check-rls-scope.py <migration.sql> [...]
Exit: 0 = all files pass; 1 = at least one violation (report on stdout).
Called by pre-commit-checks.sh for newly staged/modified migrations.
"""
import os
import re
import sys

ANNOTATION_RE = re.compile(
    r"^[ \t]*--[ \t]*intentionally-public:[ \t]*\S", re.MULTILINE | re.IGNORECASE
)
POLICY_START_RE = re.compile(r"CREATE\s+POLICY\b", re.IGNORECASE)
ALTER_POLICY_START_RE = re.compile(r"ALTER\s+POLICY\b", re.IGNORECASE)
COMMAND_RE = re.compile(r"\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)
TO_CLAUSE_RE = re.compile(r"\bTO\b\s*([^;]*?)(?=\bUSING\b|\bWITH\s+CHECK\b|;|$)", re.IGNORECASE)
TO_PUBLIC_RE = re.compile(r"\bpublic\b", re.IGNORECASE)
LITERAL_TRUE_RE = re.compile(r"\b(USING|WITH\s+CHECK)\s*\(\s*true\s*\)", re.IGNORECASE)
# Anchored on the *exact* quoted setting name (or a dotted path ending in
# .role, e.g. 'request.jwt.claim.role') so 'rolename'/'app.role' (a
# substring, not the role-identity setting) don't false-positive (P1039
# review finding), while still catching the realistic Supabase JWT-claim
# setting-name shapes (P1041 finding).
#
# Deliberately does NOT match bare current_role/current_user/session_user:
# these are general SQL identity primitives, not exclusively role-scoping
# checks, and a real migration in this repo
# (20260302130000_story_versions_insert_policy_v2.sql) uses
# `current_user = 'postgres'` as one legitimate branch of a broader boolean
# WITH CHECK alongside a real ownership check -- flagging it would be a
# false positive on correctly-designed policy, not the P1035 shape.
ROLE_IDENTITY_RE = re.compile(
    r"current_setting\s*\(\s*(['\"])(role|[\w.]*\.role)\1"
    r"|auth\.role\s*\("
    r"|auth\.jwt\s*\(\s*\)\s*->>?\s*(['\"])role\3",
    re.IGNORECASE,
)
NAME_RE = re.compile(r'(?:CREATE|ALTER)\s+POLICY\s+("[^"]+"|\S+)', re.IGNORECASE)

_DOLLAR_TAG_RE = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$")


def _strip_noise(text):
    """Blank single-quoted strings, double-quoted identifiers, nesting-aware
    `/* */` block comments, `$$...$$`/`$tag$...$tag$` dollar-quoted strings,
    and `--` line comments (length/newlines preserved) so keyword matching
    only sees real SQL syntax -- never literal content, an identifier's own
    text, or comment prose.
    """
    out = []
    i = 0
    n = len(text)
    state = "normal"  # normal | squote | dquote | block_comment | dollar_quote
    block_depth = 0
    dollar_tag = None
    while i < n:
        ch = text[i]

        if state == "squote":
            if ch == "'":
                if i + 1 < n and text[i + 1] == "'":
                    out.append("  ")
                    i += 2
                    continue
                out.append(" ")
                state = "normal"
                i += 1
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue

        if state == "dquote":
            if ch == '"':
                out.append(" ")
                state = "normal"
                i += 1
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue

        if state == "block_comment":
            if ch == "/" and i + 1 < n and text[i + 1] == "*":
                block_depth += 1
                out.append("  ")
                i += 2
                continue
            if ch == "*" and i + 1 < n and text[i + 1] == "/":
                block_depth -= 1
                out.append("  ")
                i += 2
                if block_depth == 0:
                    state = "normal"
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue

        if state == "dollar_quote":
            if text.startswith(dollar_tag, i):
                out.append(" " * len(dollar_tag))
                i += len(dollar_tag)
                state = "normal"
                dollar_tag = None
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue

        # state == "normal"
        if ch == "'":
            state = "squote"
            out.append(" ")
            i += 1
            continue
        if ch == '"':
            state = "dquote"
            out.append(" ")
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            state = "block_comment"
            block_depth = 1
            out.append("  ")
            i += 2
            continue
        if ch == "-" and i + 1 < n and text[i + 1] == "-":
            while i < n and text[i] != "\n":
                out.append(" ")
                i += 1
            continue
        m = _DOLLAR_TAG_RE.match(text, i)
        if m:
            dollar_tag = m.group(0)
            state = "dollar_quote"
            out.append(" " * len(dollar_tag))
            i = m.end()
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _to_clause_is_insufficient(stmt_code_only):
    """True if there's no TO clause, or its role list includes PUBLIC
    (PUBLIC is exactly the unscoped case this gate exists to catch)."""
    m = TO_CLAUSE_RE.search(stmt_code_only)
    if not m:
        return True
    return bool(TO_PUBLIC_RE.search(m.group(1)))


def find_violations(content):
    """Return [(policy_name, command), ...] for unscoped role-restricting
    CREATE POLICY statements, plus any ALTER POLICY ... TO PUBLIC widening.
    """
    cleaned = _strip_noise(content)
    violations = []

    for m in POLICY_START_RE.finditer(cleaned):
        start = m.start()
        end = cleaned.find(";", start)
        stmt_raw = content[start:] if end == -1 else content[start : end + 1]
        stmt_code_only = _strip_noise(stmt_raw)

        cmd_match = COMMAND_RE.search(stmt_code_only)
        command = cmd_match.group(1).upper() if cmd_match else "ALL"  # FOR omitted = ALL (Postgres default)
        if command == "SELECT":
            continue

        if not _to_clause_is_insufficient(stmt_code_only):
            continue

        risky = bool(LITERAL_TRUE_RE.search(stmt_raw)) or bool(ROLE_IDENTITY_RE.search(stmt_raw))
        if not risky:
            continue

        name_match = NAME_RE.search(stmt_raw)
        name = name_match.group(1) if name_match else "?"
        violations.append((name, command))

    for m in ALTER_POLICY_START_RE.finditer(cleaned):
        start = m.start()
        end = cleaned.find(";", start)
        stmt_code_only = cleaned[start:] if end == -1 else cleaned[start : end + 1]
        to_m = TO_CLAUSE_RE.search(stmt_code_only)
        if to_m and TO_PUBLIC_RE.search(to_m.group(1)):
            stmt_raw = content[start:] if end == -1 else content[start : end + 1]
            name_match = NAME_RE.search(stmt_raw)
            name = name_match.group(1) if name_match else "?"
            violations.append((name, "ALTER ... TO PUBLIC"))

    return violations


def main(argv):
    fail = False
    for path in argv:
        try:
            with open(path) as f:
                content = f.read()
        except OSError as exc:
            print(f"  ERROR: cannot read {path}: {exc}")
            fail = True
            continue

        has_annotation = bool(ANNOTATION_RE.search(content))
        violations = find_violations(content)
        base = os.path.basename(path)

        if violations and not has_annotation:
            print(f"  {base}:")
            for name, command in violations:
                print(
                    f"  VIOLATION: policy {name} ({command}) has no scoping TO clause "
                    f"(e.g. TO service_role) -- either missing entirely or including PUBLIC "
                    f"-- but its USING/WITH CHECK looks role-scoped (literal true or a "
                    f"role-identity function) -- defaults to PUBLIC, including unauthenticated."
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
